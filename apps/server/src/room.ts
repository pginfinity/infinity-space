import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import {
  ANIMS,
  DEFAULT_LOOK,
  EMOTES,
  HELD_ITEMS,
  NOTE_MAX,
  NavGrid,
  POSE_HZ,
  PROTOCOL_VERSION,
  RUN_SPEED,
  ZoneIndex,
  buildStationMap,
  dist,
  wallBetween,
  recGroup,
  recIdentity,
  type Emote,
  type HeldItem,
  type AvatarLook,
  type ClientMsg,
  type InfoPatch,
  type MapDef,
  type PlayerInfo,
  type PoseTuple,
  type ServerMsg,
  type Status,
  type Vec2,
} from "@infinity/world";
import { decode, encode } from "./codec.ts";
import { cleanLook, cleanName } from "./clean.ts";
import { GamesManager } from "./games/manager.ts";
import { RTC, rtcToken } from "./rtc.ts";
import { ActivitiesManager } from "./activities/manager.ts";
import type { Activity } from "./activities/types.ts";
import { DATA_DIR, Store } from "./store.ts";
import { RecordingActivity } from "./recording/manager.ts";
import { MEGAFONE_ID, PORTAS_ID, audienceOf, type AudiencePerson, type MegafoneState, type Zone } from "@infinity/world";
import type { PrivacySource } from "./activities/portas/index.ts";

interface Member {
  info: PlayerInfo;
  /** E-mail da conta (só com login ligado; nunca vai para os outros clientes). */
  email?: string;
  socket: WebSocket;
  x: number;
  z: number;
  yaw: number;
  anim: number;
  lastPoseAt: number;
  lastEmoteAt: number;
  dirty: boolean;
  alive: boolean;
  /** Última lista "quem pode te ouvir" enviada (para só mandar quando mudar). */
  audience: string;
  /** Última lista "quem pode te ver" enviada durante um sussurro ("" = igual à de ouvir). */
  sight: string;
}

const EMOTE_SET: ReadonlySet<string> = new Set(EMOTES);

const STATUSES: ReadonlySet<Status> = new Set(["available", "listening", "focus", "away"]);
const SIT = ANIMS.indexOf("sit");
const HELD_SET: ReadonlySet<string> = new Set(HELD_ITEMS);

/**
 * A sala do escritório. Guarda quem está onde e retransmite as poses.
 * `training`: a sala de treino do tutorial (o mesmo mapa, outra sala): lê os dados de verdade sem gravar,
 * sem gravador de reunião e com voz e vídeo numa sala própria do LiveKit. Quem treina não aparece no escritório.
 */
