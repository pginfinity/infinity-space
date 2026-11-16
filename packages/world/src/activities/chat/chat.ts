import { hearing, type HearingInput } from "../../audio.ts";
import type { Wall } from "../../map/types.ts";

/**
 * Chat de texto do escritório: Geral (todo o escritório, com histórico), Perto (só quem te ouve
 * agora pela regra de áudio, sem histórico) e Conversas (mensagens diretas 1:1, com histórico por par).
 *
 * Identidade: a sessão (id) muda a cada conexão; para o histórico das conversas a chave estável é o
 * nome normalizado (`chatKey`), como o volume por pessoa. Homônimos dividem a mesma chave: o servidor
 * não deixa uma pessoa conversar em particular com alguém de mesmo nome e o cliente avisa quando há
 * mais de uma pessoa online com o nome do outro lado.
 *
 * Presença, não vigilância: nada de contagem de mensagens por pessoa nem "visto por último".
 * O que fica guardado é só o conteúdo das conversas (Geral e diretas), com limite de tamanho.
 */

export const CHAT_ID = "chat";
export const CHAT_KIND = "chat";
/** Tamanho máximo de uma mensagem (unidades UTF-16, sem partir emoji). */
export const CHAT_TEXT_MAX = 1000;
/** Linhas máximas de uma mensagem (o resto vira uma linha só). */
export const CHAT_LINES_MAX = 40;
/** Mensagens guardadas no Geral. */
export const CHAT_GENERAL_KEEP = 300;
/** Mensagens guardadas em cada conversa direta. */
export const CHAT_DM_KEEP = 200;
/** Mensagens do Perto lembradas no cliente (não ficam no servidor). */
export const CHAT_NEAR_KEEP = 100;
/** Mensagens por segundo por pessoa. */
export const CHAT_RATE = 5;
export const CHAT_RATE_WINDOW_MS = 1000;
/** Tempo do balão de proximidade acima da cabeça. */
export const CHAT_BALLOON_MS = 6000;
/** Mensagens seguidas da mesma pessoa dentro deste intervalo ficam agrupadas. */
export const CHAT_GROUP_MS = 5 * 60_000;
/** Tamanho do id que o cliente dá a cada mensagem enviada (para reconhecer o eco). */
export const CHAT_CID_MAX = 24;

export type ChatChannel = "geral" | "perto" | "dm";

export interface ChatMsg {
  /** Único e crescente: também dá a ordem. */
  id: number;
  /** Instante (ms, relógio do servidor). */
  at: number;
  /** Sessão de quem escreveu (muda a cada conexão). */
  from: string;
  /** Chave estável de quem escreveu (nome normalizado). */
  fromKey: string;
  /** Nome mostrado. */
  name: string;
  text: string;
  /** Id dado pelo cliente que enviou (só serve para ele reconhecer a própria mensagem). */
  cid?: string;
}

// ---- pedidos (cliente → servidor) -----------------------------------------------------------

/** `send`: mensagem nova. Em `dm`, `to` é a chave do outro lado. */
export interface ChatSendOp {
  ch: ChatChannel;
  text: string;
  to?: string;
  cid?: string;
}

/** `hist`: histórico do Geral ou de uma conversa (responde só a quem pediu). */
export type ChatHistOp = { ch: "geral" } | { ch: "dm"; with: string };

/** `convs`: lista das suas conversas. `since`: último id lido por conversa (chave do outro lado). */
export interface ChatConvsOp {
  since?: Record<string, number>;
}

// ---- acontecimentos (servidor → cliente) ----------------------------------------------------

/** `msg` (todos): mensagem nova no Geral. */
export interface ChatGeneralEvent {
  m: ChatMsg;
}

/** `near` (quem ouve e quem escreveu): mensagem no Perto. `heard` só vai para quem escreveu. */
export interface ChatNearEvent {
  m: ChatMsg;
  heard?: number;
}

/** `dm` (só as duas pessoas): mensagem direta. `with` é a chave do outro lado, para quem recebe. */
export interface ChatDmEvent {
  with: string;
  withName: string;
  m: ChatMsg;
}

/** `hist` (só quem pediu). */
export interface ChatHistEvent {
  ch: "geral" | "dm";
  with?: string;
  withName?: string;
  msgs: ChatMsg[];
}

export interface ChatConv {
  /** Chave do outro lado. */
  key: string;
  name: string;
  last: ChatMsg | null;
  /** Mensagens do outro lado depois do `since` que o cliente mandou. */
  unread: number;
}

/** `convs` (só quem pediu). */
export interface ChatConvsEvent {
  list: ChatConv[];
}

export type ChatFailReason = "rate" | "empty" | "unknown" | "self";

/** `fail` (só quem mandou): a mensagem não foi aceita. */
export interface ChatFailEvent {
  cid?: string;
  reason: ChatFailReason;
}

// ---- identidade ----------------------------------------------------------------------------

