import { create } from "zustand";
import { MESAS_ID, mesasDeskOf, mesasDesks, mesasFixedOf, mesasKey, mesasOwner, type MesasDesk, type MesasNote, type MesasPrivate, type MesasState } from "@infinity/world";
import { actState, sendAct, useAct } from "../registry.ts";
import { useApp } from "../../state/store.ts";
import { serverNow } from "../../net/session.ts";
import { world } from "../../world/world.ts";

/**
 * Estado do pacote "mesas" no cliente: o que é só seu (recados, última mesa, admin) e o que está
 * aberto na tela. O estado público (de quem é cada mesa) vem do servidor pela atividade "mesas".
 */

interface MesasUi {
  /** Só seu: recados para você, recados que você deixou, última mesa e se pode marcar mesas fixas. */
  priv: MesasPrivate | null;
  /** Painel "Minha mesa". */
  panel: boolean;
  /** Cartão de recado na mesa de outra pessoa (id da mesa). */
  card: string | null;
  /** Muda quando você lê recados (o bilhete na mesa some). */
  seen: number;
  /** Cartão de recados ao chegar na própria mesa. */
  welcome: boolean;
}

export const useMesas = create<MesasUi>(() => ({ priv: null, panel: false, card: null, welcome: false, seen: 0 }));

export function openPanel(): void {
  useApp.getState().togglePeople(false);
  useMesas.setState({ panel: true, card: null, welcome: false });
}

export function openCard(desk: string): void {
  useApp.getState().togglePeople(false);
  useMesas.setState({ card: desk, panel: false, welcome: false });
}

export function closeAll(): void {
  useMesas.setState({ panel: false, card: null, welcome: false });
}

// ---- mesas do mapa ------------------------------------------------------------------------

let list: MesasDesk[] | null = null;
let byId: Map<string, MesasDesk> | null = null;
let byChair: Map<string, MesasDesk> | null = null;

export function desks(): MesasDesk[] {
  if (!list) {
    list = mesasDesks(world().map);
    byId = new Map(list.map((d) => [d.id, d]));
    byChair = new Map(list.filter((d) => d.chairId).map((d) => [d.chairId!, d]));
  }
  return list;
}

export function deskById(id: string | null | undefined): MesasDesk | undefined {
  desks();
  return id ? byId!.get(id) : undefined;
}

export function deskByChair(chairId: string): MesasDesk | undefined {
  desks();
  return byChair!.get(chairId);
}

// ---- pessoas ------------------------------------------------------------------------------

/** Sua chave (nome), ou null antes de entrar. */
export function myKey(): string | null {
  const s = useApp.getState();
  const name = s.selfId ? s.players[s.selfId]?.name : undefined;
  return name ? mesasKey(name) : null;
}

export function useMyKey(): string | null {
  return useApp((s) => {
    const name = s.selfId ? s.players[s.selfId]?.name : undefined;
    return name ? mesasKey(name) : null;
  });
}

export const mesasState = (): MesasState | undefined => actState<MesasState>(MESAS_ID);
export const useMesasState = (): MesasState | undefined => useAct<MesasState>(MESAS_ID);

/** De quem é a mesa agora (pelo relógio do servidor). */
export function ownerOf(s: MesasState | undefined, desk: string) {
  return s ? mesasOwner(s, desk, serverNow()) : null;
}

/** Sua mesa atual (check-in de hoje, senão a fixa). */
export function myDesk(s: MesasState | undefined, key: string | null): MesasDesk | undefined {
  if (!s || !key) return undefined;
  return deskById(mesasDeskOf(s, key, serverNow()));
}

export function myFixed(s: MesasState | undefined, key: string | null): MesasDesk | undefined {
  if (!s || !key) return undefined;
  return deskById(mesasFixedOf(s, key));
}

/** Mesas livres agora. */
export function freeDesks(s: MesasState | undefined): MesasDesk[] {
  const now = serverNow();
  return desks().filter((d) => !s || !mesasOwner(s, d.id, now));
}

// ---- recados vistos (só neste navegador) --------------------------------------------------

const SEEN_KEY = "infinity-space:mesas:vistos";
let seen: Set<string> | null = null;

function seenSet(): Set<string> {
  if (seen) return seen;
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as unknown;
    seen = new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : []);
  } catch {
    seen = new Set();
  }
  return seen;
}

export function unread(inbox: readonly MesasNote[]): MesasNote[] {
  const s = seenSet();
  return inbox.filter((n) => !s.has(n.id));
}

export function markSeen(inbox: readonly MesasNote[]): void {
  const s = seenSet();
  let changed = false;
  for (const n of inbox)
    if (!s.has(n.id)) {
      s.add(n.id);
      changed = true;
    }
  if (!changed) return;
  // Guarda só os ids que ainda existem (mais uma folga), para a lista não crescer para sempre.
  const keep = new Set(inbox.map((n) => n.id));
  const arr = [...s].filter((id) => keep.has(id)).slice(-60);
  seen = new Set(arr);
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(arr));
  } catch {
    /* segue sem lembrar */
  }
  useMesas.setState((u) => ({ seen: u.seen + 1 }));
}

// ---- pedidos ------------------------------------------------------------------------------

/** Check-in pedido pelo atalho da última mesa: ao confirmar, a pessoa anda até lá. */
export const pending = { go: null as string | null };

export const act = {
  checkin: (desk: string) => sendAct(MESAS_ID, "checkin", { desk }),
  checkinLast: (desk: string) => {
    pending.go = desk;
    sendAct(MESAS_ID, "checkin-ultima");
  },
  checkout: () => sendAct(MESAS_ID, "checkout"),
  items: (items: string[]) => sendAct(MESAS_ID, "objetos", { items }),
  note: (desk: string, text: string) => sendAct(MESAS_ID, "recado", { desk, text }),
  removeNote: (id: string) => sendAct(MESAS_ID, "apagar", { id }),
  fix: (desk: string, name: string) => sendAct(MESAS_ID, "fixar", { desk, name }),
  devAdmin: (on: boolean) => sendAct(MESAS_ID, "admin-dev", { on }),
};
