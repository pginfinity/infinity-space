import { useApp } from "../../state/store.ts";
import { playEmote } from "../../world/registry.ts";
import { toast } from "../../ui/toasts.ts";
import { sfx } from "../../audio/sfx.ts";
import { sequenceDetector } from "./rules.ts";
import { T } from "./strings.ts";

/**
 * Código Konami (↑ ↑ ↓ ↓ ← → ← → B A), fora de campos de texto. Só observa as teclas: as setas
 * continuam andando e o B continua sendo o sussurro; nada é impedido nem engolido.
 * O prêmio é só para você: o emote toca no seu cliente e não vai para o servidor.
 */

const detector = sequenceDetector();

function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
}

/** O prêmio: comemora (só aqui), toast e o jingle de fase nova. */
export function konamiReward(): void {
  const id = useApp.getState().selfId;
  if (id) playEmote(id, "cheer");
  sfx("cab-level", { volume: 0.4 });
  toast(T.konami.line);
}

function onKey(e: KeyboardEvent): void {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || typing(e)) return;
  if (detector.push(e.code)) konamiReward();
}

let started = false;

export function startKonami(): void {
  if (started) return;
  started = true;
  // Fase de captura e passiva: vê a tecla antes de qualquer um e não chama preventDefault.
  window.addEventListener("keydown", onKey, { capture: true, passive: true });
}
