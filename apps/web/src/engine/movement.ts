import { ANIMS, POSE_HZ, RUN_SPEED, WALK_SPEED, angleDelta, dirOfYaw, yawOf, type Anim, type Vec2 } from "@infinity/world";
import { isReady, send } from "../net/session.ts";
import { world } from "../world/world.ts";
import { self } from "../world/registry.ts";

/**
 * Motor de movimento do próprio avatar. Roda num loop próprio, independente da lente:
 * lê teclado e rota, aplica colisão, gira o avatar e envia a pose ao servidor.
 */

const keys = new Set<string>();
let path: Vec2[] | null = null;
let running = false;
let raf = 0;
let last = 0;
let lastSent = 0;
let sent = { x: NaN, z: NaN, yaw: NaN, anim: -1 };
/** Referência de "para frente" no 3D (yaw da câmera). No 2D, o norte da tela. */
let headingYaw = 0;
const listeners = new Set<() => void>();

const MOVE_KEYS: Record<string, Vec2> = {
  KeyW: { x: 0, z: -1 },
  ArrowUp: { x: 0, z: -1 },
  KeyS: { x: 0, z: 1 },
  ArrowDown: { x: 0, z: 1 },
  KeyA: { x: -1, z: 0 },
  ArrowLeft: { x: -1, z: 0 },
  KeyD: { x: 1, z: 0 },
  ArrowRight: { x: 1, z: 0 },
};

function typingTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
}

function onKeyDown(e: KeyboardEvent): void {
  if (typingTarget(e) || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code in MOVE_KEYS || e.code === "ShiftLeft" || e.code === "ShiftRight") {
    keys.add(e.code);
    if (e.code.startsWith("Arrow")) e.preventDefault();
  }
}

function onKeyUp(e: KeyboardEvent): void {
  keys.delete(e.code);
}

function onBlur(): void {
  keys.clear();
}

export function setHeading(yaw: number): void {
  headingYaw = yaw;
}

/** Para onde a câmera "olha" no chão (usado no pan estéreo das vozes). */
export function getHeading(): number {
  return headingYaw;
}

/** Onde a pessoa está sentada (null = em pé). */
let seated: { point: Vec2; yaw: number; objectId: string } | null = null;
/** Chamado ao chegar no fim da rota atual. */
let onArrive: (() => void) | null = null;
const seatListeners = new Set<() => void>();

export function seatedAt(): Readonly<{ point: Vec2; yaw: number; objectId: string }> | null {
  return seated;
}

export function onSeatChange(fn: () => void): () => void {
  seatListeners.add(fn);
  return () => seatListeners.delete(fn);
}

/** Senta no lugar (encaixa posição e direção). */
export function sitAt(point: Vec2, yaw: number, objectId: string): void {
  path = null;
  onArrive = null;
  seated = { point, yaw, objectId };
  self.x = point.x;
  self.z = point.z;
  self.yaw = yaw;
  self.anim = "sit";
  notify();
  for (const fn of seatListeners) fn();
}

/** Levanta e volta para um lugar andável perto do assento. */
export function standUp(): void {
  if (!seated) return;
  const free = world().nav.nearestWalkable({ x: self.x, z: self.z }, 2);
  if (free) {
    self.x = free.x;
    self.z = free.z;
  }
  seated = null;
  self.anim = "idle";
  for (const fn of seatListeners) fn();
}

/**
 * Lugares onde a pessoa não pode entrar agora (pacote portas: sala de porta fechada sem ter sido
 * admitida). O servidor também recusa; aqui é para nem tentar atravessar.
 */
export interface MoveGuard {
  blocks(p: Vec2): boolean;
  /** Para onde ir no lugar de um destino bloqueado (a porta, para bater). */
  redirect(target: Vec2): Vec2 | null;
}
let guard: MoveGuard | null = null;

export function setMoveGuard(g: MoveGuard | null): void {
  guard = g;
}

/** Anda até um ponto do mundo pelo melhor caminho. `arrive` roda ao chegar. */
export function walkTo(target: Vec2, arrive?: () => void): boolean {
  if (seated) standUp();
  // Destino numa sala de porta fechada: vai até a porta.
  if (guard?.blocks(target)) {
    const alt = guard.redirect(target);
    if (!alt) return false;
    target = alt;
    // O que era para fazer ao chegar (sentar, jogar) fica do outro lado da porta.
    arrive = undefined;
  }
  const found = world().nav.findPath({ x: self.x, z: self.z }, target);
  path = found && found.length > 0 ? found : null;
  onArrive = path ? (arrive ?? null) : null;
  if (!path && arrive && Math.hypot(target.x - self.x, target.z - self.z) < 1.6) arrive();
  notify();
  return path !== null;
}

