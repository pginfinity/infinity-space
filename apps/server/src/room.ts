import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import {
  ANIMS,
  DEFAULT_LOOK,
  EMOTES,
  NavGrid,
  POSE_HZ,
  PROTOCOL_VERSION,
  RUN_SPEED,
  ZoneIndex,
  buildStationMap,
  dist,
  type Emote,
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
}

const EMOTE_SET: ReadonlySet<string> = new Set(EMOTES);

const HEX = /^#[0-9a-fA-F]{6}$/;
const STATUSES: ReadonlySet<Status> = new Set(["available", "listening", "focus", "away"]);
const SIT = ANIMS.indexOf("sit");

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
  private readonly seatPoints: Vec2[] = this.map.objects.filter((o) => o.interact?.action === "sit").map((o) => o.interact!.point);
  private tickTimer: NodeJS.Timeout | undefined;
  private heartbeatTimer: NodeJS.Timeout | undefined;

  start(): void {
    this.tickTimer = setInterval(() => this.tick(), 1000 / POSE_HZ);
    this.heartbeatTimer = setInterval(() => this.heartbeat(), 15_000);
  }

  stop(): void {
    clearInterval(this.tickTimer);
    clearInterval(this.heartbeatTimer);
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
    });
    this.broadcast({ t: "join", player: member.info, pose: pose(member) }, member);
    console.log(`[sala] entrou ${member.info.name} (${id}) · ${this.members.size} online · ${others.length} já estavam`);
    return member;
  }

  private leave(member: Member): void {
    if (!this.members.delete(member.info.id)) return;
    this.games.leave(member.info.id);
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
      case "game":
        if (typeof msg.table === "string" && typeof msg.op === "string") this.games.handle(m.info.id, msg.table, msg.op, msg.data);
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
    for (const k of ["mic", "cam", "screen"] as const) if (typeof patch[k] === "boolean") clean[k] = patch[k];
    if (Object.keys(clean).length === 0) return;
    Object.assign(m.info, clean);
    this.broadcast({ t: "info", id: m.info.id, patch: clean });
  }

  private tick(): void {
    this.games.tick(1 / POSE_HZ);
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
