import { NOTE_MAX } from "../../protocol.ts";
import { escClean } from "./common.ts";

/**
 * Status curto no avatar ("Almoço", "Em call"). O texto vai no campo `note` da pessoa
 * (o servidor da sala já limpa e repassa); aqui ficam os atalhos e a limpeza do lado do cliente.
 */

/** Atalhos de status: o emoji abre o texto, para o balão ser lido de relance. */
export const STATUS_PRESETS = [
  { id: "almoco", emoji: "🍽️" },
  { id: "call", emoji: "📞" },
  { id: "foco", emoji: "🎧" },
  { id: "volto", emoji: "⏳" },
  { id: "cafe", emoji: "☕" },
] as const;
export type StatusPresetId = (typeof STATUS_PRESETS)[number]["id"];

/** Texto final do status: limpo, numa linha e com no máximo NOTE_MAX unidades. Vazio apaga. */
export function statusNote(text: unknown): string {
  return escClean(text, NOTE_MAX);
}

/** Separa o emoji inicial (se houver) do resto, para o balão destacar o ícone. */
export function statusSplit(note: string): { emoji: string; text: string } {
  const m = /^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*)\s*/u.exec(note);
  if (!m) return { emoji: "", text: note };
  return { emoji: m[1]!, text: note.slice(m[0].length) };
}
