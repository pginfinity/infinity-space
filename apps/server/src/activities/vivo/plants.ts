import {
  PLANTS_ID,
  PLANTS_KIND,
  PLANT_FULL,
  PLANT_RANGE,
  PLANT_TYPES,
  PLANT_WATER_MS,
  plantInitialWateredAt,
  plantLevel,
  plantsHappyCount,
  type PlantWatered,
  type PlantsState,
  type Vec2,
} from "@infinity/world";
import type { Activity, ActivityHost } from "../types.ts";

const KEY = "vivo/plantas";
/** De quanto em quanto tempo o servidor confere se alguma planta deixou de ser feliz. */
const CHECK_MS = 15_000;
/** Distância para pegar o regador na estação de rega. */
const CAN_RANGE = 2.4;

/**
 * Plantas: cada planta tem a hora da última rega (persistida). A água cai com o tempo até murchar
 * em cerca de 3 dias. Quem está perto rega; todo mundo vê o regador, as gotas e a planta voltando.
 * O que o time vê é a contagem "plantas felizes: N de M" (nada por pessoa).
 *
 * Operações: `water` `{ plant }`, `can` (pega o regador na estação de rega).
 * Eventos: `water` `PlantWatered` (todos), `full` `{ plant }` (só quem tentou).
 */
export class PlantsActivity implements Activity {
  readonly id = PLANTS_ID;
  readonly kind = PLANTS_KIND;
  private readonly plants = new Map<string, Vec2>();
  private readonly ids: string[];
  private readonly stations: Vec2[];
  private wateredAt: Record<string, number>;
  private readonly lastBy = new Map<string, number>();
  private happy = 0;
  private nextCheck = 0;

  constructor(private readonly host: ActivityHost) {
    for (const t of PLANT_TYPES) for (const o of host.objects(t)) this.plants.set(o.id, o.pos);
    this.ids = [...this.plants.keys()];
    this.stations = host.objects("watering-station").map((o) => o.interact?.point ?? o.pos);
    const now = Date.now();
    const saved = host.store.get<{ wateredAt: Record<string, number> }>(KEY, { wateredAt: {} });
    this.wateredAt = {};
    let fresh = false;
    for (const id of this.ids) {
      const t = saved.wateredAt?.[id];
      if (typeof t === "number" && Number.isFinite(t) && t <= now) this.wateredAt[id] = t;
      else {
        this.wateredAt[id] = plantInitialWateredAt(id, now);
        fresh = true;
      }
    }
    if (fresh) host.store.set(KEY, { wateredAt: this.wateredAt });
    this.happy = plantsHappyCount(this.wateredAt, this.ids, now);
  }

  snapshot(): PlantsState {
    return { wateredAt: this.wateredAt, now: Date.now(), happy: this.happy, total: this.ids.length };
  }

  handle(from: string, op: string, data: unknown): void {
    if (op === "can") {
      if (this.stations.some((p) => this.host.near(from, p, CAN_RANGE))) this.host.setHeld(from, "watering-can");
      return;
    }
    if (op !== "water") return;
    const plant = (data as { plant?: unknown } | undefined)?.plant;
    if (typeof plant !== "string") return;
    const pos = this.plants.get(plant);
    if (!pos || !this.host.near(from, pos, PLANT_RANGE)) return;
    const now = Date.now();
    // Uma rega de cada vez por pessoa (a animação dura um pouco).
    if (now - (this.lastBy.get(from) ?? 0) < PLANT_WATER_MS) return;
    if (plantLevel(this.wateredAt[plant], now) >= PLANT_FULL) {
      this.host.event(this, "full", { plant }, { to: [from] });
      return;
    }
    this.lastBy.set(from, now);
    this.wateredAt = { ...this.wateredAt, [plant]: now };
    this.host.store.set(KEY, { wateredAt: this.wateredAt });
    this.happy = plantsHappyCount(this.wateredAt, this.ids, now);
    this.host.changed(this);
    this.host.event(this, "water", { plant, name: this.host.playerName(from) ?? "Alguém" } satisfies PlantWatered, { from });
  }

  tick(): void {
    const now = Date.now();
    if (now < this.nextCheck) return;
    this.nextCheck = now + CHECK_MS;
    const happy = plantsHappyCount(this.wateredAt, this.ids, now);
    if (happy !== this.happy) {
      this.happy = happy;
      this.host.changed(this);
    }
  }

  leave(id: string): void {
    this.lastBy.delete(id);
  }
}