export function currentPath(): readonly Vec2[] | null {
  return path;
}

/** Avisos de mudança de rota (para a lente desenhar o destino). */
export function onPathChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(): void {
  for (const fn of listeners) fn();
}

export function startMovement(): void {
  if (running) return;
  running = true;
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  last = performance.now();
  sent = { x: NaN, z: NaN, yaw: NaN, anim: -1 };
  raf = requestAnimationFrame(frame);
}

export function stopMovement(): void {
  running = false;
  cancelAnimationFrame(raf);
  window.removeEventListener("keydown", onKeyDown);
  window.removeEventListener("keyup", onKeyUp);
  window.removeEventListener("blur", onBlur);
  keys.clear();
  path = null;
  onArrive = null;
  seated = null;
}

function frame(now: number): void {
  if (!running) return;
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (isReady()) {
    step(dt);
    maybeSend(now);
  }
  raf = requestAnimationFrame(frame);
}

function step(dt: number): void {
  const { nav } = world();
  let ix = 0;
  let iz = 0;
  for (const code of keys) {
    const k = MOVE_KEYS[code];
    if (k) {
      ix += k.x;
      iz += k.z;
    }
  }
  const run = keys.has("ShiftLeft") || keys.has("ShiftRight");
  const speed = run ? RUN_SPEED : WALK_SPEED;
  let move: Vec2 | null = null;

  // Sentado: fica parado até alguém mexer no teclado.
  if (seated) {
    if (ix === 0 && iz === 0) {
      self.anim = "sit";
      return;
    }
    standUp();
  }

  if (ix !== 0 || iz !== 0) {
    if (path) {
      path = null;
      onArrive = null;
      notify();
    }
    // Entrada relativa à câmera: "para cima" = para onde a câmera olha.
    const f = dirOfYaw(headingYaw);
    const r = { x: -f.z, z: f.x };
    const fwd = -iz;
    const right = ix;
    const len = Math.hypot(fwd, right);
    move = { x: ((f.x * fwd + r.x * right) / len) * speed * dt, z: ((f.z * fwd + r.z * right) / len) * speed * dt };
  } else if (path && path.length > 0) {
    const target = path[0]!;
    const dx = target.x - self.x;
    const dz = target.z - self.z;
    const d = Math.hypot(dx, dz);
    const stepLen = speed * dt;
    if (d <= stepLen) {
      move = { x: dx, z: dz };
      path.shift();
      if (path.length === 0) {
        path = null;
        const done = onArrive;
        onArrive = null;
        notify();
        if (done) queueMicrotask(done);
      }
    } else {
      move = { x: (dx / d) * stepLen, z: (dz / d) * stepLen };
    }
  }

  let anim: Anim = "idle";
  if (move) {
    let next = nav.move({ x: self.x, z: self.z }, move);
    // Porta fechada: para no batente (se já está dentro, por qualquer motivo, não trava).
    if (guard && guard.blocks(next) && !guard.blocks(self)) next = { x: self.x, z: self.z };
    const moved = Math.hypot(next.x - self.x, next.z - self.z);
    if (moved > 1e-4) {
      const targetYaw = yawOf(move);
      self.yaw += angleDelta(self.yaw, targetYaw) * Math.min(1, dt * 14);
      anim = run ? "run" : "walk";
    } else if (path) {
      // Travou no caminho (alguém no meio, quina): desiste da rota, mas se já está perto, conta como chegada.
      const end = path.at(-1);
      const done = end && Math.hypot(end.x - self.x, end.z - self.z) < 1.2 ? onArrive : null;
      path = null;
      onArrive = null;
      notify();
      if (done) queueMicrotask(done);
    }
    self.x = next.x;
    self.z = next.z;
  }
  self.anim = anim;
}

function maybeSend(now: number): void {
  if (now - lastSent < 1000 / POSE_HZ) return;
  const anim = ANIMS.indexOf(self.anim);
  const changed =
    Math.abs(self.x - sent.x) > 0.005 || Math.abs(self.z - sent.z) > 0.005 || Math.abs(angleDelta(sent.yaw, self.yaw)) > 0.02 || anim !== sent.anim;
  if (!changed && !Number.isNaN(sent.x)) return;
  lastSent = now;
  sent = { x: self.x, z: self.z, yaw: self.yaw, anim };
  send({ t: "pose", x: self.x, z: self.z, yaw: self.yaw, anim });
}
