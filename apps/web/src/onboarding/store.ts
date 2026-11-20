import { create } from "zustand";
import { sfx } from "../audio/sfx.ts";
import { switchRoom } from "../net/session.ts";
import { useApp } from "../state/store.ts";
import { myStatus, setMyStatus } from "../presence/status.ts";
import { currentStep, markDone, parseProgress, serializeProgress, stepsFor, type SavedPhase, type StepKey } from "./steps.ts";

/**
 * Estado dos primeiros passos (tutorial conduzido pelo Orbi) e da lista de atalhos (tecla ?).
 * A prática acontece na sala de treino (o mesmo mapa, outra sala no servidor): nada atrapalha o escritório.
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
  /** Na sala de treino. */
  training: boolean;
  /** Passo escolhido na lista (voltar a um passo); null = o primeiro que falta. */
  selected: StepKey | null;
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

export const useTour = create<TourUi>(() => ({ phase: "off", done: saved.done, minimized: false, sheet: false, training: false, selected: null }));

/** Status de antes do treino: quem praticou o Foco volta ao escritório disponível. */
let statusBefore: ReturnType<typeof myStatus> = "available";

/** Vai para a sala de treino (o Orbi vem dar boas-vindas quando ela abrir: ver `Tutorial.tsx`). */
export function enterTraining(): void {
  if (useTour.getState().training) return;
  statusBefore = myStatus();
  switchRoom(true);
  useTour.setState({ training: true });
}

/** Volta ao escritório, para o mesmo lugar de antes. */
export function leaveTraining(): void {
  if (!useTour.getState().training) return;
  if (statusBefore === "available" && myStatus() !== "available") setMyStatus("available");
  switchRoom(false);
  useTour.setState({ training: false, selected: null });
}

/** "Voltar ao escritório" no meio: guarda o progresso e deixa a lista minimizada para retomar. */
export function pauseTour(): void {
  useTour.setState({ minimized: true });
  leaveTraining();
}

// Saiu do escritório (sair, sessão caiu): a próxima entrada é no escritório, não no treino.
useApp.subscribe((s) => {
  if (s.phase !== "world" && useTour.getState().training) useTour.setState({ training: false, selected: null });
});

/** Abre a apresentação do Orbi (primeira entrada ou "rever"). Recomeça do zero. */
export function startTour(): void {
  useTour.setState({ phase: "intro", done: [], minimized: false, sheet: false, selected: null });
}

/** "Vamos lá": mostra a lista e leva a pessoa para a sala de treino. */
export function beginSteps(): void {
  useTour.setState({ phase: "steps", minimized: false });
  save("steps", useTour.getState().done);
  enterTraining();
}

/** Voltou no meio: a lista reaparece minimizada no escritório; abrir leva de volta ao treino. */
export function resumeTour(): void {
  useTour.setState({ phase: "steps", minimized: true });
}

/** Escolhe um passo da lista (voltar a um já feito, ou adiantar um). */
export function selectStep(key: StepKey | null): void {
  const s = useTour.getState();
  useTour.setState({ selected: key === currentStep(STEP_LIST, s.done) ? null : key });
}

function advance(key: StepKey, sound: boolean): void {
  const s = useTour.getState();
  if (s.phase !== "steps" || s.done.includes(key)) return;
  const done = markDone(s.done, key);
  // Fez o passo escolhido: segue para o primeiro que falta.
  const selected = s.selected === key ? null : s.selected;
  if (currentStep(STEP_LIST, done) === null) {
    useTour.setState({ done, selected: null, phase: "done", minimized: false });
    save("done", done);
    sfx("vivo-orbi-happy", { volume: 0.5 });
    return;
  }
  useTour.setState({ done, selected });
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

/** Fecha o tutorial (agora não, encerrar ou depois do parabéns) e volta ao escritório. Só volta se a pessoa pedir. */
export function closeTour(): void {
  useTour.setState({ phase: "off", minimized: false, selected: null });
  save("done", useTour.getState().done);
  leaveTraining();
}

/** Minimizar fica onde está; abrir a lista no escritório (retomar) leva de volta ao treino. */
export function setMinimized(minimized: boolean): void {
  useTour.setState({ minimized });
  if (!minimized && useTour.getState().phase === "steps") enterTraining();
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
