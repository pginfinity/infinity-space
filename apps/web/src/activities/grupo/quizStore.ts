import { create } from "zustand";
import { QUIZ_ID, type QuizBank, type QuizState, type Vec2 } from "@infinity/world";
import { actState, sendAct, useAct } from "../registry.ts";
import { world } from "../../world/world.ts";

/**
 * Estado local do Quiz no cliente: o que é só desta pessoa (resposta escolhida, gabarito do
 * apresentador, banco aberto no editor) e os gatilhos dos efeitos da cena.
 */
interface QuizLocal {
  /** Gabarito da pergunta atual (só o apresentador recebe). */
  key: { n: number; correct: number } | null;
  /** Minha resposta da pergunta n (confirmada pelo servidor ou otimista). */
  mine: { game: number; n: number; choice: number } | null;
  bank: QuizBank | null;
  bankError: string | null;
  /** Contadores de efeitos (a cena compara com o último visto). */
  fxReveal: number;
  fxFinal: number;
  fxStart: number;
}

export const useQuizLocal = create<QuizLocal>(() => ({ key: null, mine: null, bank: null, bankError: null, fxReveal: 0, fxFinal: 0, fxStart: 0 }));

export const useQuiz = () => useAct<QuizState>(QUIZ_ID);
export const quizNow = () => actState<QuizState>(QUIZ_ID);
export const quizSend = (op: string, data?: unknown) => sendAct(QUIZ_ID, op, data);

/** Onde fica a tela do auditório (para sons posicionais e a câmera dos efeitos). */
export function quizScreenPos(): Vec2 {
  const tv = world().map.objects.find((o) => o.screenId === "auditorio");
  return tv?.pos ?? { x: 25.8, z: 17 };
}

export function quizLecternPoint(): Vec2 {
  const l = world().map.objects.find((o) => o.type === "lectern");
  return l?.interact?.point ?? { x: 23.25, z: 14.6 };
}

/** Sou o apresentador ou estou jogando? */
export function quizRole(s: QuizState | undefined, me: string | null): "host" | "player" | null {
  if (!s || !me) return null;
  if (s.host?.id === me) return "host";
  return s.players.some((p) => p.id === me && !p.away) ? "player" : null;
}
