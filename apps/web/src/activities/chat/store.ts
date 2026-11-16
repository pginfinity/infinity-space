import { create } from "zustand";
import {
  CHAT_DM_KEEP,
  CHAT_GENERAL_KEEP,
  CHAT_ID,
  CHAT_NEAR_KEEP,
  chatKey,
  chatMentionsName,
  chatMerge,
  chatPreview,
  type ChatConvsEvent,
  type ChatDmEvent,
  type ChatFailEvent,
  type ChatGeneralEvent,
  type ChatHistEvent,
  type ChatMsg,
  type ChatNearEvent,
} from "@infinity/world";
import { sendAct, type ActEvent } from "../registry.ts";
import { isReady, serverNow } from "../../net/session.ts";
import { useApp } from "../../state/store.ts";
import { sfx } from "../../audio/sfx.ts";
import { toast } from "../../ui/toasts.ts";
import { showBalloon } from "./balloonStore.ts";
import { T } from "./strings.ts";

/**
 * Estado do chat no cliente: mensagens recebidas, conversas, o que já foi lido e a interface do
 * painel. Nada aqui muda por quadro. O que você já leu fica só neste navegador (localStorage):
 * o servidor nunca sabe quando alguém leu algo.
 */

export type ChatTab = "geral" | "perto" | "dm";

export interface Conv {
  key: string;
  name: string;
  last: ChatMsg | null;
  unread: number;
  msgs: ChatMsg[];
  /** Histórico completo já recebido do servidor. */
  loaded: boolean;
}

/** Mensagem enviada ainda sem eco do servidor (ou recusada). */
export interface Pending {
  cid: string;
  ch: ChatTab;
  to?: string;
  text: string;
  at: number;
  failed?: string;
}

interface Read {
  geral: number;
  perto: number;
  dm: Record<string, number>;
}

interface ChatState {
  open: boolean;
  tab: ChatTab;
  /** Conversa aberta na aba Conversas (chave do outro lado). */
  peer: string | null;
  geral: ChatMsg[];
  geralLoaded: boolean;
  perto: ChatMsg[];
  convs: Record<string, Conv>;
  pending: Pending[];
  read: Read;
  /** Para as suas mensagens no Perto: quantas pessoas leram (0 = ninguém por perto). */
  heard: Record<number, number>;
  /** Rascunhos por canal ("geral", "perto", "dm:<chave>"). */
  drafts: Record<string, string>;
}

export const useChat = create<ChatState>(() => ({
  open: false,
  tab: "geral",
  peer: null,
  geral: [],
  geralLoaded: false,
  perto: [],
  convs: {},
  pending: [],
  read: { geral: 0, perto: 0, dm: {} },
  heard: {},
  drafts: {},
}));

// ---- identidade ----------------------------------------------------------------------------

export function myName(): string {
  const s = useApp.getState();
  return (s.selfId ? s.players[s.selfId]?.name : undefined) ?? s.profile.name;
}

export function myKey(): string {
  return chatKey(myName());
}

/**
 * A mensagem é sua? (desta sessão, ou de uma conexão sua que já caiu). Uma sessão com o seu nome
 * ainda online pode ser outra aba sua ou um homônimo: no Geral e no Perto conta como de outra pessoa.
 */
export function isMine(m: ChatMsg): boolean {
  const s = useApp.getState();
  if (m.from === s.selfId) return true;
  if (m.fromKey !== myKey()) return false;
  // Mesmo nome, mas de outra pessoa online agora (homônimo): não é sua.
  return !s.players[m.from];
}

// ---- lidas (só neste navegador) ------------------------------------------------------------

const READ_PREFIX = "infinity-space:chat:lidas:v1:";
/** Primeira vez deste nome neste navegador: tudo que já existe (Geral e conversas) conta como lido. */
let freshGeral = false;
let freshDm = false;
/**
 * Primeira mensagem que chegou ao vivo antes da primeira resposta do servidor ("geral" ou
 * "dm:<chave>"): só o que é mais antigo que ela conta como já lido num navegador novo.
 */
