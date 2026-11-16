import { create } from "zustand";
import { ORBI_ID } from "@infinity/world";
import { sendAct } from "../activities/registry.ts";
import { sfx } from "../audio/sfx.ts";
import { currentStep, markDone, parseProgress, serializeProgress, stepsFor, type SavedPhase, type StepKey } from "./steps.ts";

/**
 * Estado dos primeiros passos (tutorial conduzido pelo Orbi) e da lista de atalhos (tecla ?).
 * O progresso fica salvo só neste navegador.
 */

const KEY = "infinity-space:primeiros-passos";

/** Celular ou tablet (sem teclado): textos de toque e lista sem a troca de lente. */
export const TOUCH = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
export const STEP_LIST = stepsFor(TOUCH);

/** `off` (nada na tela), `intro` (Orbi se apresenta), `steps` (lista), `done` (parabéns). */
export type TourPhase = "off" | "intro" | "steps" | "done";

interface TourUi {
  phase: TourPhase;
  done: StepKey[];
  minimized: boolean;
  /** Lista de atalhos aberta. */
  sheet: boolean;
}

function load() {
  try {
    return parseProgress(localStorage.getItem(KEY));
  } catch {
    return parseProgress(null);
  }
}

function save(phase: SavedPhase, done: StepKey[]): void {
  try {
    localStorage.setItem(KEY, serializeProgress({ phase, done }));
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
}

export const saved = load();

export const useTour = create<TourUi>(() => ({ phase: "off", done: saved.done, minimized: false, sheet: false }));

/** Abre a apresentação do Orbi (primeira entrada ou "rever"). Recomeça do zero. */
export function startTour(): void {
  useTour.setState({ phase: "intro", done: [], minimized: false, sheet: false });
}

/** "Vamos lá": mostra a lista e pede ao Orbi para vir até a pessoa. */
export function beginSteps(): void {
  useTour.setState({ phase: "steps", minimized: false });
  save("steps", useTour.getState().done);
  sendAct(ORBI_ID, "welcome");
}

/** Voltou no meio: a lista reaparece minimizada, sem o Orbi atravessar a estação de novo. */
export function resumeTour(): void {
  useTour.setState({ phase: "steps", minimized: true });
}

function advance(key: StepKey, sound: boolean): void {
  const s = useTour.getState();
  if (s.phase !== "steps" || s.done.includes(key)) return;
  const done = markDone(s.done, key);
  if (currentStep(STEP_LIST, done) === null) {
    useTour.setState({ done, phase: "done", minimized: false });
    save("done", done);
    sfx("vivo-orbi-happy", { volume: 0.5 });
    return;
  }
  useTour.setState({ done });
  save("steps", done);
  if (sound) sfx("vivo-orbi-beep", { volume: 0.35 });
}

/** A pessoa fez o passo (detectado em `watch.ts`). */
export function completeStep(key: StepKey): void {
  advance(key, true);
}

/** "Pular este" (sem microfone, sem ninguém por perto...). */
export function skipStep(key: StepKey): void {
  advance(key, false);
}

/** Fecha o tutorial (agora não, encerrar ou depois do parabéns). Só volta se a pessoa pedir. */
export function closeTour(): void {
  useTour.setState({ phase: "off", minimized: false });
  save("done", useTour.getState().done);
}

export function setMinimized(minimized: boolean): void {
  useTour.setState({ minimized });
}

export function openShortcuts(): void {
  useTour.setState({ sheet: true });
}

export function closeShortcuts(): void {
  useTour.setState({ sheet: false });
}

export function toggleShortcuts(): void {
  useTour.setState((s) => ({ sheet: !s.sheet }));
}