export class OfficeRoom {
  readonly map: MapDef = buildStationMap();
  readonly nav = NavGrid.fromMap(this.map);
  readonly zones = new ZoneIndex(this.map.zones);
  private readonly members = new Map<string, Member>();
  readonly games = new GamesManager(this.map, {
    broadcast: (msg) => this.broadcast(msg),
    broadcastEach: (msgFor) => this.broadcastEach(msgFor),
    playerName: (id) => this.members.get(id)?.info.name,
    playerPos: (id) => {
      const m = this.members.get(id);
      return m ? { x: m.x, z: m.z } : undefined;
    },
    claimSeat: (id) => this.claimSeat(id, null),
    notify: (id, text) => this.notify(id, text),
  });
  readonly store = new Store(DATA_DIR);
  readonly acts = new ActivitiesManager(
    {
      map: this.map,
      nav: this.nav,
      zones: this.zones,
      store: this.store,
      event: (act, ev, data, opts) => {
        const msg: ServerMsg = { t: "actev", id: act.id, ev, ...(data === undefined ? {} : { data }), ...(opts?.from ? { from: opts.from } : {}) };
        if (!opts?.to) return this.broadcast(msg);
        const enc = encode(msg);
        for (const id of opts.to) {
          const m = this.members.get(id);
          if (m && m.socket.readyState === m.socket.OPEN) m.socket.send(enc);
        }
      },
      players: () => [...this.members.keys()],
      playerName: (id) => this.members.get(id)?.info.name,
      playerPos: (id) => {
        const m = this.members.get(id);
        return m ? { x: m.x, z: m.z } : undefined;
      },
      playerZone: (id) => {
        const m = this.members.get(id);
        return m ? this.zones.zoneAt({ x: m.x, z: m.z }) : undefined;
      },
      emote: (id, e) => {
        if (this.members.has(id) && EMOTE_SET.has(e)) this.broadcast({ t: "emote", id, e });
      },
      setHeld: (id, item) => {
        const m = this.members.get(id);
        if (!m) return;
        const held = item && HELD_SET.has(item) ? item : undefined;
        if (m.info.held === held) return;
        m.info.held = held;
        this.broadcast({ t: "info", id, patch: { held } });
      },
      objects: (type) => this.map.objects.filter((o) => o.type === type),
      claimSeat: (id, here) => this.claimSeat(id, here),
      notify: (id, text) => this.notify(id, text),
      hearers: (id) => this.hearersOf(id),
      teleport: (id, p) => this.teleport(id, p),
      playerEmail: (id) => this.members.get(id)?.email,
      near: (id, p, range) => {
        const m = this.members.get(id);
        if (!m) return false;
        const at = { x: m.x, z: m.z };
        return dist(at, p) <= range && !wallBetween(this.map.walls, at, p);
      },
    },
    (act) => this.broadcast({ t: "act", act }),
  );
  private recording: RecordingActivity | null = null;
  /** Privacidade de conversa (pacote portas): portas fechadas, rodas e sussurros. */
  private privacy: PrivacySource | null = null;
  private readonly seatPoints: Vec2[] = this.map.objects.filter((o) => o.interact?.action === "sit").map((o) => o.interact!.point);
  private tickTimer: NodeJS.Timeout | undefined;
  private heartbeatTimer: NodeJS.Timeout | undefined;

  constructor(readonly training = false) {
    this.store.readOnly = training;
  }

  /** Carrega os pacotes de atividades. Chame antes de `start`. */
  async init(): Promise<void> {
    await this.acts.load();
    // Gravação de reuniões: precisa da sala (quem está em cada grupo de salas e as listas de áudio).
    if (!this.training) {
      const [rec] = this.acts.add((host) => [new RecordingActivity(host, { membersIn: (g) => this.membersIn(g) })], "gravacao");
      this.recording = rec as RecordingActivity;
    }
    // Portas, roda fechada e sussurro: entram na audição e na validação de pose.
    const portas = this.acts.get(PORTAS_ID) as Partial<PrivacySource> | undefined;
    if (portas?.privacy && portas.mayStand && portas.exitOf && portas.onPrivacyChange) {
      this.privacy = portas as PrivacySource;
      this.privacy.onPrivacyChange(() => this.updateAudiences());
    }
  }

  /** A pessoa pode estar aqui? (sala de porta fechada ou trancada só para quem foi admitido) */
  private mayStand(id: string, p: Vec2): boolean {
    return !this.privacy || this.privacy.mayStand(id, this.zones.zoneAt(p));
  }

  /**
   * Uma pessoa vai sentar num jogo (`here`; null = mesas de tabuleiro). Nos outros jogos: se estava só
   * esperando, sai do lugar; se está no meio de uma partida, devolve o nome do jogo e não pode sentar.
   */
  private claimSeat(id: string, here: Activity | null): string | null {
    if (here !== null) {
      const g = this.games.seatInfo(id);
      if (g) {
        if (g.playing) return g.label;
        this.games.releaseSeat(id);
      }
    }
    for (const a of this.acts.all()) {
      if (a === here || !a.seatLabel) continue;
      const label = a.seatLabel(id);
      if (!label) continue;
      if (a.inMatchFor?.(id)) return label;
      a.releaseSeat?.(id);
    }
    return null;
  }