const liveFirst = new Map<string, number>();
let readOwner = "";

function loadRead(key: string): void {
  readOwner = key;
  const saved = readSaved(key);
  freshGeral = freshDm = !saved;
  liveFirst.clear();
  const dm: Record<string, number> = {};
  if (saved?.dm && typeof saved.dm === "object") for (const [k, v] of Object.entries(saved.dm)) if (typeof v === "number") dm[k] = v;
  const geral = typeof saved?.geral === "number" ? saved.geral : 0;
  useChat.setState((s) => ({ read: { geral, perto: s.read.perto, dm } }));
}

function readSaved(key: string): { geral?: unknown; dm?: unknown } | null {
  try {
    const raw = localStorage.getItem(READ_PREFIX + key);
    const v: unknown = raw ? JSON.parse(raw) : null;
    return v && typeof v === "object" ? (v as { geral?: unknown; dm?: unknown }) : null;
  } catch {
    return null;
  }
}

function saveRead(): void {
  if (!readOwner) return;
  const { geral, dm } = useChat.getState().read;
  try {
    localStorage.setItem(READ_PREFIX + readOwner, JSON.stringify({ geral, dm }));
  } catch {
    /* sem armazenamento: só não lembra */
  }
}

// ---- o que está na tela ----------------------------------------------------------------------

/** Numa conversa direta não há dúvida: é sua se não veio do outro lado (vale também para outra aba sua). */
export function isMineDm(m: ChatMsg, peer: string): boolean {
  return m.fromKey !== peer;
}

/** Você está vendo este canal agora (painel aberto, aba certa, janela visível)? */
export function viewing(ch: ChatTab, peer?: string): boolean {
  const s = useChat.getState();
  if (!s.open || s.tab !== ch || document.visibilityState !== "visible") return false;
  return ch !== "dm" || s.peer === peer;
}

/** Marca como lido o que está na tela agora. */
export function markViewedRead(): void {
  const s = useChat.getState();
  if (!s.open || document.visibilityState !== "visible") return;
  if (s.tab === "geral") {
    const last = s.geral.at(-1)?.id ?? 0;
    if (last > s.read.geral) {
      useChat.setState({ read: { ...s.read, geral: last } });
      saveRead();
    }
  } else if (s.tab === "perto") {
    const last = s.perto.at(-1)?.id ?? 0;
    if (last > s.read.perto) useChat.setState({ read: { ...s.read, perto: last } });
  } else if (s.peer) {
    const c = s.convs[s.peer];
    if (!c) return;
    const last = Math.max(c.last?.id ?? 0, c.msgs.at(-1)?.id ?? 0);
    if (last > (s.read.dm[c.key] ?? 0) || c.unread) {
      useChat.setState({ read: { ...s.read, dm: { ...s.read.dm, [c.key]: last } }, convs: { ...s.convs, [c.key]: { ...c, unread: 0 } } });
      saveRead();
    }
  }
}

// ---- contagens -------------------------------------------------------------------------------

function unreadIn(list: readonly ChatMsg[], after: number): { n: number; mentions: number } {
  let n = 0;
  let mentions = 0;
  const me = myName();
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i]!;
    if (m.id <= after) break;
    if (isMine(m)) continue;
    n++;
    if (chatMentionsName(m.text, me)) mentions++;
  }
  return { n, mentions };
}

export interface Unread {
  geral: number;
  perto: number;
  dm: number;
  mentions: number;
  /** Número no botão da doca: conversas diretas + menções. */
  badge: number;
  /** Ponto no botão: há novas no Geral ou no Perto (sem menção). */
  dot: boolean;
}

/** Contagens de não lidas (barato: só olha o fim das listas). */
export function unreadOf(s: ChatState): Unread {
  const g = unreadIn(s.geral, s.read.geral);
  const p = unreadIn(s.perto, s.read.perto);
  let dm = 0;
  for (const c of Object.values(s.convs)) dm += c.unread;
  const mentions = g.mentions + p.mentions;
  return { geral: g.n, perto: p.n, dm, mentions, badge: dm + mentions, dot: g.n + p.n > 0 };
}

