import { serverNow } from "../../net/session.ts";

/**
 * Relógio do céu: o do servidor (todo mundo vê o mesmo céu e os mesmos meteoros no mesmo instante).
 *
 * Só em desenvolvimento dá para simular outro horário:
 * - `?ceu=2026-11-17T23:00:00-03:00` começa o céu nesse instante e segue andando no tempo real;
 * - `?ceuvel=600` acelera (600× = 10 min do céu por segundo), para ver o céu girar.
 */

let base = 0;
let start = 0;
let speed = 1;

if (import.meta.env.DEV && typeof location !== "undefined") {
  const q = new URLSearchParams(location.search);
  // Na URL, "+03:00" chega como " 03:00": devolve o sinal.
  const at = q.get("ceu")?.replace(" ", "+");
  const t = at ? Date.parse(at) : NaN;
  if (Number.isFinite(t)) {
    base = t;
    start = Date.now();
  }
  const v = Number(q.get("ceuvel"));
  if (Number.isFinite(v) && v > 0) speed = v;
}

/** Instante do céu (ms desde 1970). */
export function skyNow(): number {
  if (base) return base + (Date.now() - start) * speed;
  if (speed !== 1) return serverNow() + (Date.now() - startOnce()) * (speed - 1);
  return serverNow();
}

let first = 0;
function startOnce(): number {
  if (!first) first = Date.now();
  return first;
}

/** O céu está acelerado (só em desenvolvimento): os cálculos precisam rodar mais vezes. */
export const SKY_SPEED = speed;
