import {
  PRESENCA_DASH_SPEED,
  RUN_SPEED,
  SEGUIR_GAP,
  SEGUIR_RUN_AT,
  WALK_SPEED,
  angleDelta,
  dist,
  seguirClip,
  seguirGoal,
  wallBetween,
  yawOf,
  type Vec2,
} from "@infinity/world";
import { cancelWalk, currentPath, onManualMove, seatedAt, walkTo } from "../engine/movement.ts";
import { sampleRemote, self, type Pose } from "../world/registry.ts";
import { world } from "../world/world.ts";

/**
 * Andar automático da presença, fora do React: seguir alguém, chegar perto de alguém (ir até /
 * atender um chamado) e a travessia rápida do teleporte. Usa o mesmo `walkTo` do clique no chão;
 * qualquer movimento manual (teclado, clique em outro lugar, sentar) devolve o controle à pessoa.
 */

export type ControlEnd = "arrived" | "manual" | "replaced" | "lost" | "stopped";

type Mode =
  | { kind: "follow"; id: string }
  | { kind: "approach"; id: string; gap: number; until: number }
  | { kind: "dash"; to: Vec2; tries: number };

interface Handlers {
  onEnd?: (why: ControlEnd) => void;
  /** Seguir: quem é seguido está numa sala onde o seguir não entra (true) ou não mais (false). */
  onWait?: (waiting: boolean) => void;
}

const TICK_MS = 200;
let mode: Mode | null = null;
let handlers: Handlers = {};
let mine: readonly Vec2[] | null = null;
let lastGoal: Vec2 | null = null;
let missingSince = 0;
let waiting = false;
let timer = 0;
const scratch: Pose = { x: 0, z: 0, yaw: 0, anim: "idle" };

/** Virar para alguém quando parado (seguindo ou ao chegar). */
let face: { id: string; until: number } | null = null;
let faceRaf = 0;
let faceLast = 0;

onManualMove(() => {
  if (mode) end("manual");
});

export function controlMode(): Mode["kind"] | null {
  return mode?.kind ?? null;
}

/** Segue `id` (a ~1,2 m) até alguém parar. */
export function startFollow(id: string, h: Handlers = {}): void {
  begin({ kind: "follow", id }, h);
  setFace(id, Infinity);
}

/** Anda até ficar a `gap` metros de `id`, acompanhando se a pessoa andar (até `maxMs`). */
export function startApproach(id: string, h: Handlers & { gap?: number; maxMs?: number } = {}): void {
  begin({ kind: "approach", id, gap: h.gap ?? SEGUIR_GAP, until: performance.now() + (h.maxMs ?? 90_000) }, h);
}

/** Travessia rápida até `to` (destino escolhido pelo servidor), virando para `faceId` ao chegar. */
export function startDash(to: Vec2, faceId: string | null, h: Handlers = {}): void {
  begin({ kind: "dash", to, tries: 0 }, h);
  if (faceId) setFace(faceId, 15_000);
  dashWalk();
}

/** Para o andar automático (botão, Esc). A rota em andamento, se for dele, para onde estiver. */
export function stopControl(why: ControlEnd = "stopped"): void {
  if (!mode) return;
  if (currentPath() && currentPath() === mine) cancelWalk();
  end(why);
}

/** Vira para `id` por `ms` (Infinity = enquanto seguir). */
export function setFace(id: string, ms: number): void {
  face = { id, until: performance.now() + ms };
  if (!faceRaf) {
    faceLast = performance.now();
    faceRaf = requestAnimationFrame(faceLoop);
  }
}

function begin(m: Mode, h: Handlers): void {
  if (mode) end("replaced");
  mode = m;
  handlers = h;
  // Uma rota que já estava em andamento (clique no chão, o modo anterior) passa a ser nossa:
  // o primeiro tique a troca, em vez de achar que a pessoa assumiu o controle.
  mine = currentPath();
  lastGoal = null;
  missingSince = 0;
  waiting = false;
  window.clearInterval(timer);
  timer = window.setInterval(tick, TICK_MS);
  if (m.kind !== "dash") tick();
}

