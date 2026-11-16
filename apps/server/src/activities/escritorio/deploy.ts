import {
  DEPLOY_COOLDOWN_MS,
  DEPLOY_COUNTDOWN_MS,
  DEPLOY_FLIGHT_MS,
  DEPLOY_ID,
  DEPLOY_KIND,
  DEPLOY_RANGE,
  escMonth,
  type DeployBusy,
  type DeployCountdown,
  type DeployLaunch,
  type DeployState,
  type Vec2,
} from "@infinity/world";
import type { Activity, ActivityHost } from "../types.ts";

const KEY = "escritorio/deploy";

/**
 * Botão de deploy: quem está perto aperta, todo mundo perto vê a contagem, o foguete decola e
 * cruza o céu de todos. Guarda só a contagem do mês do time.
 *
 * Operações: `press`.
 * Eventos: `countdown` DeployCountdown (todos), `launch` DeployLaunch (todos), `busy` DeployBusy (quem apertou).
 */
export class DeployActivity implements Activity {
  readonly id = DEPLOY_ID;
  readonly kind = DEPLOY_KIND;
  private saved: { month: string; count: number };
  private phase: DeployState["phase"] = "idle";
  private launchAt = 0;
  private landAt = 0;
  private readyAt = 0;
  private readonly at: Vec2;

  constructor(
    private readonly host: ActivityHost,
    private readonly now: () => number = Date.now,
  ) {
    const b = host.objects("big-button")[0];
    this.at = b?.pos ?? { x: 0, z: 0 };
    this.saved = host.store.get(KEY, { month: escMonth(this.now()), count: 0 });
  }

  snapshot(): DeployState {
    const month = escMonth(this.now());
    return { month, count: month === this.saved.month ? this.saved.count : 0, phase: this.phase };
  }

  handle(from: string, op: string): void {
    if (op !== "press") return;
    const now = this.now();
    if (!this.host.near(from, this.at, DEPLOY_RANGE)) return;
    if (this.phase !== "idle" || now < this.readyAt) {
      this.host.event(this, "busy", { ms: Math.max(0, this.readyAt - now) } satisfies DeployBusy, { to: [from] });
      return;
    }
    this.phase = "countdown";
    this.launchAt = now + DEPLOY_COUNTDOWN_MS;
    this.readyAt = this.launchAt + DEPLOY_COOLDOWN_MS;
    this.host.changed(this);
    this.host.emote(from, "point");
    const name = this.host.playerName(from) ?? "Alguém";
    this.host.event(this, "countdown", { name, ms: DEPLOY_COUNTDOWN_MS } satisfies DeployCountdown, { from });
  }

  tick(): void {
    const now = this.now();
    if (this.phase === "countdown" && now >= this.launchAt) {
      const month = escMonth(now);
      const count = (month === this.saved.month ? this.saved.count : 0) + 1;
      this.saved = { month, count };
      this.host.store.set(KEY, this.saved);
      this.phase = "flight";
      this.landAt = now + DEPLOY_FLIGHT_MS;
      this.host.changed(this);
      this.host.event(this, "launch", { count, ms: DEPLOY_FLIGHT_MS } satisfies DeployLaunch);
    } else if (this.phase === "flight" && now >= this.landAt) {
      this.phase = "idle";
      this.host.changed(this);
    }
  }
}
