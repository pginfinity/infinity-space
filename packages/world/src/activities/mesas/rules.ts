import type { Vec2 } from "../../geometry.ts";
import type { MapDef, MapObject, ObjectType } from "../../map/types.ts";

/**
 * Mesas de trabalho: check-in nas mesas rotativas, mesas fixas, objetos pessoais e recados.
 * Regras puras sobre o estado (o servidor guarda e confere; o cliente desenha).
 *
 * Presença, não vigilância: o estado diz só quem está com cada mesa agora. Nada de horário de
 * chegada, tempo na mesa ou frequência. O check-in vale até a meia-noite de Brasília (ou até a
 * pessoa liberar a mesa), e esse "até" é o mesmo para todo mundo no dia.
 */

export const MESAS_ID = "mesas";
export const MESAS_KIND = "desks";

/** Fuso do escritório: o dia do check-in vira à meia-noite de Brasília. */
export const MESAS_TZ = "America/Sao_Paulo";
/** Objetos pessoais por pessoa. */
export const MESAS_ITEMS_MAX = 3;
/** Tamanho de um recado. */
export const MESAS_NOTE_MAX = 140;
/** Recados guardados para a mesma pessoa; ao passar disso, saem os mais antigos. */
export const MESAS_NOTES_PER_OWNER = 12;
/** Recados pendentes de um mesmo autor para a mesma pessoa. */
export const MESAS_NOTES_PER_AUTHOR = 3;
/** Intervalo mínimo entre dois recados da mesma pessoa. */
export const MESAS_NOTE_COOLDOWN_MS = 6000;
/** Recado esquecido some sozinho depois de 30 dias. */
export const MESAS_NOTE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Check-in: a pessoa precisa estar sentada (ou quase) na cadeira da mesa. */
export const MESAS_SEAT_RANGE = 1.1;
/** Recado: perto da mesa (passando por ela). */
export const MESAS_NOTE_RANGE = 2.6;
/** Mesa vista de perto: a etiqueta "Ocupada · Ana" aparece a até esta distância. */
export const MESAS_LABEL_RANGE = 5.5;
/** Pessoas guardadas (objetos e última mesa). Com login desligado qualquer nome entra; isto segura o arquivo. */
export const MESAS_PEOPLE_MAX = 300;

/** Catálogo próprio de objetos pequenos para a mesa (modelos em apps/web/src/activities/mesas/items.ts). */
export const MESAS_ITEMS = [
  "caneca",
  "vasinho",
  "cacto",
  "porta-retrato",
  "boneco",
  "fones",
  "livros",
  "cubo",
  "luminaria",
  "globo",
  "foguete",
  "gatinho",
] as const;
export type MesasItem = (typeof MESAS_ITEMS)[number];

const ITEM_SET: ReadonlySet<string> = new Set(MESAS_ITEMS);

export function mesasIsItem(v: unknown): v is MesasItem {
  return typeof v === "string" && ITEM_SET.has(v);
}

/** Lista de objetos limpa: só do catálogo, sem repetir, no máximo três. */
export function mesasCleanItems(v: unknown): MesasItem[] {
  if (!Array.isArray(v)) return [];
  const out: MesasItem[] = [];
  for (const x of v) {
    if (out.length >= MESAS_ITEMS_MAX) break;
    if (mesasIsItem(x) && !out.includes(x)) out.push(x);
  }
  return out;
}

// ---- pessoas ------------------------------------------------------------------------------

