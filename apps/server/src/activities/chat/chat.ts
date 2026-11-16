import {
  CHAT_DM_KEEP,
  CHAT_GENERAL_KEEP,
  CHAT_ID,
  CHAT_KIND,
  chatCid,
  chatClean,
  chatHash,
  chatHearers,
  chatKey,
  chatNextId,
  chatPair,
  chatPairKeys,
  chatRateOk,
  type ChatConv,
  type ChatConvsEvent,
  type ChatDmEvent,
  type ChatFailEvent,
  type ChatFailReason,
  type ChatGeneralEvent,
  type ChatHearer,
  type ChatHistEvent,
  type ChatMsg,
  type ChatNearEvent,
} from "@infinity/world";
import type { Activity, ActivityHost } from "../types.ts";

/**
 * Chat de texto: Geral (todo o escritório, últimas 300 guardadas), Perto (só quem ouve quem
 * escreveu agora, pela regra da voz; nada guardado) e conversas diretas 1:1 (últimas 200 por par).
 *
 * O snapshot é vazio: histórico nunca vai para todos. Cada pessoa pede o que precisa (`hist`,
 * `convs`) e recebe a resposta só para ela; mensagens novas vão por evento só para quem deve ler.
 *
 * Operações: `send` ChatSendOp · `hist` ChatHistOp · `convs` ChatConvsOp.
 * Eventos: `msg` (todos) · `near` (quem ouve + quem escreveu) · `dm` (as duas pessoas) ·
 * `hist` e `convs` (quem pediu) · `fail` (quem mandou).
 *
 * Identidade das conversas: nome normalizado (`chatKey`), que não muda entre conexões. Todas as
 * sessões com o mesmo nome (outra aba, celular) recebem as mensagens daquela conversa.
 */

const K_GENERAL = "chat/geral";
const K_INDEX = "chat/conversas";
const threadKey = (pair: string) => `chat/dm/${chatHash(pair)}`;

/** Leituras de histórico: no máximo 12 a cada 3 s por pessoa (são as respostas maiores). */
const READS_MAX = 12;
const READS_WINDOW_MS = 3000;

interface Thread {
  pair: string;
  msgs: ChatMsg[];
}

interface ConvMeta {
  /** Último nome visto de cada lado (chave → nome). */
  names: Record<string, string>;
  last: ChatMsg;
}

interface ConvIndex {
  v: 1;
  /** Por par (`chatPair`). */
  convs: Record<string, ConvMeta>;
}

function validMsg(m: unknown): m is ChatMsg {
  const x = m as ChatMsg | null;
  return !!x && typeof x.id === "number" && typeof x.at === "number" && typeof x.text === "string" && typeof x.fromKey === "string" && typeof x.name === "string";
}

/** Cópia para guardar: sem o id do cliente (só serve na hora, para quem mandou). */
function stored(m: ChatMsg): ChatMsg {
  const { cid: _cid, ...rest } = m;
  return rest;
}

export class ChatActivity implements Activity {
  readonly id = CHAT_ID;
  readonly kind = CHAT_KIND;
  private readonly general: ChatMsg[];
  private readonly index: ConvIndex;
  private lastId = 0;
  private readonly sent = new Map<string, number[]>();
  private readonly reads = new Map<string, number[]>();

  constructor(
    private readonly host: ActivityHost,
    private readonly now: () => number = Date.now,
  ) {
    const g = host.store.get<unknown>(K_GENERAL, []);
    this.general = Array.isArray(g) ? g.filter(validMsg).slice(-CHAT_GENERAL_KEEP) : [];
    const idx = host.store.get<unknown>(K_INDEX, null) as ConvIndex | null;
    this.index = idx && typeof idx === "object" && idx.convs && typeof idx.convs === "object" ? idx : { v: 1, convs: {} };
    for (const m of this.general) this.lastId = Math.max(this.lastId, m.id);
    for (const c of Object.values(this.index.convs)) if (validMsg(c.last)) this.lastId = Math.max(this.lastId, c.last.id);
  }

  snapshot(): null {
    return null;
  }

  handle(from: string, op: string, data: unknown): void {
    const d = (data ?? {}) as Record<string, unknown>;
    if (op === "send") this.send(from, d);
    else if (op === "hist") this.history(from, d);
    else if (op === "convs") this.conversations(from, d);
  }

  leave(id: string): void {
    this.sent.delete(id);
    this.reads.delete(id);
  }

  // ---- envio --------------------------------------------------------------------------------

  private send(from: string, d: Record<string, unknown>): void {
    const name = this.host.playerName(from);
    if (!name) return;
    const ch = d.ch;
    if (ch !== "geral" && ch !== "perto" && ch !== "dm") return;
    const cid = chatCid(d.cid);
    const fail = (reason: ChatFailReason) => this.host.event(this, "fail", { ...(cid ? { cid } : {}), reason } satisfies ChatFailEvent, { to: [from] });
    const text = chatClean(d.text);
    if (!text) return fail("empty");
    const fromKey = chatKey(name);

    // Conversa direta: só com alguém online agora ou com quem você já conversou.
    let toKey = "";
    if (ch === "dm") {
      toKey = typeof d.to === "string" ? chatKey(d.to.slice(0, 64)) : "";
      if (!toKey) return fail("unknown");
      if (toKey === fromKey) return fail("self");
      if (!this.index.convs[chatPair(fromKey, toKey)] && !this.sessionsOf(toKey).length) return fail("unknown");
    }

    const now = this.now();
    let times = this.sent.get(from);
    if (!times) this.sent.set(from, (times = []));
    if (!chatRateOk(times, now)) return fail("rate");

    this.lastId = chatNextId(this.lastId, now);
    const m: ChatMsg = { id: this.lastId, at: now, from, fromKey, name, text, ...(cid ? { cid } : {}) };

    if (ch === "geral") {
      this.general.push(stored(m));
      if (this.general.length > CHAT_GENERAL_KEEP) this.general.splice(0, this.general.length - CHAT_GENERAL_KEEP);
      this.host.store.set(K_GENERAL, this.general);
      this.host.event(this, "msg", { m } satisfies ChatGeneralEvent, { from });
    } else if (ch === "perto") {
      const hearers = this.hearersOf(from);
      this.host.event(this, "near", { m } satisfies ChatNearEvent, { to: hearers, from });
      this.host.event(this, "near", { m, heard: hearers.length } satisfies ChatNearEvent, { to: [from], from });
    } else {
      this.direct(m, toKey);
    }
  }