  /** Aviso curto só para uma pessoa (o cliente mostra como toast). */
  private notify(id: string, text: string): void {
    const m = this.members.get(id);
    if (m) this.sendTo(m, { t: "actev", id: "sistema", ev: "aviso", data: { text: text.slice(0, 200) } });
  }

  /** Derruba as conexões de uma conta (pessoa removida pelo admin). */
  disconnectEmail(email: string): void {
    for (const m of this.members.values()) if (m.email === email) m.socket.close(4001, "removed");
  }

  /** Ids de quem está num grupo de salas (ex.: "aud" = auditório + palco). */
  membersIn(group: string): string[] {
    const ids: string[] = [];
    for (const m of this.members.values()) {
      const z = this.zones.zoneAt({ x: m.x, z: m.z });
      if (z && recGroup(z) === group) ids.push(m.info.id);
    }
    return ids;
  }

  start(): void {
    this.tickTimer = setInterval(() => this.tick(), 1000 / POSE_HZ);
    this.heartbeatTimer = setInterval(() => this.heartbeat(), 15_000);
  }

  stop(): void {
    clearInterval(this.tickTimer);
    clearInterval(this.heartbeatTimer);
    this.acts.dispose();
    this.store.flush();
    for (const m of this.members.values()) m.socket.close(1001, "server shutdown");
  }

  get size(): number {
    return this.members.size;
  }

  /** Uma conexão nova. A pessoa só entra na sala depois do "hello". */
  accept(socket: WebSocket, auth?: { email: string; name: string }): void {
    let member: Member | undefined;
    const send = (msg: ServerMsg) => socket.readyState === socket.OPEN && socket.send(encode(msg));

    socket.on("pong", () => {
      if (member) member.alive = true;
    });

    socket.on("message", (raw, isBinary) => {
      if (!isBinary) return;
      const msg = decode(raw as Buffer);
      if (!msg) return;
      if (!member) {
        if (msg.t !== "hello") return;
        if (msg.v !== PROTOCOL_VERSION) {
          send({ t: "error", code: "version", message: "Versão do app desatualizada. Recarregue a página." });
          socket.close(4000, "version");
          return;
        }
        member = this.join(socket, msg, auth);
        return;
      }
      this.handle(member, msg);
    });

    socket.on("close", () => {
      if (member) this.leave(member);
    });
    socket.on("error", () => socket.terminate());
  }

  private join(socket: WebSocket, hello: Extract<ClientMsg, { t: "hello" }>, auth?: { email: string; name: string }): Member {
    const id = randomUUID().slice(0, 8);
    const back = hello.at && Number.isFinite(hello.at.x) && Number.isFinite(hello.at.z) ? { x: hello.at.x, z: hello.at.z } : null;
    // Voltando de uma reconexão: no mesmo lugar se for andável. Sala de porta fechada não: o id é novo,
    // então a pessoa volta do lado de fora da porta e bate de novo.
    const barred = back && !this.mayStand(id, back) ? this.zones.zoneAt(back) : undefined;
    const door = barred ? this.privacy?.exitOf(barred.id, back ?? undefined) : undefined;
    const spawn = back && !barred && this.nav.isWalkable(back) ? back : ((door && this.nav.nearestWalkable(door, 2)) ?? this.freeSpawn());
    const member: Member = {
      info: {
        id,
        // Com login, o nome vem da conta.
        name: auth ? cleanName(auth.name) : cleanName(hello.name),
        look: cleanLook(hello.look),
        status: "available",
        lens: hello.lens === "3d" ? "3d" : "2d",
        mic: false,
        cam: false,
        screen: false,
      },
      socket,
      email: auth?.email,
      x: spawn.x,
      z: spawn.z,
      yaw: 0,
      anim: 0,
      lastPoseAt: Date.now(),
      lastEmoteAt: 0,
      dirty: false,
      alive: true,
      audience: "",
      sight: "",
    };
    this.members.set(id, member);

    const others = [...this.members.values()].filter((m) => m !== member);
    this.sendTo(member, {
      t: "welcome",
      you: id,
      map: { id: this.map.id, version: this.map.version },
      players: [...this.members.values()].map((m) => m.info),
      poses: [...this.members.values()].map(pose),
      serverTime: Date.now(),
      // Cada um recebe a própria visão das mesas (mãos do dominó e do truco ficam escondidas).
      games: this.games.snapshots(id),
      acts: this.acts.snapshots(),
    });
    this.broadcast({ t: "join", player: member.info, pose: pose(member) }, member);
    this.acts.join(id);
    console.log(`[sala] entrou ${member.info.name} (${id}) · ${this.members.size} online · ${others.length} já estavam`);
    return member;
  }

