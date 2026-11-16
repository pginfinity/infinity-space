import { HELD_ITEMS, type HeldItem } from "../../protocol.ts";

/**
 * Como cada item é segurado e o gesto que a pessoa faz de vez em quando, parada, com ele na mão.
 * - grip "front": na frente do corpo, de pé (copos, pipoca, microfone, flor, troféu, papel);
 *   "low": pendurado ao lado do corpo (regador).
 * - gesture: gole (bebidas), beliscar (pipoca), cheirar (flor), erguer (troféu), ler (papel),
 *   falar (microfone), nenhum.
 */
export type HeldGrip = "front" | "low";
export type HeldGesture = "sip" | "nibble" | "sniff" | "lift" | "read" | "talk" | "none";

export const VIVO_HELD: Record<HeldItem, { grip: HeldGrip; gesture: HeldGesture }> = {
  coffee: { grip: "front", gesture: "sip" },
  tea: { grip: "front", gesture: "sip" },
  water: { grip: "front", gesture: "sip" },
  juice: { grip: "front", gesture: "sip" },
  popcorn: { grip: "front", gesture: "nibble" },
  paper: { grip: "front", gesture: "read" },
  microphone: { grip: "front", gesture: "talk" },
  trophy: { grip: "front", gesture: "lift" },
  flower: { grip: "front", gesture: "sniff" },
  "watering-can": { grip: "low", gesture: "none" },
};

export function isHeldItem(v: unknown): v is HeldItem {
  return typeof v === "string" && (HELD_ITEMS as readonly string[]).includes(v);
}

/** Intervalo (ms) até o próximo gesto parado: estável por pessoa, sem todo mundo bebericar junto. */
export function heldGestureGap(seed: number, n: number): number {
  const r = Math.abs(Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453) % 1;
  return 6500 + r * 7500;
}
