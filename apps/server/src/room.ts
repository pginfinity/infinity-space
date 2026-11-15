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
import { GamesManager } from "./games/manager.ts";
import { RTC, rtcToken } from "./rtc.ts";
import { ActivitiesManager } from "./activities/manager.ts";
import { DATA_DIR, Store } from "./store.ts";
import { RecordingActivity } from "./recording/manager.ts";
import { hearing } from "@infinity/world";

interface Member {
  info: PlayerInfo;
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
}

const EMOTE_SET: ReadonlySet<string> = new Set(EMOTES);

const HEX = /^#[0-9a-fA-F]{6}$/;
const STATUSES: ReadonlySet<Status> = new Set(["available", "listening", "focus", "away"]);
const SIT = ANIMS.indexOf("sit");
const HELD_SET: ReadonlySet<string> = new Set(HELD_ITEMS);

/** A sala única do escritório. Guarda quem está onde e retransmite as poses. */
export class OfficeRoom {
  readonly map: MapDef = buildStationMap();
  readonly nav = NavGrid.fromMap(this.map);
  readonly zones = new ZoneIndex(this.map.zones);
  private readonly members = new Map<string, Member>();
  readonly games = new GamesManager(this.map, {
    broadcast: (msg) => this.broadcast(msg),
    playerName: (id) => this.members.get(id)?.info.name,
    playerPos: (id) => {
      const m = this.members.get(id);
      return m ? { x: m.x, z: m.z } : undefined;
    },
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
  private readonly seatPoints: Vec2[] = this.map.objects.filter((o) => o.interact?.action === "sit").map((o) => o.interact!.point);
  private tickTimer: NodeJS.Timeout | undefined;
  private heartbeatTimer: NodeJS.Timeout | undefined;

  /** Carrega os pacotes de atividades. Chame antes de `start`. */
  async init(): Promise<void> {
    await this.acts.load();
    // Gravação de reuniões: precisa da sala (quem está em cada grupo de salas e as listas de áudio).
    const [rec] = this.acts.add((host) => [new RecordingActivity(host, { membersIn: (g) => this.membersIn(g) })], "gravacao");
    this.recording = rec as RecordingActivity;
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
  accept(socket: WebSocket): void {
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
        member = this.join(socket, msg);
        return;
      }
      this.handle(member, msg);
    });

    socket.on("close", () => {
      if (member) this.leave(member);
    });
    socket.on("error", () => socket.terminate());
  }