  private leave(member: Member): void {
    if (!this.members.delete(member.info.id)) return;
    this.games.leave(member.info.id);
    this.acts.leave(member.info.id);
    this.broadcast({ t: "leave", id: member.info.id });
    console.log(`[sala] saiu ${member.info.name} (${member.info.id}) · ${this.members.size} online`);
  }

  private handle(m: Member, msg: ClientMsg): void {
    switch (msg.t) {
      case "pose":
        this.onPose(m, msg);
        break;
      case "info":
        this.onInfo(m, msg.patch);
        break;
      case "emote":
        this.onEmote(m, msg.e);
        break;
      case "rtc":
        void rtcToken(m.info.id, m.info.name, this.training ? `${RTC.room}-treino` : RTC.room).then((token) => this.sendTo(m, { t: "rtc", url: RTC.publicUrl, token }));
        break;
      case "game":
        if (typeof msg.table === "string" && typeof msg.op === "string") this.games.handle(m.info.id, msg.table, msg.op, msg.data);
        break;
      case "act":
        if (typeof msg.id === "string" && typeof msg.op === "string") this.acts.handle(m.info.id, msg.id, msg.op, msg.data);
        break;
      case "ping":
        this.sendTo(m, { t: "pong", at: msg.at, serverTime: Date.now() });
        break;
      case "hello":
        break;
    }
  }

  /** Emotes com limite de um a cada 600 ms, para ninguém inundar a sala. */
  private onEmote(m: Member, e: Emote): void {
    if (!EMOTE_SET.has(e)) return;
    const now = Date.now();
    if (now - m.lastEmoteAt < 600) return;
    m.lastEmoteAt = now;
    this.broadcast({ t: "emote", id: m.info.id, e });
  }

  private onPose(m: Member, p: Extract<ClientMsg, { t: "pose" }>): void {
    if (![p.x, p.z, p.yaw, p.anim].every(Number.isFinite)) return;
    const now = Date.now();
    // Tempo desde a última pose aceita, com teto: sem ele, quem fica parado 10 s poderia "saltar"
    // 100 m de uma vez com um cliente modificado. 2,5 s cobrem um engasgo de rede comum; saltos
    // de verdade (chamado aceito) passam por `teleport`, autorizado pela atividade.
    const dt = Math.min(2.5, Math.max(0.001, (now - m.lastPoseAt) / 1000));
    const target = { x: p.x, z: p.z };
    const moved = dist({ x: m.x, z: m.z }, target);
    const anim = p.anim >= 0 && p.anim < ANIMS.length ? Math.trunc(p.anim) : 0;
    const seated = anim === SIT && this.seatPoints.some((s) => dist(s, target) < 0.9);
    // Folga para jitter de rede: 1,6x a velocidade de corrida + meio metro.
    const tooFast = moved > RUN_SPEED * 1.6 * dt + 0.5;
    // Porta fechada ou trancada: quem não foi admitido volta para o último lugar válido (do lado de fora).
    if (tooFast || (!seated && !this.nav.isWalkable(target)) || !this.mayStand(m.info.id, target)) {
      this.sendTo(m, { t: "correct", x: m.x, z: m.z });
      return;
    }
    m.x = p.x;
    m.z = p.z;
    m.yaw = p.yaw;
    m.anim = anim;
    m.lastPoseAt = now;
    m.dirty = true;
  }