/** Chave de uma pessoa: o nome sem diferença de maiúsculas e espaços (o id muda a cada conexão; o nome não). */
export function mesasKey(name: string): string {
  return name.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

// ---- mesas do mapa ------------------------------------------------------------------------

export interface MesasDesk {
  /** Id do objeto da mesa no mapa. */
  id: string;
  type: ObjectType;
  pos: Vec2;
  rot: number;
  /** Cadeira da mesa (onde se faz o check-in). */
  chairId: string | null;
  seat: Vec2;
  seatYaw: number;
  zoneId: string;
  /** Nome da sala ("Dev Lab"). */
  room: string;
  /** Número da mesa na sala (1, 2...) e quantas a sala tem. */
  n: number;
  of: number;
}

/**
 * Mesas de trabalho que aceitam check-in. As cabines de foco ficam de fora: são de uso livre,
 * por pouco tempo, e ninguém deve "guardar" uma cabine o dia todo.
 */
export function mesasDesks(map: MapDef): MesasDesk[] {
  const zones = new Map(map.zones.map((z) => [z.id, z]));
  const objs = new Map(map.objects.map((o) => [o.id, o]));
  const chairs = new Map<string, MapObject>();
  for (const o of map.objects) if (o.deskId) chairs.set(o.deskId, o);
  const out: MesasDesk[] = [];
  const count = new Map<string, number>();
  for (const d of map.desks) {
    const z = d.zoneId ? zones.get(d.zoneId) : undefined;
    const o = objs.get(d.objectId);
    if (!z || !o || z.kind === "focus") continue;
    const n = (count.get(z.id) ?? 0) + 1;
    count.set(z.id, n);
    out.push({
      id: o.id,
      type: o.type,
      pos: o.pos,
      rot: o.rot,
      chairId: chairs.get(o.id)?.id ?? null,
      seat: d.seat,
      seatYaw: d.seatYaw,
      zoneId: z.id,
      room: z.name,
      n,
      of: 0,
    });
  }
  for (const d of out) d.of = count.get(d.zoneId) ?? 1;
  return out;
}

/** "Dev Lab · Mesa 3" (ou só "Suíte 1", quando a sala tem uma mesa). */
export function mesasLabel(d: Pick<MesasDesk, "room" | "n" | "of">): string {
  return d.of > 1 ? `${d.room} · Mesa ${d.n}` : d.room;
}

// ---- dia ----------------------------------------------------------------------------------

const DAY = 24 * 60 * 60 * 1000;
const fmt = new Map<string, Intl.DateTimeFormat | null>();

/** Diferença (ms) entre a hora local do fuso e o UTC num instante. Sem Intl, usa UTC-3. */
function tzOffset(at: number, tz: string): number {
  let f = fmt.get(tz);
  if (f === undefined) {
    try {
      f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      f = null;
    }
    fmt.set(tz, f);
  }
  if (!f) return -3 * 60 * 60 * 1000;
  const p: Record<string, number> = {};
  for (const part of f.formatToParts(at)) if (part.type !== "literal") p[part.type] = Number(part.value);
  const local = Date.UTC(p.year ?? 1970, (p.month ?? 1) - 1, p.day ?? 1, p.hour ?? 0, p.minute ?? 0, p.second ?? 0);
  return local - Math.floor(at / 1000) * 1000;
}

/** Fim do dia (próxima meia-noite) no fuso do escritório. */
export function mesasDayEnd(now: number, tz: string = MESAS_TZ): number {
  const off = tzOffset(now, tz);
  const next = Math.floor((now + off) / DAY) * DAY + DAY;
  // Se o fuso mudar até lá (horário de verão), a meia-noite local muda junto.
  return next - tzOffset(next - off, tz);
}

// ---- estado público -----------------------------------------------------------------------

export interface MesasCheckin {
  /** Nome de quem fez o check-in (como estava na hora). */
  name: string;
  /** Até quando vale: a meia-noite do dia (igual para todos; não diz a hora de chegada). */
  until: number;
}

/** Estado que todos recebem. Recados não entram aqui: vão só para quem escreveu e para a dona. */
export interface MesasState {
  /** Mesa → check-in do dia. */
  checkins: Record<string, MesasCheckin>;
  /** Mesa → nome da pessoa (mesa fixa, definida por um admin). */
  fixed: Record<string, string>;
  /** Pessoa (mesasKey) → objetos pessoais. */
  items: Record<string, MesasItem[]>;
}

export const mesasEmpty = (): MesasState => ({ checkins: {}, fixed: {}, items: {} });

export interface MesasOwner {
  name: string;
  /** Mesa fixa (aparece com o nome mesmo sem a pessoa). */
  fixed: boolean;
}

/** De quem é a mesa agora (fixa vale mais que check-in), ou null se está livre. */
export function mesasOwner(s: MesasState, desk: string, now: number): MesasOwner | null {
  const f = s.fixed[desk];
  if (f !== undefined) return { name: f, fixed: true };
  const c = s.checkins[desk];
  if (c && c.until > now) return { name: c.name, fixed: false };
  return null;
}

/** Mesa atual de uma pessoa: a do check-in de hoje; senão, a fixa. */
export function mesasDeskOf(s: MesasState, key: string, now: number): string | null {
  for (const [id, c] of Object.entries(s.checkins)) if (c.until > now && mesasKey(c.name) === key) return id;
  return mesasFixedOf(s, key);
}

/** Mesa fixa de uma pessoa, se houver. */
export function mesasFixedOf(s: MesasState, key: string): string | null {
  for (const [id, n] of Object.entries(s.fixed)) if (mesasKey(n) === key) return id;
  return null;
}

/** Tira os check-ins vencidos. Devolve o mesmo objeto se nada mudou. */
export function mesasPurge(s: MesasState, now: number): MesasState {
  let gone = false;
  for (const c of Object.values(s.checkins)) if (c.until <= now) gone = true;
  if (!gone) return s;
  const checkins: Record<string, MesasCheckin> = {};
  for (const [id, c] of Object.entries(s.checkins)) if (c.until > now) checkins[id] = c;
  return { ...s, checkins };
}

export type MesasCheckinError = "fixa" | "sua-fixa" | "ocupada" | "ja-sua";

/**
 * Check-in de `name` na mesa. Uma pessoa tem um check-in por vez: o anterior sai.
 * Não dá em mesa fixa (de ninguém: a própria pessoa não precisa) nem em mesa ocupada hoje.
 */
export function mesasCheckin(s: MesasState, desk: string, name: string, now: number): { state: MesasState; error?: MesasCheckinError } {
  const key = mesasKey(name);
  const f = s.fixed[desk];
  if (f !== undefined) return { state: s, error: mesasKey(f) === key ? "sua-fixa" : "fixa" };
  const cur = s.checkins[desk];
  if (cur && cur.until > now) return { state: s, error: mesasKey(cur.name) === key ? "ja-sua" : "ocupada" };
  const checkins: Record<string, MesasCheckin> = {};
  for (const [id, c] of Object.entries(s.checkins)) if (c.until > now && mesasKey(c.name) !== key) checkins[id] = c;
  checkins[desk] = { name, until: mesasDayEnd(now) };
  return { state: { ...s, checkins } };
}

/** Libera a mesa do check-in da pessoa (a fixa continua). Devolve o mesmo objeto se não tinha. */
export function mesasCheckout(s: MesasState, key: string): MesasState {
  const ids = Object.entries(s.checkins).filter(([, c]) => mesasKey(c.name) === key);
  if (!ids.length) return s;
  const checkins = { ...s.checkins };
  for (const [id] of ids) delete checkins[id];
  return { ...s, checkins };
}

/**
 * Marca (ou desmarca, com nome vazio) uma mesa como fixa de alguém. Uma pessoa tem no máximo uma
 * mesa fixa; quem estava com check-in nessa mesa perde o lugar.
 */
export function mesasSetFixed(s: MesasState, desk: string, name: string): MesasState {
  const fixed = { ...s.fixed };
  const checkins = { ...s.checkins };
  if (!name) {
    if (fixed[desk] === undefined) return s;
    delete fixed[desk];
    return { ...s, fixed };
  }
  const key = mesasKey(name);
  for (const [id, n] of Object.entries(fixed)) if (mesasKey(n) === key) delete fixed[id];
  fixed[desk] = name;
  delete checkins[desk];
  return { ...s, fixed, checkins };
}

/** Troca os objetos de uma pessoa (lista vazia apaga). */
export function mesasSetItems(s: MesasState, key: string, items: readonly MesasItem[]): MesasState {
  const cur = s.items[key] ?? [];
  if (cur.length === items.length && cur.every((x, i) => x === items[i])) return s;
  const next = { ...s.items };
  if (items.length) next[key] = [...items];
  else delete next[key];
  return { ...s, items: next };
}

/** Estado salvo (de um arquivo que pode estar velho ou corrompido), limpo. */
export function mesasRestore(raw: unknown, desks: ReadonlySet<string>): MesasState {
  const r = (raw ?? {}) as Partial<MesasState>;
  const s = mesasEmpty();
  if (r.checkins && typeof r.checkins === "object") {
    for (const [id, c] of Object.entries(r.checkins)) {
      if (desks.has(id) && c && typeof c.name === "string" && c.name && typeof c.until === "number") s.checkins[id] = { name: c.name, until: c.until };
    }
  }
  if (r.fixed && typeof r.fixed === "object") {
    for (const [id, n] of Object.entries(r.fixed)) if (desks.has(id) && typeof n === "string" && n) s.fixed[id] = n;
  }
  if (r.items && typeof r.items === "object") {
    for (const [k, list] of Object.entries(r.items)) {
      const items = mesasCleanItems(list);
      if (k && items.length) s.items[k] = items;
    }
  }
  return s;
}

// ---- recados (privados) -------------------------------------------------------------------

export interface MesasNote {
  id: string;
  /** Para quem (mesasKey) e o nome como estava na mesa. */
  to: string;
  toName: string;
  /** Quem escreveu (mesasKey) e o nome como estava. */
  from: string;
  fromName: string;
  /** Mesa onde o recado foi deixado. */
  desk: string;
  text: string;
  /** Quando o recado foi escrito (relógio do servidor). É do recado, não da pessoa. */
  at: number;
}

/** O que cada pessoa recebe só para ela: recados para ela, recados que ela deixou e o resto pessoal. */
export interface MesasPrivate {
  inbox: MesasNote[];
  sent: MesasNote[];
  /** Última mesa onde a pessoa fez check-in (para o atalho). */
  last: string | null;
  /** Pode marcar mesas fixas. */
  admin: boolean;
}

export type MesasNoteError = "limite";

/**
 * Deixa um recado. Cada autor tem até MESAS_NOTES_PER_AUTHOR recados pendentes para a mesma pessoa;
 * cada pessoa guarda até MESAS_NOTES_PER_OWNER (os mais antigos saem).
 */
export function mesasAddNote(
  notes: readonly MesasNote[],
  note: MesasNote,
  perOwner = MESAS_NOTES_PER_OWNER,
  perAuthor = MESAS_NOTES_PER_AUTHOR,
): { notes: MesasNote[]; error?: MesasNoteError } {
  const pending = notes.filter((n) => n.to === note.to && n.from === note.from).length;
  if (pending >= perAuthor) return { notes: notes as MesasNote[], error: "limite" };
  let next = [...notes, note];
  const mine = next.filter((n) => n.to === note.to);
  if (mine.length > perOwner) {
    const drop = new Set(mine.slice(0, mine.length - perOwner).map((n) => n.id));
    next = next.filter((n) => !drop.has(n.id));
  }
  return { notes: next };
}

/** Apaga um recado: só a dona ou quem escreveu. Devolve a mesma lista se não pode. */
export function mesasRemoveNote(notes: readonly MesasNote[], id: string, key: string): MesasNote[] {
  const n = notes.find((x) => x.id === id);
  if (!n || (n.to !== key && n.from !== key)) return notes as MesasNote[];
  return notes.filter((x) => x.id !== id);
}

/** Tira os recados velhos demais. Devolve a mesma lista se nada saiu. */
export function mesasPruneNotes(notes: readonly MesasNote[], now: number, ttl = MESAS_NOTE_TTL_MS): MesasNote[] {
  if (!notes.some((n) => now - n.at > ttl)) return notes as MesasNote[];
  return notes.filter((n) => now - n.at <= ttl);
}

/** Recados que uma pessoa pode ver: os para ela e os que ela deixou para outras. */
export function mesasNotesOf(notes: readonly MesasNote[], key: string): { inbox: MesasNote[]; sent: MesasNote[] } {
  return { inbox: notes.filter((n) => n.to === key), sent: notes.filter((n) => n.from === key && n.to !== key) };
}

/** Recados salvos, limpos. */
export function mesasRestoreNotes(raw: unknown): MesasNote[] {
  if (!Array.isArray(raw)) return [];
  const ok = (v: unknown): v is string => typeof v === "string";
  return raw.filter(
    (n): n is MesasNote =>
      !!n && ok(n.id) && ok(n.to) && ok(n.toName) && ok(n.from) && ok(n.fromName) && ok(n.desk) && ok(n.text) && typeof n.at === "number",
  );
}
