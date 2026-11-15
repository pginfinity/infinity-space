import { create } from "zustand";
import { dirOfYaw, dist, GAME_OF_TABLE, type GameSnapshot, type MapObject, type TableState, type Vec2 } from "@infinity/world";
import { send } from "../net/session.ts";
import { useApp } from "../state/store.ts";
import { self } from "../world/registry.ts";
import { S } from "./strings.ts";

/**
 * Ponte entre o mundo e os jogos.
 * O sistema de interação chama openGame(gameId) quando a pessoa aperta E numa mesa de jogo.
 */

export function openGame(table: string): void {
  useApp.getState().openGame(table);
}

export function closeGame(): void {
  useGamesUi.getState().cancelSeat();
  useApp.getState().openGame(null);
}

type Transport = (table: string, op: string, data?: unknown) => void;
let transport: Transport = (table, op, data) => send({ t: "game", table, op, data });

export function sendGame(table: string, op: string, data?: unknown): void {
  transport(table, op, data);
}

/** Troca o destino das mensagens de jogo (prévia de desenvolvimento, sem servidor). */
export function setGameTransport(fn: Transport): void {
  transport = fn;
}

// O mapa e o motor de movimento entram sob demanda: o painel e a textura não dependem deles para abrir.
type WorldMod = typeof import("../world/world.ts");
type MoveMod = typeof import("../engine/movement.ts");
let worldMod: WorldMod | null = null;
let moveMod: MoveMod | null = null;
void import("../world/world.ts").then((m) => (worldMod = m)).catch(() => undefined);
void import("../engine/movement.ts").then((m) => (moveMod = m)).catch(() => undefined);