/** Chave estável de uma pessoa pelo nome: sem diferença de maiúsculas e espaços. */
export function chatKey(name: string): string {
  return name.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Separador das duas chaves de um par (nomes não têm caracteres de controle). */
const PAIR_SEP = "\u001f";

/** Chave de uma conversa direta, igual dos dois lados. */
export function chatPair(a: string, b: string): string {
  return a < b ? `${a}${PAIR_SEP}${b}` : `${b}${PAIR_SEP}${a}`;
}

/** As duas chaves de um par. */
export function chatPairKeys(pair: string): [string, string] {
  const i = pair.indexOf(PAIR_SEP);
  return i < 0 ? [pair, pair] : [pair.slice(0, i), pair.slice(i + 1)];
}

/** Hash curto e estável (FNV-1a em duas faixas, 16 hex) para nomes de arquivo. */
export function chatHash(s: string): string {
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c ^ (a >>> 11), 0x01000197);
  }
  a ^= b >>> 15;
  a = Math.imul(a, 0x85ebca6b);
  b ^= a >>> 13;
  b = Math.imul(b, 0xc2b2ae35);
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}

// ---- texto -----------------------------------------------------------------------------------

/** Marcas de direção do texto (usadas para disfarçar links e nomes) e caracteres invisíveis. */
const BIDI = /[؜‎‏‪-‮⁦-⁩]/g;
const INVISIBLE = /[\s​-‍⁠﻿]/g;

/**
 * Limpa uma mensagem: quebras de linha normalizadas, sem caracteres de controle nem marcas de
 * direção, no máximo uma linha em branco seguida e `CHAT_LINES_MAX` linhas, cortada em `max` sem
 * partir emoji. Mensagem só de espaços (ou invisível) vira "".
 */