  private join(socket: WebSocket, hello: Extract<ClientMsg, { t: "hello" }>): Member {
    const id = randomUUID().slice(0, 8);
    const back = hello.at && Number.isFinite(hello.at.x) && Number.isFinite(hello.at.z) ? { x: hello.at.x, z: hello.at.z } : null;
    const spawn = back && this.nav.isWalkable(back) ? back : this.freeSpawn();
    const member: Member = {
      info: {
        id,
        name: cleanName(hello.name),
        look: cleanLook(hello.look),
        status: "available",
        lens: hello.lens === "3d" ? "3d" : "2d",
        mic: false,
        cam: false,
        screen: false,
      },
      socket,
      x: spawn.x,
      z: spawn.z,
      yaw: 0,
      anim: 0,
      lastPoseAt: Date.now(),
      lastEmoteAt: 0,
      dirty: false,
      alive: true,
      audience: "",
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
      games: this.games.snapshots(),
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
        void rtcToken(m.info.id, m.info.name).then((token) => this.sendTo(m, { t: "rtc", url: RTC.publicUrl, token }));
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
    const dt = Math.max(0.001, (now - m.lastPoseAt) / 1000);
    const target = { x: p.x, z: p.z };
    const moved = dist({ x: m.x, z: m.z }, target);
    const anim = p.anim >= 0 && p.anim < ANIMS.length ? Math.trunc(p.anim) : 0;
    const seated = anim === SIT && this.seatPoints.some((s) => dist(s, target) < 0.9);
    // Folga para jitter de rede: 1,6x a velocidade de corrida + meio metro.
    const tooFast = moved > RUN_SPEED * 1.6 * dt + 0.5;
    if (tooFast || (!seated && !this.nav.isWalkable(target))) {
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
    if (typeof patch.name === "string") clean.name = cleanName(patch.name);
    if (patch.look) clean.look = cleanLook(patch.look);
    if (patch.status && STATUSES.has(patch.status)) clean.status = patch.status;
    if (patch.lens === "2d" || patch.lens === "3d") clean.lens = patch.lens;
    for (const k of ["mic", "cam", "screen", "screenPaused"] as const) if (typeof patch[k] === "boolean") clean[k] = patch[k];
    // Status curto: texto livre e pequeno; vazio apaga.
    if (typeof patch.note === "string") clean.note = patch.note.replace(/[ -]/g, "").trim().slice(0, NOTE_MAX);
    // Item na mão: só da lista conhecida (as atividades também podem colocar pelo servidor).
    if ("held" in patch) clean.held = typeof patch.held === "string" && HELD_SET.has(patch.held) ? (patch.held as HeldItem) : undefined;
    if (Object.keys(clean).length === 0) return;
    Object.assign(m.info, clean);
    this.broadcast({ t: "info", id: m.info.id, patch: clean });
  }

  private tickCount = 0;

  /**
   * Privacidade no servidor: para cada pessoa, quem pode ouvi-la agora (distância, salas fechadas,
   * paredes, palco). O cliente libera a própria voz, vídeo e tela só para essa lista no LiveKit.
   */
  private updateAudiences(): void {
    const list = [...this.members.values()];
    const at = list.map((m) => ({ pos: { x: m.x, z: m.z }, zone: this.zones.zoneAt({ x: m.x, z: m.z }) }));
    list.forEach((speaker, i) => {
      const ids: string[] = [];
      list.forEach((listener, j) => {
        if (i !== j && hearing(this.map.walls, at[j]!, at[i]!).mode !== "none") ids.push(listener.info.id);
      });
      // Sala sendo gravada: a voz de quem está nela também vai para o gravador (oculto, só escuta).
      const zone = at[i]!.zone;
      if (zone && this.recording?.isRecording(recGroup(zone))) ids.push(recIdentity(recGroup(zone)));
      const key = ids.sort().join(",");
      if (key !== speaker.audience) {
        speaker.audience = key;
        this.sendTo(speaker, { t: "audience", ids });
      }
    });
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
}

function pose(m: Member): PoseTuple {
  return [m.info.id, round(m.x), round(m.z), round(m.yaw), m.anim];
}

const round = (n: number) => Math.round(n * 1000) / 1000;

function cleanName(name: unknown): string {
  const s = typeof name === "string" ? name.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 32) : "";
  return s || "Visitante";
}

/** Aceita só cores hex e índices pequenos; qualquer coisa estranha volta ao padrão. */
function cleanLook(look: unknown): AvatarLook {
  const l = (look ?? {}) as Partial<AvatarLook>;
  const hex = (v: unknown, d: string) => (typeof v === "string" && HEX.test(v) ? v : d);
  const idx = (v: unknown, d: number) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 32 ? v : d);
  const D = DEFAULT_LOOK;
  return {
    skin: hex(l.skin, D.skin),
    hair: idx(l.hair, D.hair),
    hairColor: hex(l.hairColor, D.hairColor),
    eyes: idx(l.eyes, D.eyes),
    brows: idx(l.brows, D.brows),
    mouth: idx(l.mouth, D.mouth),
    facial: idx(l.facial, D.facial),
    top: idx(l.top, D.top),
    topColor: hex(l.topColor, D.topColor),
    topColor2: hex(l.topColor2, D.topColor2),
    bottom: idx(l.bottom, D.bottom),
    bottomColor: hex(l.bottomColor, D.bottomColor),
    shoes: idx(l.shoes, D.shoes),
    shoesColor: hex(l.shoesColor, D.shoesColor),
    acc: Array.isArray(l.acc) ? [...new Set(l.acc.filter((a) => typeof a === "number" && Number.isInteger(a) && a >= 0 && a < 32))].slice(0, 4) : [],
    accColor: hex(l.accColor, D.accColor),
  };
}
