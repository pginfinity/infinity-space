import {
  TV_ID,
  TV_KIND,
  TV_LOUNGE_MARGIN,
  TV_MAX_LEN_S,
  TV_NEXT_COOLDOWN_MS,
  TV_QUEUE_MAX,
  tvCleanTitle,
  tvFinished,
  tvInLounge,
  tvPosition,
  tvSeek,
  tvSetPaused,
  tvStart,
  tvVideoId,
  type TvEntry,
  type TvPlaying,
  type TvRefusal,
  type TvState,
} from "@infinity/world";
import type { Activity, ActivityHost } from "../types.ts";

/**
 * TV do lounge: "Assistir junto" (regras em packages/world/src/activities/vivo/tv.ts).
 * O servidor guarda só o id do vídeo, o título, se está tocando e a posição num instante de
 * referência. Nada é salvo em disco; quem pediu o vídeo não fica registrado.
 *
 * Todas as operações são de quem está no lounge:
 * - `add` { link, now? }: link do YouTube (o servidor tira o id); `now` troca o vídeo atual na hora;
 * - `play`, `pause`, `seek` { to: segundos }, `next` (pula para o próximo da fila ou desliga);
 * - `meta` { video, title, len }: um player informa título e duração do vídeo atual;
 * - `ended` { video }: um player viu o vídeo acabar.
 * Eventos: `added` { by, now } (para quem está no lounge), `refuse` { reason } (só para quem pediu).
 */
export class TvActivity implements Activity {
  readonly id = TV_ID;
  readonly kind = TV_KIND;
  private playing: TvPlaying | null = null;
  private queue: TvEntry[] = [];
  private lastNext = 0;

  constructor(private readonly host: ActivityHost) {}

  snapshot(): TvState {
    return { playing: this.playing, queue: this.queue, now: Date.now() };
  }

  handle(from: string, op: string, data: unknown): void {
    if (!tvInLounge(this.host.playerPos(from), TV_LOUNGE_MARGIN)) {
      if (op !== "meta" && op !== "ended") this.refuse(from, "far");
      return;
    }
    const now = Date.now();
    const d = (data ?? {}) as Record<string, unknown>;
    switch (op) {
      case "add": {
        const video = tvVideoId(d.link);
        if (!video) return this.refuse(from, "invalid");
        const entry: TvEntry = { video, title: "" };
        const startNow = !this.playing || d.now === true;
        if (startNow) {
          this.playing = tvStart(entry, now);
        } else {
          if (this.queue.length >= TV_QUEUE_MAX) return this.refuse(from, "full");
          this.queue = [...this.queue, entry];
        }
        this.host.changed(this);
        this.host.event(this, "added", { by: this.host.playerName(from) ?? "Alguém", now: startNow }, { to: this.inLounge(), from });
        return;
      }
      case "play":
      case "pause":
        if (!this.playing) return;
        this.update(tvSetPaused(this.playing, op === "pause", now));
        return;
      case "seek": {
        if (!this.playing || typeof d.to !== "number") return;
        this.update(tvSeek(this.playing, d.to, now));
        return;
      }
      case "next":
        if (!this.playing || now - this.lastNext < TV_NEXT_COOLDOWN_MS) return;
        this.lastNext = now;
        this.advance(now);
        return;
      case "meta": {
        const p = this.playing;
        if (!p || d.video !== p.video) return;
        const title = p.title || tvCleanTitle(d.title);
        const len = p.len ?? (typeof d.len === "number" && Number.isFinite(d.len) && d.len >= 1 && d.len <= TV_MAX_LEN_S ? Math.round(d.len * 10) / 10 : undefined);
        if (title === p.title && len === p.len) return;
        this.update({ ...p, title, ...(len !== undefined ? { len } : {}) });
        return;
      }
      case "ended": {
        const p = this.playing;
        if (!p || d.video !== p.video || p.paused) return;
        // Só acredita no fim se o tempo compartilhado também está perto do fim (ou a duração é desconhecida).
        if (p.len && tvPosition(p, now) < p.len - 5) return;
        this.advance(now);
        return;
      }
    }
  }

  tick(): void {
    if (tvFinished(this.playing, Date.now())) this.advance(Date.now());
  }

  /** Próximo da fila (ou desliga a TV). */
  private advance(now: number): void {
    const [next, ...rest] = this.queue;
    this.playing = next ? tvStart(next, now) : null;
    this.queue = rest;
    this.host.changed(this);
  }

  private update(p: TvPlaying): void {
    if (p === this.playing) return;
    this.playing = p;
    this.host.changed(this);
  }

  private refuse(to: string, reason: TvRefusal): void {
    this.host.event(this, "refuse", { reason }, { to: [to] });
  }

  private inLounge(): string[] {
    return this.host.players().filter((id) => tvInLounge(this.host.playerPos(id), TV_LOUNGE_MARGIN));
  }
}