export function chatClean(text: unknown, max = CHAT_TEXT_MAX): string {
  if (typeof text !== "string") return "";
  let s = text
    .slice(0, max * 4)
    .replace(/\r\n?/g, "\n")
    .replace(BIDI, "")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ")
    .replace(/[  ]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
  const lines = s.split("\n");
  if (lines.length > CHAT_LINES_MAX) s = `${lines.slice(0, CHAT_LINES_MAX).join("\n")} ${lines.slice(CHAT_LINES_MAX).join(" ")}`;
  s = s.trim();
  if (!s.replace(INVISIBLE, "")) return "";
  if (s.length <= max) return s;
  let cut = s.slice(0, max);
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return cut.trimEnd();
}

/** Id de mensagem dado pelo cliente: curto, letras, números e hífen. */
export function chatCid(cid: unknown): string | undefined {
  return typeof cid === "string" && cid.length > 0 && cid.length <= CHAT_CID_MAX && /^[A-Za-z0-9-]+$/.test(cid) ? cid : undefined;
}

export type ChatToken = { t: "text"; s: string } | { t: "link"; s: string; href: string } | { t: "mention"; s: string; key: string };

const WORD = /[\p{L}\p{N}_]/u;
const LINK = /https?:\/\/[^\s<>"'`]+/giu;
const TRAIL = /[.,;:!?…'"*]/;
const PAIRS: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

function count(s: string, ch: string): number {
  let n = 0;
  for (const c of s) if (c === ch) n++;
  return n;
}

/** Links http/https no texto (pontuação final fora; parêntese só se estiver aberto dentro do link). */
export function chatLinks(text: string): Array<{ start: number; end: number; href: string }> {
  const out: Array<{ start: number; end: number; href: string }> = [];
  for (const m of text.matchAll(LINK)) {
    const start = m.index;
    if (start > 0 && WORD.test(text[start - 1]!)) continue;
    let s = m[0];
    for (;;) {
      const last = s[s.length - 1]!;
      const open = PAIRS[last];
      if (TRAIL.test(last) || (open && count(s, open) < count(s, last))) s = s.slice(0, -1);
      else break;
    }
    // Precisa de um endereço depois do "//".
    if (!/^https?:\/\/[^/?#\s]+/i.test(s) || /^https?:\/\/[.:@]/i.test(s)) continue;
    out.push({ start, end: start + s.length, href: s });
  }
  return out;
}

/**
 * Menções `@Nome` no texto, com os nomes conhecidos (o mais longo vence: "@Ana Paula" antes de
 * "@Ana"). O `@` precisa estar no começo ou depois de espaço/pontuação, e o nome terminar numa borda.
 */
export function chatMentions(text: string, names: Iterable<string>): Array<{ start: number; end: number; key: string }> {
  const list: Array<{ low: string; key: string }> = [];
  const seen = new Set<string>();
  for (const n of names) {
    const key = chatKey(n);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    list.push({ low: n.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase(), key });
  }
  list.sort((a, b) => b.low.length - a.low.length);
  const out: Array<{ start: number; end: number; key: string }> = [];
  if (!list.length) return out;
  for (let i = text.indexOf("@"); i >= 0; i = text.indexOf("@", i + 1)) {
    if (i > 0 && (WORD.test(text[i - 1]!) || text[i - 1] === "@")) continue;
    for (const n of list) {
      if (text.slice(i + 1, i + 1 + n.low.length).toLowerCase() !== n.low) continue;
      const end = i + 1 + n.low.length;
      if (end < text.length && WORD.test(text[end]!)) continue;
      out.push({ start: i, end, key: n.key });
      i = end - 1;
      break;
    }
  }
  return out;
}

/** A mensagem menciona esta pessoa? */
export function chatMentionsName(text: string, name: string): boolean {
  return text.includes("@") && chatMentions(text, [name]).length > 0;
}

/** Quebra o texto em pedaços: texto, link e menção (para desenhar sem HTML vindo de fora). */
export function chatTokens(text: string, names: Iterable<string>): ChatToken[] {
  const links = chatLinks(text);
  const marks: Array<{ start: number; end: number; tok: ChatToken }> = links.map((l) => ({ start: l.start, end: l.end, tok: { t: "link", s: text.slice(l.start, l.end), href: l.href } }));
  for (const m of chatMentions(text, names)) {
    if (links.some((l) => m.start < l.end && m.end > l.start)) continue;
    marks.push({ start: m.start, end: m.end, tok: { t: "mention", s: text.slice(m.start, m.end), key: m.key } });
  }
  marks.sort((a, b) => a.start - b.start);
  const out: ChatToken[] = [];
  let at = 0;
  for (const m of marks) {
    if (m.start > at) out.push({ t: "text", s: text.slice(at, m.start) });
    out.push(m.tok);
    at = m.end;
  }
  if (at < text.length) out.push({ t: "text", s: text.slice(at) });
  return out;
}

/**
 * A palavra com `@` sendo digitada antes do cursor (para sugerir nomes). Aceita espaço dentro
 * ("@Ana Pa") enquanto houver nome que comece assim. Devolve onde começa e o que já foi digitado.
 */
export function chatMentionQuery(text: string, caret: number, names: Iterable<string>): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at < 0 || caret - at > 40) return null;
  if (at > 0 && (WORD.test(before[at - 1]!) || before[at - 1] === "@")) return null;
  const query = before.slice(at + 1);
  if (query.includes("\n") || query.startsWith(" ")) return null;
  if (!query.includes(" ")) return { start: at, query };
  const low = query.toLowerCase();
  for (const n of names) if (n.toLowerCase().startsWith(low)) return { start: at, query };
  return null;
}

// ---- regras ----------------------------------------------------------------------------------

/**
 * Limite de mensagens: no máximo `max` dentro de qualquer janela de `windowMs`. `times` guarda os
 * instantes das últimas aceitas (modificado aqui).
 */
export function chatRateOk(times: number[], now: number, max = CHAT_RATE, windowMs = CHAT_RATE_WINDOW_MS): boolean {
  while (times.length && now - times[0]! >= windowMs) times.shift();
  if (times.length >= max) return false;
  times.push(now);
  return true;
}

export interface ChatHearer extends HearingInput {
  id: string;
}

/**
 * Quem lê uma mensagem do Perto: quem ouve quem escreveu com conversa nítida agora (mesma regra da
 * voz: distância, paredes, salas fechadas e palco). Som ambiente abafado não conta.
 */
export function chatHearers(walls: readonly Wall[], speaker: HearingInput, others: readonly ChatHearer[]): string[] {
  const ids: string[] = [];
  for (const o of others) if (hearing(walls, o, speaker).mode === "clear") ids.push(o.id);
  return ids;
}

/** Junta mensagens novas numa lista em ordem de id, sem repetir, guardando as últimas `keep`. */
export function chatMerge(list: readonly ChatMsg[], incoming: readonly ChatMsg[], keep: number): ChatMsg[] {
  if (!incoming.length) return list.length > keep ? list.slice(-keep) : (list as ChatMsg[]);
  const byId = new Map<number, ChatMsg>();
  for (const m of list) byId.set(m.id, m);
  for (const m of incoming) byId.set(m.id, m);
  const out = [...byId.values()].sort((a, b) => a.id - b.id);
  return out.length > keep ? out.slice(-keep) : out;
}

/** Duas mensagens seguidas ficam no mesmo grupo (mesma pessoa, pouco tempo entre elas)? */
export function chatSameGroup(prev: ChatMsg | undefined, cur: ChatMsg, gapMs = CHAT_GROUP_MS): boolean {
  return !!prev && prev.fromKey === cur.fromKey && prev.name === cur.name && cur.at - prev.at >= 0 && cur.at - prev.at <= gapMs;
}

/** Próximo id: crescente e ligado ao relógio (continua crescendo depois de reiniciar o servidor). */
export function chatNextId(last: number, now: number): number {
  return Math.max(last + 1, Math.floor(now));
}

/** Prévia de uma linha só (lista de conversas, avisos). */
export function chatPreview(text: string, max = 90): string {
  const s = text.replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  let cut = s.slice(0, max - 1);
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}
