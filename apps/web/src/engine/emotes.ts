import { EMOTES, type Emote } from "@infinity/world";
import { send } from "../net/session.ts";
import { useApp } from "../state/store.ts";
import { playEmote } from "../world/registry.ts";

/** Faz um emote: aparece na hora para você e o servidor espalha para os outros. */
export function doEmote(e: Emote): void {
  const id = useApp.getState().selfId;
  if (!id) return;
  playEmote(id, e);
  send({ t: "emote", e });
}

export const EMOTE_INFO: Record<Emote, { label: string; emoji: string }> = {
  wave: { label: "Acenar", emoji: "👋" },
  dance: { label: "Dançar", emoji: "💃" },
  clap: { label: "Aplaudir", emoji: "👏" },
  cheer: { label: "Comemorar", emoji: "🎉" },
  point: { label: "Apontar", emoji: "👉" },
  think: { label: "Pensar", emoji: "🤔" },
  laugh: { label: "Rir", emoji: "😂" },
  heart: { label: "Amei", emoji: "❤️" },
};

function onKey(e: KeyboardEvent): void {
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
  const m = /^Digit([1-8])$/.exec(e.code);
  if (m) doEmote(EMOTES[Number(m[1]) - 1]!);
}

export function startEmoteKeys(): () => void {
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}
