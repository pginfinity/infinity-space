import {
  JUKEBOX_ID,
  JUKEBOX_KIND,
  JUKEBOX_RANGE,
  JUKEBOX_SKIP_COOLDOWN_MS,
  jukeboxAdvance,
  jukeboxCanAdd,
  jukeboxCleanTracks,
  type JukeboxState,
  type JukeboxTrack,
  type Vec2,
} from "@infinity/world";
// A lista de faixas mora no cliente (título, clima, prompt para gerar depois); o servidor só precisa da duração.
// O import estático entra no pacote do servidor (esbuild) e no tsx do desenvolvimento.
import TRACKS_JSON from "../../../../web/src/activities/vivo/tracks.json" with { type: "json" };
import type { Activity, ActivityHost } from "../types.ts";

/**
 * Jukebox do Arcade: fila compartilhada e "tocando agora" com a hora de início. Os clientes perto
 * tocam o mesmo trecho (cada um calcula a posição a partir da hora de início) com o próprio volume.
 *
 * Operações: `add` `{ track }`, `skip`.
 * Eventos: `added` `{ track, by }` (todos), `refuse` `{ reason }` (só quem pediu).
 */
export class JukeboxActivity implements Activity {
  readonly id = JUKEBOX_ID;
  readonly kind = JUKEBOX_KIND;
  private readonly tracks: Map<string, JukeboxTrack>;
  private readonly at: Vec2;
  private state: Pick<JukeboxState, "playing" | "queue"> = { playing: null, queue: [] };
  private lastSkip = 0;

  constructor(private readonly host: ActivityHost) {
    this.tracks = new Map(jukeboxCleanTracks(TRACKS_JSON).map((t) => [t.id, t]));
    const box = host.objects("jukebox")[0];
    this.at = box?.interact?.point ?? box?.pos ?? { x: 0, z: 0 };
  }

  snapshot(): JukeboxState {
    return { ...this.state, now: Date.now() };
  }

  handle(from: string, op: string, data: unknown): void {
    if (op !== "add" && op !== "skip") return;
    if (!this.host.near(from, this.at, JUKEBOX_RANGE)) {
      this.host.event(this, "refuse", { reason: "far" }, { to: [from] });
      return;
    }
    const now = Date.now();
    if (op === "skip") {
      if (!this.state.playing || now - this.lastSkip < JUKEBOX_SKIP_COOLDOWN_MS) return;
      this.lastSkip = now;
      this.state = jukeboxAdvance({ ...this.state, playing: null }, now, this.seconds);
      this.host.changed(this);
      return;
    }
    const track = (data as { track?: unknown } | undefined)?.track;
    if (typeof track !== "string") return;
    const refusal = jukeboxCanAdd(this.state, from, track, (id) => this.tracks.has(id));
    if (refusal) {
      this.host.event(this, "refuse", { reason: refusal }, { to: [from] });
      return;
    }
    const by = this.host.playerName(from) ?? "Alguém";
    this.state = jukeboxAdvance({ ...this.state, queue: [...this.state.queue, { track, by, byId: from }] }, now, this.seconds);
    this.host.changed(this);
    this.host.event(this, "added", { track, by }, { from });
  }

  tick(): void {
    const next = jukeboxAdvance(this.state, Date.now(), this.seconds);
    if (next !== this.state) {
      this.state = next;
      this.host.changed(this);
    }
  }

  private readonly seconds = (id: string): number | undefined => this.tracks.get(id)?.seconds;
}