  private direct(m: ChatMsg, toKey: string): void {
    const pair = chatPair(m.fromKey, toKey);
    const thread = this.thread(pair);
    thread.msgs.push(stored(m));
    if (thread.msgs.length > CHAT_DM_KEEP) thread.msgs.splice(0, thread.msgs.length - CHAT_DM_KEEP);
    this.host.store.set(threadKey(pair), thread);

    const toSessions = this.sessionsOf(toKey);
    const meta = this.index.convs[pair] ?? { names: {}, last: stored(m) };
    meta.names[m.fromKey] = m.name;
    const onlineName = toSessions.length ? this.host.playerName(toSessions[0]!) : undefined;
    if (onlineName) meta.names[toKey] = onlineName;
    meta.last = stored(m);
    this.index.convs[pair] = meta;
    this.host.store.set(K_INDEX, this.index);

    const toName = meta.names[toKey] ?? toKey;
    this.host.event(this, "dm", { with: toKey, withName: toName, m } satisfies ChatDmEvent, { to: this.sessionsOf(m.fromKey), from: m.from });
    if (toSessions.length) this.host.event(this, "dm", { with: m.fromKey, withName: m.name, m } satisfies ChatDmEvent, { to: toSessions, from: m.from });
  }

  // ---- leitura ------------------------------------------------------------------------------

  private history(from: string, d: Record<string, unknown>): void {
    if (!this.readOk(from)) return;
    if (d.ch === "geral") {
      this.host.event(this, "hist", { ch: "geral", msgs: this.general } satisfies ChatHistEvent, { to: [from] });
      return;
    }
    if (d.ch !== "dm" || typeof d.with !== "string") return;
    const name = this.host.playerName(from);
    if (!name) return;
    const me = chatKey(name);
    const other = chatKey(d.with.slice(0, 64));
    if (!other || other === me) return;
    // Só as conversas de quem pede: o par sempre inclui a chave dela.
    const pair = chatPair(me, other);
    const meta = this.index.convs[pair];
    const online = this.sessionsOf(other);
    const withName = (online.length ? this.host.playerName(online[0]!) : undefined) ?? meta?.names[other] ?? d.with.slice(0, 64);
    const msgs = meta ? this.thread(pair).msgs : [];
    this.host.event(this, "hist", { ch: "dm", with: other, withName, msgs } satisfies ChatHistEvent, { to: [from] });
  }

  private conversations(from: string, d: Record<string, unknown>): void {
    if (!this.readOk(from)) return;
    const name = this.host.playerName(from);
    if (!name) return;
    const me = chatKey(name);
    const since = d.since && typeof d.since === "object" ? (d.since as Record<string, unknown>) : {};
    const list: ChatConv[] = [];
    for (const [pair, meta] of Object.entries(this.index.convs)) {
      const [a, b] = chatPairKeys(pair);
      if (a !== me && b !== me) continue;
      const peer = a === me ? b : a;
      const s = since[peer];
      const after = typeof s === "number" && Number.isFinite(s) ? s : -Infinity;
      let unread = 0;
      if (meta.last.id > after) for (const m of this.thread(pair).msgs) if (m.id > after && m.fromKey === peer) unread++;
      const online = this.sessionsOf(peer);
      list.push({ key: peer, name: (online.length ? this.host.playerName(online[0]!) : undefined) ?? meta.names[peer] ?? peer, last: meta.last, unread });
    }
    list.sort((x, y) => (y.last?.id ?? 0) - (x.last?.id ?? 0));
    this.host.event(this, "convs", { list } satisfies ChatConvsEvent, { to: [from] });
  }

  // ---- apoio --------------------------------------------------------------------------------

  /** Sessões online de uma pessoa (pelo nome): outra aba, celular. */
  private sessionsOf(key: string): string[] {
    return this.host.players().filter((id) => {
      const n = this.host.playerName(id);
      return n !== undefined && chatKey(n) === key;
    });
  }

  /** Quem lê uma mensagem do Perto de `from` agora (mesma regra da voz). */
  private hearersOf(from: string): string[] {
    const pos = this.host.playerPos(from);
    if (!pos) return [];
    const others: ChatHearer[] = [];
    for (const id of this.host.players()) {
      if (id === from) continue;
      const p = this.host.playerPos(id);
      if (p) others.push({ id, pos: p, zone: this.host.playerZone(id) });
    }
    return chatHearers(this.host.map.walls, { pos, zone: this.host.playerZone(from) }, others);
  }

  private thread(pair: string): Thread {
    const t = this.host.store.get<Thread | null>(threadKey(pair), null);
    if (t && t.pair === pair && Array.isArray(t.msgs)) return t;
    // Conversa nova (ou, muito improvável, arquivo de outro par com o mesmo hash: começa do zero).
    return { pair, msgs: [] };
  }

  private readOk(from: string): boolean {
    let times = this.reads.get(from);
    if (!times) this.reads.set(from, (times = []));
    return chatRateOk(times, this.now(), READS_MAX, READS_WINDOW_MS);
  }
}