// ---- ações -----------------------------------------------------------------------------------

export function setChatOpen(open: boolean): void {
  if (open === useChat.getState().open) return;
  useChat.setState({ open });
  if (open) {
    useApp.getState().togglePeople(false);
    const s = useChat.getState();
    if (s.tab === "dm" && s.peer) loadConv(s.peer);
    queueMicrotask(markViewedRead);
  }
}

export function toggleChat(): void {
  setChatOpen(!useChat.getState().open);
}

export function setTab(tab: ChatTab): void {
  useChat.setState({ tab });
  queueMicrotask(markViewedRead);
}

/** Abre a conversa direta com alguém (pela chave ou pelo nome). */
export function openConv(nameOrKey: string, name?: string): void {
  const key = chatKey(nameOrKey);
  if (!key || key === myKey()) return;
  const s = useChat.getState();
  if (!s.convs[key]) {
    const display = name ?? nameOrKey;
    useChat.setState({ convs: { ...s.convs, [key]: { key, name: display, last: null, unread: 0, msgs: [], loaded: false } } });
  }
  useChat.setState({ tab: "dm", peer: key });
  setChatOpen(true);
  loadConv(key);
  queueMicrotask(markViewedRead);
}

export function closeConv(): void {
  useChat.setState({ peer: null });
}

function loadConv(key: string): void {
  const c = useChat.getState().convs[key];
  if (c && !c.loaded) sendAct(CHAT_ID, "hist", { ch: "dm", with: key });
}

