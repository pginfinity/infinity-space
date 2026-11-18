import type { Vec2 } from "../../geometry.ts";

/**
 * TV do lounge do Átrio: "Assistir junto". Alguém cola um link do YouTube e todos que estão no lounge
 * veem o mesmo vídeo no mesmo ponto. O servidor guarda só o id do vídeo (11 caracteres), o título,
 * se está tocando e a posição num instante de referência; cada cliente calcula onde o vídeo deveria
 * estar e se ajusta quando fica fora do tempo.
 *
 * Áudio primeiro: o som do vídeo só toca para quem está no lounge, com volume próprio, e abaixa
 * sozinho quando alguém perto fala.
 */

export const TV_ID = "tv-lounge";
export const TV_KIND = "watch-tv";
/** Tela (screenId) da TV do lounge, na parede norte do Átrio. */
export const TV_SCREEN = "atrio";

/** O lounge do Átrio (sofá, poltronas e tapete na frente da TV). Quem está aqui assiste e controla. */
export const TV_LOUNGE = { x0: 2.7, x1: 7, z0: -4, z1: 0.7 } as const;
/** Folga (m) para quem acabou de sair do lounge (o cliente usa para não piscar na borda; o servidor, para aceitar pedidos). */
export const TV_LOUNGE_MARGIN = 0.5;

/** Fora do tempo por mais que isso (s), o player pula para o ponto certo. */
export const TV_DRIFT_S = 1.5;
export const TV_QUEUE_MAX = 8;
/** Intervalo mínimo entre dois "pular" (dois cliques juntos não pulam dois vídeos). */
export const TV_NEXT_COOLDOWN_MS = 3000;
/** Volume inicial do vídeo (0 a 1): moderado, para não cobrir as vozes. */
export const TV_VOLUME_START = 0.35;
/** Quanto o volume cai (fator) enquanto alguém perto fala. */
export const TV_DUCK = 0.3;
/** Vídeo mais longo que isto (s) não é aceito como duração (dado ruim do player). */
export const TV_MAX_LEN_S = 12 * 3600;
export const TV_TITLE_MAX = 100;

export interface TvEntry {
  /** Id do vídeo no YouTube (11 caracteres). */
  video: string;
  /** Título (vazio até um player informar). */
  title: string;
}

export interface TvPlaying extends TvEntry {
  /** Pausado (true) ou tocando. */
  paused: boolean;
  /** Posição (s) no instante `at`. */
  pos: number;
  /** Instante de referência (relógio do servidor, ms). */
  at: number;
  /** Duração (s), quando um player já informou. */
  len?: number;
}

export interface TvState {
  playing: TvPlaying | null;
  queue: TvEntry[];
  /** Relógio do servidor quando o estado saiu. */
  now: number;
}

export type TvRefusal = "invalid" | "full" | "far";

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Confere um id de vídeo do YouTube. */
export function tvValidId(id: unknown): id is string {
  return typeof id === "string" && ID_RE.test(id);
}

/**
 * Id do vídeo a partir de um link do YouTube (watch, youtu.be, shorts, embed, live, nocookie).
 * Qualquer outro endereço devolve null: só links do YouTube entram.
 */