function world(): ReturnType<WorldMod["world"]> | null {
  try {
    return worldMod?.world() ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- leitura

/** Fotografia de uma mesa, com o `state` tipado pelo jogo. */
export interface Table<S = unknown> extends Omit<GameSnapshot, "state"> {
  state: TableState & S;
}

/** Estado de uma mesa (re-renderiza quando ela muda). */
export function useTable<S = unknown>(table: string | null): Table<S> | null {
  return useApp((s) => (table ? ((s.games[table] as Table<S> | undefined) ?? null) : null));
}

/** Meu lugar na mesa (-1 se estou só assistindo). */
export function mySeat(t: Pick<GameSnapshot, "seats"> | null, selfId: string | null): number {
  if (!t || !selfId) return -1;
  return t.seats.indexOf(selfId);
}

/** Nome de quem está num lugar: da lista de pessoas, ou o que o servidor mandou. */
export function seatPlayerName(t: Table, seat: number): string | null {
  const id = t.seats[seat];
  if (!id) return null;
  return useApp.getState().players[id]?.name ?? t.state.names?.[seat] ?? "—";
}

/** Objeto do mapa da mesa (para posição e tipo). Cadeiras da mesa têm o mesmo gameId; a mesa vem primeiro. */
export function tableObject(table: string): MapObject | undefined {
  const objs = world()?.map.objects.filter((o) => o.gameId === table) ?? [];
  return objs.find((o) => o.type in GAME_OF_TABLE) ?? objs[0];
}

/** Cadeira de um lugar da mesa (objeto com o mesmo gameId e `gameSeat`), se a planta tiver. */
function seatChair(table: string, seat: number): MapObject | undefined {
  return world()?.map.objects.find((o) => o.gameId === table && o.gameSeat === seat && o.interact);
}

/** Tipo de jogo de uma mesa, mesmo antes do servidor mandar o estado. */
export function tableKind(table: string): string | null {
  const snap = useApp.getState().games[table];
  if (snap) return snap.kind;
  const o = tableObject(table);
  return o ? ((GAME_OF_TABLE as Record<string, string | undefined>)[o.type] ?? null) : null;
}

// ---------------------------------------------------------------- sentar e levantar

/** Alcance para sentar, um pouco abaixo do limite do servidor (3 m) para não ser recusado. */
const REACH = 2.6;

interface GamesUi {
  /** Pedido de lugar em andamento (andando até a mesa). */
  pending: { table: string; seat: number } | null;
  /** Aviso curto para quem pediu o lugar. */
  notice: string | null;
  /** Pede um lugar: se estiver longe, anda até a cadeira (ou até a mesa), senta o avatar e avisa o servidor. */
  requestSeat(table: string, seat: number): void;
  cancelSeat(): void;
  setNotice(n: string | null): void;
}

let pendingTimer: number | undefined;
/** Muda a cada pedido: chegada de um pedido cancelado não senta ninguém. */
let seatToken = 0;

/** Estado de interface dos jogos que não vem do servidor. */
export const useGamesUi = create<GamesUi>((set, get) => ({
  pending: null,
  notice: null,
  setNotice: (notice) => set({ notice }),
  cancelSeat: () => {
    seatToken++;
    window.clearInterval(pendingTimer);
    pendingTimer = undefined;
    if (get().pending) set({ pending: null });
  },
  requestSeat: (table, seat) => {
    get().cancelSeat();
    set({ notice: null });
    // Com partida rolando em outra mesa, o servidor recusaria: avisa já.
    const { games, selfId } = useApp.getState();
    if (selfId && Object.values(games).some((g) => g.table !== table && g.phase === "playing" && g.seats.includes(selfId))) {
      set({ notice: S.busyElsewhere });
      return;
    }

    const obj = tableObject(table);
    const move = moveMod;
    // Sem a mesa no mapa do cliente (ou sem motor de movimento), deixa o servidor decidir.
    if (!obj || !move) {
      sendGame(table, "sit", { seat });
      return;
    }
    const chair = seatChair(table, seat);
    const sitDown = () => {
      if (chair?.interact) move.sitAt(chair.interact.point, chair.interact.yaw, chair.id);
      sendGame(table, "sit", { seat });
    };
    if (chair?.interact ? dist(self, chair.interact.point) < 0.45 : dist(self, obj.pos) <= REACH) {
      sitDown();
      return;
    }

    const target = chair?.interact?.point ?? approachPoint(obj, seat);
    const token = seatToken;
    let arrived = false;
    const arrive = () => {
      if (token !== seatToken) return;
      arrived = true;
      get().cancelSeat();
      sitDown();
    };
    if (!target || (!move.walkTo(target, arrive) && !arrived)) {
      set({ notice: S.noPath });
      return;
    }
    if (arrived) return;
    set({ pending: { table, seat } });
    const startedAt = performance.now();
    pendingTimer = window.setInterval(() => {
      // Rota interrompida (WASD, outro clique) ou demorou demais: desiste com aviso.
      if (token !== seatToken) return;
      if (!move.currentPath() || performance.now() - startedAt > 25_000) {
        get().cancelSeat();
        set({ notice: S.tooFar });
      }
    }, 250);
  },
}));

/** Levanta da mesa: avisa o servidor e, se o avatar estiver numa cadeira desta mesa, fica de pé. */
export function leaveSeat(table: string): void {
  sendGame(table, "stand");
  const move = moveMod;
  const at = move?.seatedAt();
  if (!move || !at) return;
  const chair = world()?.map.objects.find((o) => o.id === at.objectId);
  if (chair?.gameId === table) move.standUp();
}

/** Ponto andável ao lado da mesa: lugar 0 na frente, lugar 1 atrás; senão, o mais perto de mim. */
function approachPoint(o: MapObject, seat: number): Vec2 | null {
  if (o.interact?.point && seat === 0) return o.interact.point;
  const nav = world()?.nav;
  if (!nav) return o.interact?.point ?? null;
  const r = Math.hypot(o.size.w, o.size.d) / 2 + 0.45;
  const front = o.rot + (seat === 1 ? Math.PI : 0);
  const candidates: Vec2[] = [];
  for (let k = 0; k < 16; k++) {
    // Começa pelo lado do lugar e vai abrindo para os lados.
    const step = Math.ceil(k / 2) * (k % 2 === 0 ? 1 : -1);
    const d = dirOfYaw(front + (step * Math.PI) / 8);
    candidates.push({ x: o.pos.x + d.x * r, z: o.pos.z + d.z * r });
  }
  return candidates.find((p) => nav.isWalkable(p)) ?? o.interact?.point ?? null;
}