  private onInfo(m: Member, patch: InfoPatch): void {
    const clean: InfoPatch = {};
    if (typeof patch.name === "string" && !m.email) clean.name = cleanName(patch.name);
    if (patch.look) clean.look = cleanLook(patch.look);
    if (patch.status && STATUSES.has(patch.status)) clean.status = patch.status;
    if (patch.lens === "2d" || patch.lens === "3d") clean.lens = patch.lens;
    for (const k of ["mic", "cam", "screen", "screenPaused"] as const) if (typeof patch[k] === "boolean") clean[k] = patch[k];
    // Status curto: texto livre e pequeno; vazio apaga.
    if (typeof patch.note === "string") clean.note = patch.note.replace(/[\u0000-\u001f]/g, "").trim().slice(0, NOTE_MAX);
    // Item na mão: só da lista conhecida (as atividades também podem colocar pelo servidor).
    if ("held" in patch) clean.held = typeof patch.held === "string" && HELD_SET.has(patch.held) ? (patch.held as HeldItem) : undefined;
    if (Object.keys(clean).length === 0) return;
    Object.assign(m.info, clean);
    this.broadcast({ t: "info", id: m.info.id, patch: clean });
  }

  private tickCount = 0;

  /**
   * Privacidade no servidor: para cada pessoa, quem pode ouvi-la agora (distância, salas fechadas,
   * paredes, palco, portas, roda fechada, sussurro). O cliente libera a própria voz, vídeo e tela só
   * para essa lista no LiveKit. A sala gravada inclui o gravador (menos sussurros).
   */
  private updateAudiences(): void {
    const list = [...this.members.values()];
    // Ninguém fica numa sala de porta fechada sem ter sido admitido (reconexão, teleporte): volta para fora.
    for (const m of list) {
      const zone = this.zones.zoneAt({ x: m.x, z: m.z });
      if (zone && !this.mayStand(m.info.id, { x: m.x, z: m.z })) this.putOutside(m, zone);
    }
    const people: AudiencePerson[] = list.map((m) => ({ id: m.info.id, pos: { x: m.x, z: m.z }, zone: this.zones.zoneAt({ x: m.x, z: m.z }) }));
    const opts = {
      privacy: this.privacy?.privacy(),
      recorderFor: (z: Zone) => (this.recording?.isRecording(recGroup(z)) ? recIdentity(recGroup(z)) : null),
    };
    const mega = this.megaphoneId();
    const megaOpts = { ...opts, megaphone: true };
    list.forEach((speaker, i) => {
      const { voice, sight } = audienceOf(this.map.walls, people, people[i]!, speaker.info.id === mega ? megaOpts : opts);
      // Sussurro: a voz vai só para uma pessoa, mas o vídeo e a tela continuam para quem já via.
      // Vai antes da lista de voz, para o vídeo dos outros não piscar na troca.
      const sightKey = sight === voice ? "" : sight.join(",");
      if (sightKey !== speaker.sight) {
        speaker.sight = sightKey;
        this.sendTo(speaker, { t: "actev", id: PORTAS_ID, ev: "vista", data: { ids: sightKey ? sight : null } });
      }
      const key = voice.join(",");
      if (key !== speaker.audience) {
        speaker.audience = key;
        this.sendTo(speaker, { t: "audience", ids: voice });
      }
    });
  }

  /** Quem ouve a voz desta pessoa agora (mesma regra das listas de áudio, sem o gravador). */
  private hearersOf(id: string): string[] {
    const list = [...this.members.values()];
    const people: AudiencePerson[] = list.map((m) => ({ id: m.info.id, pos: { x: m.x, z: m.z }, zone: this.zones.zoneAt({ x: m.x, z: m.z }) }));
    const speaker = people.find((p) => p.id === id);
    if (!speaker) return [];
    return audienceOf(this.map.walls, people, speaker, { privacy: this.privacy?.privacy(), megaphone: id === this.megaphoneId() }).voice;
  }