export function tvVideoId(link: unknown): string | null {
  if (typeof link !== "string") return null;
  const raw = link.trim();
  if (!raw || raw.length > 300 || /\s/.test(raw)) return null;
  // Sem esquema, vale como https. Com esquema, só http(s). (Sem `URL`: o pacote do mundo não depende do DOM.)
  const m = /^(?:(https?):\/\/)?([^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/i.exec(raw);
  if (!m || (!m[1] && /^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^[^:/]+:\d+(?:[/?#]|$)/.test(raw))) return null;
  const authority = m[2]!;
  // Nada de usuário/senha no endereço; porta só a padrão.
  if (authority.includes("@")) return null;
  const [hostRaw, port, extra] = authority.split(":");
  if (extra !== undefined || (port !== undefined && port !== "80" && port !== "443")) return null;
  const host = hostRaw!.toLowerCase().replace(/\.$/, "");
  const path = m[3]!.split("/").filter(Boolean);
  let id: string | null = null;
  if (host === "youtu.be") id = path[0] ?? null;
  else if (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtube-nocookie.com" || host === "www.youtube-nocookie.com") {
    if (path[0] === "watch" && path.length === 1) id = queryParam(m[4] ?? "", "v");
    else if ((path[0] === "shorts" || path[0] === "embed" || path[0] === "live" || path[0] === "v") && path.length === 2) id = path[1] ?? null;
  }
  return tvValidId(id) ? id : null;
}

/** Valor de um parâmetro da query ("?a=1&v=xyz"), ou null. */
function queryParam(query: string, name: string): string | null {
  for (const part of query.replace(/^\?/, "").split("&")) {
    const i = part.indexOf("=");
    const k = i < 0 ? part : part.slice(0, i);
    if (k !== name) continue;
    try {
      return decodeURIComponent((i < 0 ? "" : part.slice(i + 1)).replace(/\+/g, " "));
    } catch {
      return null;
    }
  }
  return null;
}

/** Posição (s) do vídeo no instante `now` (relógio do servidor). */
export function tvPosition(p: Pick<TvPlaying, "paused" | "pos" | "at" | "len"> | null, now: number): number {
  if (!p) return 0;
  const t = p.paused ? p.pos : p.pos + Math.max(0, now - p.at) / 1000;
  return Math.max(0, p.len ? Math.min(t, p.len) : t);
}

/** O vídeo já passou do fim (com folga)? */
export function tvFinished(p: Pick<TvPlaying, "paused" | "pos" | "at" | "len"> | null, now: number, slack = 2): boolean {
  if (!p?.len || p.paused) return false;
  return p.pos + Math.max(0, now - p.at) / 1000 > p.len + slack;
}

/** Ponto dentro do lounge (com folga opcional, em metros)? */
export function tvInLounge(p: Vec2 | undefined, margin = 0): boolean {
  if (!p) return false;
  const r = TV_LOUNGE;
  return p.x >= r.x0 - margin && p.x <= r.x1 + margin && p.z >= r.z0 - margin && p.z <= r.z1 + margin;
}

/** Título limpo: uma linha, sem controle, até TV_TITLE_MAX caracteres. */
export function tvCleanTitle(t: unknown): string {
  if (typeof t !== "string") return "";
  const one = t.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return [...one].slice(0, TV_TITLE_MAX).join("");
}

/** Começa um vídeo agora, do começo. */
export function tvStart(e: TvEntry, now: number): TvPlaying {
  return { video: e.video, title: e.title, paused: false, pos: 0, at: now };
}

/** Pausa ou retoma, mantendo a posição. */
export function tvSetPaused(p: TvPlaying, paused: boolean, now: number): TvPlaying {
  if (p.paused === paused) return p;
  return { ...p, paused, pos: tvPosition(p, now), at: now };
}

/** Pula para a posição `to` (s), mantendo tocando ou pausado. */
export function tvSeek(p: TvPlaying, to: number, now: number): TvPlaying {
  if (!Number.isFinite(to)) return p;
  const max = p.len ?? TV_MAX_LEN_S;
  return { ...p, pos: Math.min(Math.max(0, to), max), at: now };
}

/**
 * Decide o que o player local precisa fazer para ficar igual ao estado compartilhado.
 * `local` é o que o player está mostrando agora.
 */
export function tvSyncPlan(
  want: Pick<TvPlaying, "video" | "paused" | "pos" | "at" | "len"> | null,
  local: { video: string | null; playing: boolean; time: number },
  now: number,
  drift = TV_DRIFT_S,
): { load?: string; seek?: number; play?: boolean } {
  if (!want) return local.video ? { load: "" } : {};
  const at = tvPosition(want, now);
  if (local.video !== want.video) return { load: want.video, seek: at, play: !want.paused };
  const plan: { seek?: number; play?: boolean } = {};
  if (Math.abs(local.time - at) > drift) plan.seek = at;
  if (want.paused === local.playing) plan.play = !want.paused;
  return plan;
}

/** Volume final do vídeo (0 a 1): o escolhido pela pessoa, abaixado enquanto alguém perto fala. */
export function tvVolume(chosen: number, someoneTalking: boolean): number {
  const v = Math.min(1, Math.max(0, chosen));
  return someoneTalking ? v * TV_DUCK : v;
}