let cidSeq = 0;
function newCid(): string {
  cidSeq = (cidSeq + 1) % 1_000_000;
  return `${Date.now().toString(36)}-${cidSeq.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

const PENDING_TIMEOUT_MS = 10_000;

/** Manda uma mensagem no canal aberto. Aparece na hora (esmaecida) até o servidor confirmar. */
export function sendMessage(ch: ChatTab, text: string, to?: string): void {
  const cid = newCid();
  const p: Pending = { cid, ch, ...(to ? { to } : {}), text, at: serverNow() };
  if (!isReady()) p.failed = "offline";
  useChat.setState((s) => ({ pending: [...s.pending, p] }));
  if (p.failed) return;
  sendAct(CHAT_ID, "send", { ch, text, cid, ...(to ? { to } : {}) });
  window.setTimeout(() => failPending(cid, "offline"), PENDING_TIMEOUT_MS);
}

function failPending(cid: string, reason: string): void {
  useChat.setState((s) => (s.pending.some((p) => p.cid === cid && !p.failed) ? { pending: s.pending.map((p) => (p.cid === cid ? { ...p, failed: reason } : p)) } : {}));
}

export function retryPending(cid: string): void {
  const p = useChat.getState().pending.find((x) => x.cid === cid);
  if (!p) return;
  discardPending(cid);
  sendMessage(p.ch, p.text, p.to);
}

export function discardPending(cid: string): void {
  useChat.setState((s) => ({ pending: s.pending.filter((p) => p.cid !== cid) }));
}

function confirmPending(m: ChatMsg): void {
  if (!m.cid) return;
  const s = useChat.getState();
  if (s.pending.some((p) => p.cid === m.cid)) useChat.setState({ pending: s.pending.filter((p) => p.cid !== m.cid) });
}

export function setDraft(slot: string, text: string): void {
  useChat.setState((s) => ({ drafts: { ...s.drafts, [slot]: text } }));
}

// ---- sincronia com o servidor ----------------------------------------------------------------

let syncedFor = "";

/** Depois de entrar (ou reconectar): pede o Geral e a lista de conversas. */
export function syncChat(): void {
  const key = myKey();
  if (key !== syncedFor) {
    // Outra pessoa nesta aba (saiu e entrou com outro nome): começa do zero.
    if (syncedFor) useChat.setState({ geral: [], geralLoaded: false, perto: [], convs: {}, pending: [], heard: {}, peer: null, drafts: {} });
    syncedFor = key;
    loadRead(key);
  }
  sendAct(CHAT_ID, "hist", { ch: "geral" });
  sendAct(CHAT_ID, "convs", freshDm ? {} : { since: useChat.getState().read.dm });
  // Conversas já abertas: o histórico pode ter mudado enquanto a conexão caiu.
  const s = useChat.getState();
  const convs = { ...s.convs };
  for (const k of Object.keys(convs)) convs[k] = { ...convs[k]!, loaded: false };
  useChat.setState({ convs });
  if (s.peer) loadConv(s.peer);
}

// ---- avisos ----------------------------------------------------------------------------------

let lastPing = 0;
const lastToast = new Map<string, number>();

function ping(sound: "chat-dm" | "chat-mention"): void {
  const now = performance.now();
  if (now - lastPing < 1200) return;
  lastPing = now;
  sfx(sound, { volume: 0.45 });
}

function notice(slot: string, text: string): void {
  const now = performance.now();
  if (now - (lastToast.get(slot) ?? -Infinity) < 8000) return;
  lastToast.set(slot, now);
  toast(text, 4000);
}

// ---- acontecimentos --------------------------------------------------------------------------

export function onChatEvent(e: ActEvent): void {
  if (e.id !== CHAT_ID) return;
  switch (e.ev) {
    case "msg":
      return onGeneral((e.data as ChatGeneralEvent).m);
    case "near":
      return onNear(e.data as ChatNearEvent);
    case "dm":
      return onDirect(e.data as ChatDmEvent);
    case "hist":
      return onHistory(e.data as ChatHistEvent);
    case "convs":
      return onConvs(e.data as ChatConvsEvent);
    case "fail": {
      const d = e.data as ChatFailEvent;
      if (d.cid) failPending(d.cid, d.reason);
      return;
    }
  }
}

function onGeneral(m: ChatMsg): void {
  confirmPending(m);
  if (freshGeral && !liveFirst.has("geral")) liveFirst.set("geral", m.id);
  useChat.setState((s) => ({ geral: chatMerge(s.geral, [m], CHAT_GENERAL_KEEP) }));
  if (isMine(m)) return markOwn("geral", m);
  if (viewing("geral")) markViewedRead();
  if (chatMentionsName(m.text, myName())) {
    if (!viewing("geral")) {
      ping("chat-mention");
      notice(`mention:geral`, T.toast.mention(m.name, T.toast.where.geral!, chatPreview(m.text, 70)));
    }
  }
}

function onNear(d: ChatNearEvent): void {
  const m = d.m;
  confirmPending(m);
  useChat.setState((s) => ({
    perto: chatMerge(s.perto, [m], CHAT_NEAR_KEEP),
    ...(d.heard !== undefined ? { heard: { ...s.heard, [m.id]: d.heard } } : {}),
  }));
  showBalloon(m.from, m.id, m.text);
  if (isMine(m)) return markOwn("perto", m);
  if (viewing("perto")) markViewedRead();
  if (chatMentionsName(m.text, myName()) && !viewing("perto")) {
    ping("chat-mention");
    notice(`mention:perto`, T.toast.mention(m.name, T.toast.where.perto!, chatPreview(m.text, 70)));
  }
}

function onDirect(d: ChatDmEvent): void {
  const m = d.m;
  confirmPending(m);
  const mine = isMineDm(m, d.with);
  if (freshDm && !liveFirst.has(`dm:${d.with}`)) liveFirst.set(`dm:${d.with}`, m.id);
  useChat.setState((s) => {
    const cur = s.convs[d.with] ?? { key: d.with, name: d.withName, last: null, unread: 0, msgs: [], loaded: false };
    const unread = mine || viewing("dm", d.with) ? cur.unread : cur.unread + 1;
    return { convs: { ...s.convs, [d.with]: { ...cur, name: d.withName || cur.name, last: m, msgs: chatMerge(cur.msgs, [m], CHAT_DM_KEEP), unread } } };
  });
  if (mine) {
    // Responder conta como ler o que veio antes.
    const s = useChat.getState();
    useChat.setState({ read: { ...s.read, dm: { ...s.read.dm, [d.with]: m.id } }, convs: { ...s.convs, [d.with]: { ...s.convs[d.with]!, unread: 0 } } });
    saveRead();
    return;
  }
  if (viewing("dm", d.with)) {
    markViewedRead();
    return;
  }
  ping(chatMentionsName(m.text, myName()) ? "chat-mention" : "chat-dm");
  if (!useChat.getState().open) notice(`dm:${d.with}`, T.toast.dm(m.name, chatPreview(m.text, 70)));
}

/** Sua própria mensagem: o que veio antes dela conta como lido. */
function markOwn(ch: "geral" | "perto", m: ChatMsg): void {
  const s = useChat.getState();
  if (m.id > s.read[ch]) {
    useChat.setState({ read: { ...s.read, [ch]: m.id } });
    if (ch === "geral") saveRead();
  }
}

function onHistory(d: ChatHistEvent): void {
  if (d.ch === "geral") {
    useChat.setState((s) => ({ geral: chatMerge(s.geral, d.msgs, CHAT_GENERAL_KEEP), geralLoaded: true }));
    if (freshGeral) {
      freshGeral = false;
      const s = useChat.getState();
      const live = liveFirst.get("geral");
      useChat.setState({ read: { ...s.read, geral: live !== undefined ? live - 1 : (s.geral.at(-1)?.id ?? 0) } });
      saveRead();
    }
    // Depois do próximo desenho: a tela aberta guarda onde vai a linha "Novas" antes de marcar como lido.
    queueMicrotask(markViewedRead);
    return;
  }
  if (!d.with) return;
  const key = d.with;
  useChat.setState((s) => {
    const cur = s.convs[key] ?? { key, name: d.withName ?? key, last: null, unread: 0, msgs: [], loaded: false };
    const msgs = chatMerge(cur.msgs, d.msgs, CHAT_DM_KEEP);
    return { convs: { ...s.convs, [key]: { ...cur, name: d.withName ?? cur.name, msgs, last: msgs.at(-1) ?? cur.last, loaded: true } } };
  });
  markViewedRead();
}

function onConvs(d: ChatConvsEvent): void {
  useChat.setState((s) => {
    const convs: Record<string, Conv> = {};
    // Conversas abertas agora mas ainda sem mensagens (começadas por você) continuam na lista.
    for (const c of Object.values(s.convs)) if (!c.last && !c.msgs.length) convs[c.key] = c;
    for (const c of d.list) {
      const cur = s.convs[c.key];
      convs[c.key] = {
        key: c.key,
        name: c.name,
        last: c.last,
        // Navegador novo: o que já existia conta como lido, mas o que chegou ao vivo antes desta resposta, não.
        unread: freshDm ? (cur?.unread ?? 0) : c.unread,
        msgs: cur?.msgs ?? [],
        loaded: cur?.loaded ?? false,
      };
    }
    return { convs };
  });
  if (freshDm) {
    freshDm = false;
    const s = useChat.getState();
    const dm = { ...s.read.dm };
    for (const c of d.list) {
      const live = liveFirst.get(`dm:${c.key}`);
      if (live !== undefined) dm[c.key] = live - 1;
      else if (c.last) dm[c.key] = c.last.id;
    }
    useChat.setState({ read: { ...s.read, dm } });
    saveRead();
  }
  markViewedRead();
}

// Painel Pessoas abriu: o chat fecha (os dois ocupam o mesmo lugar).
useApp.subscribe((s, prev) => {
  if (s.peopleOpen && !prev.peopleOpen && useChat.getState().open) useChat.setState({ open: false });
});

// Voltou para a aba: o que estiver na tela conta como lido.
if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => markViewedRead());

// Gancho de inspeção para os testes de ponta a ponta, só em desenvolvimento.
if (import.meta.env.DEV) Object.assign(window, { __infinityChat: { state: useChat, unread: () => unreadOf(useChat.getState()) } });
