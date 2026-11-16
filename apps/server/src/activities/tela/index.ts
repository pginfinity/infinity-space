import { hearing, type Vec2 } from "@infinity/world";
import type { Activity, ActivityFactory, ActivityHost } from "../types.ts";

/**
 * Caneta sobre a tela compartilhada: quem está vendo a tela de alguém desenha um traço rápido por
 * cima ("olha aqui"), e todo mundo que vê a mesma tela enxerga o traço, que some sozinho no cliente.
 * Vê a tela quem pode ouvir quem compartilha (mesma regra do áudio e da assinatura da tela).
 *
 * Operação: `stroke` { screen: id de quem compartilha, pts: [x, y, x, y, ...] de 0 a 1, c: cor 0-4 }.
 * Evento: `stroke` { screen, pts, c } para quem vê aquela tela.
 */
class AnnotateActivity implements Activity {
  readonly id = "anotacao";
  readonly kind = "annotate";

  constructor(private readonly host: ActivityHost) {}

  snapshot(): Record<string, never> {
    return {};
  }

  handle(from: string, op: string, data: unknown): void {
    if (op !== "stroke") return;
    const d = data as { screen?: unknown; pts?: unknown; c?: unknown } | undefined;
    const screen = typeof d?.screen === "string" ? d.screen : null;
    if (!screen || !Array.isArray(d?.pts)) return;
    const raw = d.pts.slice(0, 128);
    if (raw.length < 4 || raw.length % 2 || !raw.every((n) => typeof n === "number" && Number.isFinite(n) && n >= -0.05 && n <= 1.05)) return;
    const pts = raw.map((n) => Math.round(n * 1000) / 1000);
    const c = typeof d?.c === "number" && Number.isInteger(d.c) && d.c >= 0 && d.c < 5 ? d.c : 0;
    const sharer = this.host.playerPos(screen);
    if (!sharer || (from !== screen && !this.sees(from, screen, sharer))) return;
    const to = this.host.players().filter((id) => id === screen || this.sees(id, screen, sharer));
    this.host.event(this, "stroke", { screen, pts, c }, { to, from });
  }

  /** `viewer` vê a tela de `screen`? (ouve quem compartilha) */
  private sees(viewer: string, screen: string, sharerPos: Vec2): boolean {
    if (viewer === screen) return true;
    const p = this.host.playerPos(viewer);
    if (!p) return false;
    const h = hearing(this.host.map.walls, { pos: p, zone: this.host.playerZone(viewer) }, { pos: sharerPos, zone: this.host.playerZone(screen) });
    return h.mode !== "none";
  }
}

/** Pacote "tela": ferramentas sobre a tela compartilhada. */
const create: ActivityFactory = (host) => [new AnnotateActivity(host)];
export default create;
