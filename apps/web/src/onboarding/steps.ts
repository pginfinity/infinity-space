/**
 * Primeiros passos: a lista do que a pessoa aprende fazendo e o progresso salvo neste navegador.
 * Só regras puras aqui (testadas em `steps.test.ts`); quem observa o que a pessoa faz é `watch.ts`.
 *
 * Presença, não vigilância: o progresso fica só no navegador da pessoa e não sai dele.
 */

export type StepKey = "andar" | "usar" | "mic" | "chat" | "pessoas" | "mapa" | "lente";

/** Ordem sugerida (a pessoa pode fazer em qualquer ordem; o "atual" é o primeiro que falta). */
export const STEPS: readonly StepKey[] = ["andar", "usar", "mic", "chat", "pessoas", "mapa", "lente"];

/** Teclas mostradas ao lado de cada passo (só em computador). */
export const STEP_KEYS: Partial<Record<StepKey, string[]>> = {
  andar: ["W", "A", "S", "D"],
  usar: ["E"],
  mic: ["M"],
  chat: ["C"],
  pessoas: ["Ctrl", "K"],
  lente: ["L"],
};

/** Controle da tela destacado em cada passo (atributo `data-tour-target` dos botões). */
export const STEP_TARGET: Partial<Record<StepKey, string>> = {
  mic: "mic",
  chat: "chat",
  pessoas: "pessoas",
  mapa: "mapa",
  lente: "lente",
};

/** No celular o escritório é 2D e sem teclado: a troca de lente sai da lista. */
export function stepsFor(touch: boolean): StepKey[] {
  return touch ? STEPS.filter((s) => s !== "lente") : [...STEPS];
}

/**
 * Fase salva: `new` (nunca viu), `steps` (começou e não terminou: retoma minimizado na próxima vez)
 * e `done` (terminou ou dispensou; só volta se a pessoa pedir).
 */
export type SavedPhase = "new" | "steps" | "done";

export interface Progress {
  phase: SavedPhase;
  /** Passos feitos ou pulados. */
  done: StepKey[];
}

export const EMPTY: Progress = { phase: "new", done: [] };

/** Lê o que foi salvo; qualquer coisa estranha vira "nunca viu". */
export function parseProgress(raw: string | null): Progress {
  if (!raw) return { ...EMPTY, done: [] };
  try {
    const v = JSON.parse(raw) as { v?: unknown; phase?: unknown; done?: unknown };
    if (v.v !== 1) return { ...EMPTY, done: [] };
    const phase: SavedPhase = v.phase === "steps" || v.phase === "done" ? v.phase : "new";
    const done = Array.isArray(v.done) ? STEPS.filter((s) => (v.done as unknown[]).includes(s)) : [];
    return { phase, done };
  } catch {
    return { ...EMPTY, done: [] };
  }
}

export function serializeProgress(p: Progress): string {
  return JSON.stringify({ v: 1, phase: p.phase, done: p.done });
}

/** Marca um passo (feito ou pulado), na ordem da lista e sem repetir. */
export function markDone(done: readonly StepKey[], key: StepKey): StepKey[] {
  if (done.includes(key)) return [...done];
  return STEPS.filter((s) => s === key || done.includes(s));
}

/** O passo da vez: o primeiro da lista que ainda falta. */
export function currentStep(list: readonly StepKey[], done: readonly StepKey[]): StepKey | null {
  return list.find((s) => !done.includes(s)) ?? null;
}

/** Quantos da lista já foram. */
export function doneCount(list: readonly StepKey[], done: readonly StepKey[]): number {
  return list.filter((s) => done.includes(s)).length;
}

/** Deve abrir sozinho ao entrar? Só para quem nunca viu (e fora do atalho de desenvolvimento). */
export function shouldAutoStart(p: Progress, devShortcut: boolean): boolean {
  return p.phase === "new" && !devShortcut;
}

/** Andou o bastante para contar como "andou pela estação" (metros a partir de onde começou). */
export const WALK_METERS = 3;

export function walked(from: { x: number; z: number }, now: { x: number; z: number }): boolean {
  return Math.hypot(now.x - from.x, now.z - from.z) >= WALK_METERS;
}
