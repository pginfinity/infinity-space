import { randomUUID } from "node:crypto";
import {
  BOARD_ID,
  BOARD_KIND,
  BOARD_POST_COOLDOWN_MS,
  BOARD_RANGE,
  BOARD_TEXT_MAX,
  boardColor,
  boardIsReaction,
  boardOwnSalt,
  boardPost,
  boardReact,
  boardReactSalt,
  boardRemove,
  escClean,
  escTag,
  escValidKey,
  type BoardState,
  type Vec2,
} from "@infinity/world";
import type { Activity, ActivityHost } from "../types.ts";

const KEY = "escritorio/mural";

interface Req {
  key?: unknown;
  id?: unknown;
  text?: unknown;
  color?: unknown;
  emoji?: unknown;
}

/**
 * Mural de recados: post-its persistidos, com reações (uma por pessoa por recado).
 * Só quem está perto do mural escreve, reage ou apaga; só o autor apaga o próprio recado.
 *
 * Toda operação leva `key` (chave secreta do navegador), usada só para gerar marcas anônimas.
 * Operações: `post` { key, text, color }, `react` { key, id, emoji }, `remove` { key, id }.
 * Eventos: `posted` { id } e `busy` { ms } (só para quem escreveu).
 */
export class BoardActivity implements Activity {
  readonly id = BOARD_ID;
  readonly kind = BOARD_KIND;
  private state: BoardState;
  private readonly lastPost = new Map<string, number>();
  private readonly at: Vec2;

  constructor(
    private readonly host: ActivityHost,
    private readonly now: () => number = Date.now,
  ) {
    const o = host.objects("notice-board")[0];
    this.at = o?.interact?.point ?? o?.pos ?? { x: 0, z: 0 };
    const saved = host.store.get<BoardState>(KEY, { notes: [] });
    this.state = { notes: Array.isArray(saved?.notes) ? saved.notes : [] };
  }

  snapshot(): BoardState {
    return this.state;
  }

  handle(from: string, op: string, data: unknown): void {
    const d = (data ?? {}) as Req;
    if (!escValidKey(d.key)) return;
    if (!this.host.near(from, this.at, BOARD_RANGE)) return;
    const notes = this.state.notes;
    let next = notes;
    if (op === "post") {
      const text = escClean(d.text, BOARD_TEXT_MAX, { lines: true });
      if (!text) return;
      const now = this.now();
      const wait = (this.lastPost.get(from) ?? -Infinity) + BOARD_POST_COOLDOWN_MS - now;
      if (wait > 0) {
        this.host.event(this, "busy", { ms: wait }, { to: [from] });
        return;
      }
      this.lastPost.set(from, now);
      const id = `${now.toString(36)}${randomUUID().slice(0, 4)}`;
      next = boardPost(notes, {
        id,
        name: this.host.playerName(from) ?? "Alguém",
        color: boardColor(d.color),
        text,
        at: now,
        own: escTag(d.key, boardOwnSalt(id)),
        r: {},
      });
      this.host.event(this, "posted", { id }, { to: [from] });
    } else if (op === "react") {
      if (typeof d.id !== "string" || !boardIsReaction(d.emoji)) return;
      next = boardReact(notes, d.id, d.emoji, escTag(d.key, boardReactSalt(d.id)));
    } else if (op === "remove") {
      if (typeof d.id !== "string") return;
      next = boardRemove(notes, d.id, escTag(d.key, boardOwnSalt(d.id)));
    }
    if (next === notes) return;
    this.state = { notes: next };
    this.host.store.set(KEY, this.state);
    this.host.changed(this);
  }

  leave(id: string): void {
    this.lastPost.delete(id);
  }
}
