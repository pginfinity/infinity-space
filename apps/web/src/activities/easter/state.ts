import { create } from "zustand";
import { toast } from "../../ui/toasts.ts";
import { sfx } from "../../audio/sfx.ts";
import { PARCHMENT_MS, hashSeed, oneIn, pickIndex, seededRandom, spellOf } from "./rules.ts";
import { T } from "./strings.ts";

/**
 * Estado do pacote easter, todo no próprio cliente (nada vai para o servidor):
 * o minimapa de pergaminho, os sorteios e o relógio das TVs (que os testes podem adiantar).
 */

// ---- Mapa do maroto: o minimapa vira pergaminho, só para você ---------------------------------

interface ParchmentState {
  /** Até quando (Date.now) o minimapa fica de pergaminho; null = normal. */
  until: number | null;
}

export const useParchment = create<ParchmentState>(() => ({ until: null }));

let expiry = 0;

/** Liga (ou renova) o pergaminho por 5 minutos. */
export function openParchment(): void {
  window.clearTimeout(expiry);
  useParchment.setState({ until: Date.now() + PARCHMENT_MS });
  expiry = window.setTimeout(() => {
    useParchment.setState({ until: null });
    toast(T.marauder.expired);
  }, PARCHMENT_MS);
}

export function closeParchment(): void {
  window.clearTimeout(expiry);
  useParchment.setState({ until: null });
}

/** Interceptador do chat: as frases do mapa não saem do cliente. */
export function chatSpell(text: string): boolean {
  const spell = spellOf(text);
  if (spell === "open") {
    openParchment();
    sfx("easter-pergaminho", { volume: 0.45 });
    toast(T.marauder.open, 5200);
    return true;
  }
  // "malfeito feito" só é feitiço com o mapa aberto; senão, é uma mensagem como outra qualquer.
  if (spell === "close" && useParchment.getState().until) {
    closeParchment();
    sfx("easter-pergaminho", { volume: 0.35 });
    toast(T.marauder.close);
    return true;
  }
  return false;
}

// ---- sorteios (uma sequência por homenagem, com semente) -----------------------------------------

let seed = hashSeed(Date.now(), Math.random());
const streams = new Map<string, () => number>();
const forced = new Map<string, boolean>();
const lastPick = new Map<string, number>();

function stream(name: string): () => number {
  let s = streams.get(name);
  if (!s) {
    s = seededRandom(hashSeed(seed, name));
    streams.set(name, s);
  }
  return s;
}

/** "1 em n" para uma homenagem (o gancho de testes pode forçar o próximo resultado). */
export function roll(name: string, n: number): boolean {
  const f = forced.get(name);
  if (f !== undefined) {
    forced.delete(name);
    return f;
  }
  return oneIn(stream(name), n);
}

/** Um item da lista, sem repetir o último dessa homenagem. */
export function pickFrom<V>(name: string, list: readonly V[]): V {
  const i = pickIndex(stream(name), list.length, lastPick.get(name) ?? -1);
  lastPick.set(name, i);
  return list[i]!;
}

/** Só para testes (gancho de desenvolvimento). */
export const testing = {
  seed(n: number): void {
    seed = n >>> 0;
    streams.clear();
    lastPick.clear();
  },
  force(name: string, value: boolean): void {
    forced.set(name, value);
  },
};

// ---- relógio das TVs ------------------------------------------------------------------------------

let fakeNow: { at: number; base: number } | null = null;

/** Agora, para as telas de espera das TVs. Os testes podem fingir outra hora (o relógio continua andando). */
export function tvNow(): number {
  return fakeNow ? fakeNow.at + (Date.now() - fakeNow.base) : Date.now();
}

export function setTvNow(ms: number | null): void {
  fakeNow = ms === null ? null : { at: ms, base: Date.now() };
}