  /** Quem está com o megafone do gestor ligado (a voz chega a todas as áreas). */
  private megaphoneId(): string | undefined {
    return (this.acts.get(MEGAFONE_ID)?.snapshot() as MegafoneState | undefined)?.speaker?.id;
  }

  /** Salto autorizado por uma atividade (ex.: chamado aceito): só para lugar andável e permitido. */
  private teleport(id: string, p: Vec2): boolean {
    const m = this.members.get(id);
    if (!m || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return false;
    if (!this.nav.isWalkable(p) || !this.mayStand(id, p)) return false;
    m.x = p.x;
    m.z = p.z;
    m.anim = 0;
    m.lastPoseAt = Date.now();
    m.dirty = true;
    this.sendTo(m, { t: "correct", x: m.x, z: m.z });
    // As listas de áudio seguem a pessoa na hora (não espera o próximo ciclo).
    this.updateAudiences();
    return true;
  }

  /** Devolve a pessoa para o lado de fora da porta da sala. */
  private putOutside(m: Member, zone: Zone): void {
    const door = this.privacy?.exitOf(zone.id, { x: m.x, z: m.z });
    const spot = (door && this.nav.nearestWalkable(door, 2)) ?? this.freeSpawn();
    m.x = spot.x;
    m.z = spot.z;
    m.lastPoseAt = Date.now();
    m.dirty = true;
    this.sendTo(m, { t: "correct", x: m.x, z: m.z });
  }

  private tick(): void {
    this.games.tick(1 / POSE_HZ);
    this.acts.tick(1 / POSE_HZ);
    if (++this.tickCount % 3 === 0) this.updateAudiences();
    const list: PoseTuple[] = [];
    for (const m of this.members.values()) {
      if (!m.dirty) continue;
      m.dirty = false;
      list.push(pose(m));
    }
    if (list.length > 0) this.broadcast({ t: "poses", at: Date.now(), list });
  }

  private heartbeat(): void {
    for (const m of this.members.values()) {
      if (!m.alive) {
        m.socket.terminate();
        continue;
      }
      m.alive = false;
      m.socket.ping();
    }
  }

  private freeSpawn(): Vec2 {
    const spawns = this.map.spawns;
    for (const s of spawns) {
      if ([...this.members.values()].every((m) => dist(s, { x: m.x, z: m.z }) > 0.8)) return s;
    }
    return spawns[Math.floor(Math.random() * spawns.length)]!;
  }

  private sendTo(m: Member, msg: ServerMsg): void {
    if (m.socket.readyState === m.socket.OPEN) m.socket.send(encode(msg));
  }

  private broadcast(msg: ServerMsg, except?: Member): void {
    const data = encode(msg);
    for (const m of this.members.values()) {
      if (m !== except && m.socket.readyState === m.socket.OPEN) m.socket.send(data);
    }
  }

  /** Uma mensagem escolhida por pessoa (visão própria de um jogo). Mensagens iguais são codificadas uma vez. */
  private broadcastEach(msgFor: (id: string) => ServerMsg): void {
    const cache = new Map<ServerMsg, ReturnType<typeof encode>>();
    for (const m of this.members.values()) {
      if (m.socket.readyState !== m.socket.OPEN) continue;
      const msg = msgFor(m.info.id);
      let data = cache.get(msg);
      if (!data) {
        data = encode(msg);
        cache.set(msg, data);
      }
      m.socket.send(data);
    }
  }
}

function pose(m: Member): PoseTuple {
  return [m.info.id, round(m.x), round(m.z), round(m.yaw), m.anim];
}

const round = (n: number) => Math.round(n * 1000) / 1000;
