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

/** Objeto do mapa da mesa (para posição e tipo). */
export function tableObject(table: string): MapObject | undefined {
  return world()?.map.objects.find((o) => o.gameId === table);
}

/** Tipo de jogo de uma mesa, mesmo antes do servidor mandar o estado. */
export function tableKind(table: string): string | null {
  const snap = useApp.getState().games[table];
  if (snap) return snap.kind;
  const o = tableObject(table);
  return o ? ((GAME_OF_TABLE as Record<string, string | undefined>)[o.type] ?? null) : null;
}

// ---------------------------------------------------------------- sentar

/** Alcance para sentar, um pouco abaixo do limite do servidor (3 m) para não ser recusado. */
const REACH = 2.6;

interface GamesUi {
  /** Pedido de lugar em andamento (andando até a mesa). */
  pending: { table: string; seat: number } | null;
  /** Aviso curto para quem pediu o lugar. */
  notice: string | null;
  requestSeat(table: string, seat: number): void;
  cancelSeat(): void;
  setNotice(n: string | null): void;
}

let pendingTimer: number | undefined;

/** Estado de interface dos jogos que não vem do servidor. */
export const useGamesUi = create<GamesUi>((set, get) => ({
  pending: null,
  notice: null,
  setNotice: (notice) => set({ notice }),
  cancelSeat: () => {
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
    const center = obj?.pos;
    // Sem a mesa no mapa do cliente, deixa o servidor decidir.
    if (!center || dist(self, center) <= REACH) {
      sendGame(table, "sit", { seat });
      return;
    }
    const target = approachPoint(obj, seat);
    const move = moveMod;
    if (!target || !move?.walkTo(target)) {
      set({ notice: S.noPath });
      return;
    }
    set({ pending: { table, seat } });
    const startedAt = performance.now();
    pendingTimer = window.setInterval(() => {
      if (dist(self, center) <= REACH) {
        get().cancelSeat();
        sendGame(table, "sit", { seat });
        return;
      }
      // Parou longe (rota cancelada, bloqueio) ou demorou demais: desiste com aviso.
      if (!move.currentPath() || performance.now() - startedAt > 25_000) {
        get().cancelSeat();
        set({ notice: S.tooFar });
      }
    }, 120);
  },
}));

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