function end(why: ControlEnd): void {
  const h = handlers;
  const was = mode;
  mode = null;
  handlers = {};
  mine = null;
  lastGoal = null;
  window.clearInterval(timer);
  if (was?.kind === "follow" && face?.until === Infinity) face = null;
  if (why === "arrived" && was && was.kind !== "follow" && face) face.until = performance.now() + 900;
  h.onEnd?.(why);
}

function setWaiting(w: boolean): void {
  if (w === waiting) return;
  waiting = w;
  handlers.onWait?.(w);
}

function dashWalk(): void {
  if (mode?.kind !== "dash") return;
  const ok = walkTo(mode.to, () => mode?.kind === "dash" && end("arrived"), { speed: PRESENCA_DASH_SPEED });
  mine = currentPath();
  if (!ok && dist(self, mode.to) < 1.6) end("arrived");
}

function tick(): void {
  const m = mode;
  if (!m) return;
  const cur = currentPath();
  // Outra rota (clique no chão, interação) ou sentou: a pessoa assumiu.
  if (cur && cur !== mine) return end("replaced");
  if (seatedAt()) return end("manual");

  if (m.kind === "dash") {
    if (cur) return;
    // Travou no caminho (alguém no meio): tenta mais duas vezes, depois desiste perto de onde estiver.
    if (dist(self, m.to) < 1.6) return end("arrived");
    if (++m.tries > 2) return end("lost");
    dashWalk();
    return;
  }

  const now = performance.now();
  const p = sampleRemote(m.id, now, scratch);
  if (!p) {
    missingSince ||= now;
    if (now - missingSince > 4000) end("lost");
    return;
  }
  missingSince = 0;
  const d = dist(self, p);
  const gap = m.kind === "follow" ? SEGUIR_GAP : m.gap;

  if (m.kind === "approach") {
    if (d <= gap + 0.45) {
      if (cur) cancelWalk();
      setFace(m.id, 900);
      return end("arrived");
    }
    if (now > m.until) return end("lost");
  } else if (d <= gap + 0.4) {
    setWaiting(false);
    return;
  }

  const { nav, zones, map } = world();
  let goal = nav.nearestWalkable(seguirGoal(p, self, gap), 1.2) ?? p;
  if (wallBetween(map.walls, goal, p)) goal = nav.nearestWalkable(p, 1.5) ?? p;
  // Alvo quase no mesmo lugar e já a caminho: não refaz a rota.
  if (cur && lastGoal && dist(lastGoal, goal) < 0.5) return;
  let route = nav.findPath(self, goal);
  if (!route || route.length === 0) return;

  if (m.kind === "follow") {
    const clip = seguirClip(self, route, (q) => zones.zoneAt(q), zones.zoneAt(p)?.id, zones.zoneAt(self)?.id);
    const stopAt = clip.path.at(-1);
    setWaiting(clip.clipped && (!stopAt || dist(stopAt, self) < 0.5));
    if (!stopAt || dist(stopAt, self) < 0.3) {
      if (cur) cancelWalk();
      lastGoal = goal;
      return;
    }
    route = clip.path;
  }

  const speed = d > (m.kind === "follow" ? SEGUIR_RUN_AT : SEGUIR_RUN_AT * 2) ? RUN_SPEED : WALK_SPEED;
  walkTo(route.at(-1)!, undefined, { speed });
  mine = currentPath();
  lastGoal = goal;
}

function faceLoop(now: number): void {
  const dt = Math.min(0.1, (now - faceLast) / 1000);
  faceLast = now;
  if (!face || now > face.until) {
    face = null;
    faceRaf = 0;
    return;
  }
  if (!currentPath() && !seatedAt()) {
    const p = sampleRemote(face.id, now, scratch);
    if (p && dist(p, self) < 4) {
      const want = yawOf({ x: p.x - self.x, z: p.z - self.z });
      self.yaw += angleDelta(self.yaw, want) * Math.min(1, dt * 8);
    }
  }
  faceRaf = requestAnimationFrame(faceLoop);
}
