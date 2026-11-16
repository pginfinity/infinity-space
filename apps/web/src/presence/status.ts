import type { Status } from "@infinity/world";
import { sendInfo } from "../net/session.ts";
import { useApp } from "../state/store.ts";
import { useMediaSettings } from "../media/settings.ts";
import { awayChoice, awayDecision } from "./away.ts";

/**
 * Status de presença (Disponível, Ouvindo, Foco, Ausente): a escolha da pessoa e o "Ausente"
 * automático por inatividade. A inatividade é percebida só neste computador (teclado, mouse,
 * toque, foco da janela); nada além do status é enviado, e nada é registrado.
 */

const KEY = "infinity-space:presenca:status";
/** Dev/testes: quantos ms vale um "minuto" do automático. */
let minuteMs = 60_000;
let lastActive = performance.now();
/** O "Ausente" atual foi posto pelo automático. */
let auto = false;
/** Último status enviado (o eco do servidor demora um pouco). */
let sent: { status: Status; at: number } | null = null;
let timer = 0;
const watched = new Set<Window>();

export function myStatus(): Status {
  const s = useApp.getState();
  return (s.selfId && s.players[s.selfId]?.status) || "available";
}

/** A pessoa escolheu um status. */
export function setMyStatus(status: Status): void {
  auto = false;
  send(status);
  try {
    if (status === "available") sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, status);
  } catch {
    /* sem armazenamento: só não lembra depois de recarregar */
  }
}

function send(status: Status): void {
  sent = { status, at: performance.now() };
  sendInfo({ status });
}

/** O status visto pelo servidor, ou o que acabamos de mandar (enquanto o eco não volta). */
function currentStatus(): Status {
  if (sent && performance.now() - sent.at < 3000) return sent.status;
  return myStatus();
}

function check(): void {
  if (!useApp.getState().selfId) return;
  const limitMs = awayChoice(useMediaSettings.getState().awayAfter) * minuteMs;
  const d = awayDecision({ status: currentStatus(), auto, idleMs: performance.now() - lastActive, limitMs });
  if (d === "away") {
    auto = true;
    send("away");
  } else if (d === "back") {
    auto = false;
    send("available");
  } else if (d === "forget") {
    auto = false;
  }
}

const bump = (): void => {
  lastActive = performance.now();
  if (auto) check();
};
const onVisible = (): void => {
  if (document.visibilityState === "visible") bump();
};
const EVENTS = ["keydown", "pointerdown", "pointermove", "wheel", "touchstart", "focus"] as const;

/** Escuta sinais de uso numa janela (a principal e a janela flutuante, quando aberta). */
export function watchActivity(win: Window): () => void {
  if (watched.has(win)) return () => undefined;
  watched.add(win);
  for (const e of EVENTS) win.addEventListener(e, bump, { passive: true, capture: true });
  return () => {
    watched.delete(win);
    for (const e of EVENTS) win.removeEventListener(e, bump, { capture: true });
  };
}

function schedule(): void {
  window.clearInterval(timer);
  timer = window.setInterval(check, Math.max(100, Math.min(5000, minuteMs / 12)));
}

/** Liga a escuta (uma vez, ao carregar o pacote). */
export function startPresenceStatus(): void {
  watchActivity(window);
  document.addEventListener("visibilitychange", onVisible);
  schedule();
  // Mudou a escolha no painel: vale na hora (inclusive desligar, que desfaz o automático).
  useMediaSettings.subscribe((s, prev) => {
    if (s.awayAfter !== prev.awayAfter) {
      lastActive = performance.now();
      check();
    }
  });
  // Reconectou (ou recarregou a aba): o servidor volta todo mundo a Disponível; devolve o seu.
  useApp.subscribe((s, prev) => {
    if (!s.selfId || s.selfId === prev.selfId) return;
    let saved: string | null = null;
    try {
      saved = sessionStorage.getItem(KEY);
    } catch {
      /* nada */
    }
    if (auto) send("away");
    else if (saved === "listening" || saved === "focus" || saved === "away") send(saved);
  });
}

/** Dev/testes: encurta o "minuto" do automático. */
export function setAwayMinuteMs(ms: number): void {
  minuteMs = Math.max(50, ms);
  lastActive = performance.now();
  schedule();
}

/** Dev/testes: o automático está valendo agora? */
export function awayIsAuto(): boolean {
  return auto;
}
