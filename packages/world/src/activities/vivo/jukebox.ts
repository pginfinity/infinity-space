/**
 * Jukebox do Arcade: fila compartilhada no servidor e "tocando agora" sincronizado pela hora de início.
 * Todo mundo perto ouve o mesmo trecho; o volume é de cada um.
 */

export const JUKEBOX_ID = "jukebox";
export const JUKEBOX_KIND = "jukebox";

/** Distância máxima (m) da jukebox para escolher ou pular. */
export const JUKEBOX_RANGE = 3.2;
export const JUKEBOX_QUEUE_MAX = 12;
/** Faixas na fila por pessoa ao mesmo tempo. */
export const JUKEBOX_PER_PERSON = 2;
/** Intervalo mínimo entre dois "pular". */
export const JUKEBOX_SKIP_COOLDOWN_MS = 4000;
/** Alcance (m) do som: some até aqui (abafado atrás de parede). */
export const JUKEBOX_HEAR_RANGE = 16;

export interface JukeboxTrack {
  id: string;
  title: string;
  /** Clima, em poucas palavras (pt-BR). */
  mood: string;
  seconds: number;
  /** Descrição em inglês para gerar a trilha depois (scripts locais). */
  prompt: string;
  /** Arquivo final: /music/<id>.mp3. */
  file: string;
}

export interface JukeboxEntry {
  track: string;
  by: string;
  /** Sessão de quem pediu (para o limite por pessoa). */
  byId: string;
}

export interface JukeboxState {
  playing: (JukeboxEntry & { startAt: number }) | null;
  queue: JukeboxEntry[];
  /** Relógio do servidor quando o estado saiu. */
  now: number;
}

export type JukeboxRefusal = "unknown" | "full" | "limit";

/** Pode entrar na fila? `null` = sim; senão, o motivo. */
export function jukeboxCanAdd(s: Pick<JukeboxState, "playing" | "queue">, byId: string, track: string, known: (id: string) => boolean): JukeboxRefusal | null {
  if (!known(track)) return "unknown";
  if (s.queue.length >= JUKEBOX_QUEUE_MAX) return "full";
  const mine = s.queue.filter((e) => e.byId === byId).length;
  if (mine >= JUKEBOX_PER_PERSON) return "limit";
  return null;
}

/**
 * Avança a jukebox até o instante `now`: se a faixa acabou, puxa a próxima da fila
 * (começando exatamente quando a anterior terminou, para ninguém perder o começo).
 * Devolve o estado novo (ou o mesmo objeto, se nada mudou).
 */
export function jukeboxAdvance<S extends Pick<JukeboxState, "playing" | "queue">>(s: S, now: number, seconds: (id: string) => number | undefined): S {
  let playing = s.playing;
  let queue = s.queue;
  let changed = false;
  for (let guard = 0; guard < JUKEBOX_QUEUE_MAX + 2; guard++) {
    if (playing) {
      const len = seconds(playing.track);
      const end = playing.startAt + (len ?? 0) * 1000;
      if (len !== undefined && now < end) break;
      // acabou: a próxima começa no fim desta (ou agora, se a fila estava vazia há tempo)
      const next = queue[0];
      changed = true;
      if (!next) {
        playing = null;
        break;
      }
      queue = queue.slice(1);
      playing = { ...next, startAt: now - end > 2000 ? now : end };
      continue;
    }
    const next = queue[0];
    if (!next) break;
    changed = true;
    queue = queue.slice(1);
    playing = { ...next, startAt: now };
  }
  return changed ? { ...s, playing, queue } : s;
}

/** Posição (s) da faixa tocando, no instante `now` (relógio do servidor). */
export function jukeboxOffset(playing: { startAt: number } | null, now: number): number {
  return playing ? Math.max(0, (now - playing.startAt) / 1000) : 0;
}

/** Valida uma lista de faixas (vinda do JSON). Devolve só as válidas. */
export function jukeboxCleanTracks(list: unknown): JukeboxTrack[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: JukeboxTrack[] = [];
  for (const t of list as Partial<JukeboxTrack>[]) {
    if (!t || typeof t.id !== "string" || !/^[a-z0-9-]{2,40}$/.test(t.id) || seen.has(t.id)) continue;
    if (typeof t.title !== "string" || typeof t.seconds !== "number" || !(t.seconds >= 20 && t.seconds <= 900)) continue;
    seen.add(t.id);
    out.push({
      id: t.id,
      title: t.title.slice(0, 60),
      mood: typeof t.mood === "string" ? t.mood.slice(0, 60) : "",
      seconds: Math.round(t.seconds),
      prompt: typeof t.prompt === "string" ? t.prompt : "",
      file: typeof t.file === "string" ? t.file : `/music/${t.id}.mp3`,
    });
  }
  return out;
}
