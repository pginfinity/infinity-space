import * as THREE from "three";
import { VIVO_HELD, heldGestureGap, type Anim, type Emote, type HeldGesture, type HeldItem } from "@infinity/world";
import { HIP_Y, type AvatarRig } from "./build.ts";
import type { Expression } from "./face.ts";
import type { HandActionKind } from "./hands.ts";

/**
 * Animação procedural do avatar chibi: cada quadro calcula a pose alvo do estado atual
 * (parado, andando, correndo, sentado) com o emote por cima, e as juntas seguem suavemente.
 *
 * Convenções (frente = +Z): rotation.x negativo leva braço/perna para frente; cotovelo negativo dobra
 * trazendo a mão para frente; joelho positivo dobra para trás. Ombro esquerdo (+X) abre com z positivo,
 * o direito (-X) com z negativo.
 */

export interface AnimState {
  /** Fase do ciclo de passos (avança com a distância andada). */
  phase: number;
  blinkAt: number;
  blinkUntil: number;
  expr: Expression;
  /** Item que aparece na mão direita (o que a pessoa segura ou o do gesto em andamento). */
  hold: HeldItem | null;
  /** Gesto de mão pedido por uma atividade (regar, fazer carinho), com o progresso. */
  handAct: { kind: HandActionKind; t: number; k: number } | null;
  /** Gesto parado com o item (gole, cheirar...): início, próximo e contador (ms de performance.now). */
  gestureAt: number;
  nextGestureAt: number;
  gestureN: number;
  lastHold: HeldItem | null;
  seed: number;
  /** Inclinação atual do item (suavizada). */
  tilt: number;
  /** Em cima da prancha flutuante (0 a 1, suavizado por quem desenha). */
  board: number;
}

export const newAnimState = (): AnimState => ({
  phase: 0,
  blinkAt: performance.now() + 1500 + Math.random() * 3000,
  blinkUntil: 0,
  expr: "neutral",
  hold: null,
  handAct: null,
  gestureAt: 0,
  nextGestureAt: 0,
  gestureN: 0,
  lastHold: null,
  seed: Math.random(),
  tilt: 0,
  board: 0,
});

/** Duração de cada gesto parado com o item (ms). */
const GESTURE_MS: Record<HeldGesture, number> = { sip: 1900, nibble: 1500, sniff: 1900, lift: 2100, read: 3200, talk: 1700, none: 0 };

/** Braço direito (e cabeça) de um gesto: ombro x/z, cotovelo, inclinação do item e cabeça. */
interface ArmPose {
  shRx: number;
  shRz: number;
  /** Giro do braço no próprio eixo (leva o antebraço dobrado para fora). */
  shRy?: number;
  elR: number;
  tilt: number;
  headX: number;
}

const GESTURE_POSE: Record<Exclude<HeldGesture, "none">, ArmPose> = {
  sip: { shRx: -1.62, shRz: 0.5, elR: -1.25, tilt: -0.75, headX: -0.12 },
  nibble: { shRx: -1.5, shRz: 0.45, elR: -1.2, tilt: -0.25, headX: 0.04 },
  sniff: { shRx: -1.5, shRz: 0.48, elR: -1.25, tilt: -0.2, headX: 0.1 },
  talk: { shRx: -1.45, shRz: 0.46, elR: -1.3, tilt: -0.55, headX: -0.04 },
  lift: { shRx: -0.25, shRz: -2.7, elR: -0.3, tilt: 0, headX: -0.22 },
  read: { shRx: -1.0, shRz: 0.34, elR: -1.3, tilt: -0.4, headX: 0.26 },
};

const smooth01 = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/** Envelope de um gesto: sobe no primeiro quarto, segura e desce no último. */
const envelope = (k: number) => smooth01(Math.min(k / 0.25, (1 - k) / 0.25));

/** Base de surfista na prancha flutuante. */
const SURF = { hipL: -0.32, hipR: 0.28, knL: 0.42, knR: 0.5, shLx: -0.15, shRx: 0.1, shLz: 0.75, shRz: -0.6, elL: -0.35, elR: -0.4, bodyY: -0.03, spineX: 0.16, spineZ: 0, headX: -0.06 } as const;
const SURF_KEYS = Object.keys(SURF) as Array<keyof typeof SURF>;

const _qChain = new THREE.Quaternion();
const _qTilt = new THREE.Quaternion();
const _axisX = new THREE.Vector3(1, 0, 0);

interface Pose {
  bodyY: number;
  hipsY: number;
  hipsX: number;
  spineX: number;
  spineZ: number;
  headX: number;
  headY: number;
  headZ: number;
  shLx: number;
  shLz: number;
  shRx: number;
  shRz: number;
  shRy: number;
  elL: number;
  elR: number;
  hipL: number;
  hipR: number;
  knL: number;
  knR: number;
  /** Inclinação do item na mão (rad, em torno do eixo lateral; positivo leva o topo para a frente). */
  tilt: number;
}

const p: Pose = { bodyY: 0, hipsY: HIP_Y, hipsX: 0, spineX: 0, spineZ: 0, headX: 0, headY: 0, headZ: 0, shLx: 0, shLz: 0, shRx: 0, shRz: 0, shRy: 0, elL: 0, elR: 0, hipL: 0, hipR: 0, knL: 0, knR: 0, tilt: 0 };

/**
 * Pose do braço direito com o item (e o gesto parado ou da atividade). Mexe em `p`.
 * Devolve a expressão do gesto, se houver.
 */
function holdPose(st: AnimState, anim: Anim, moving: boolean, now: number, t: number, emoting: boolean): Expression | null {
  p.tilt = 0;
  const act = st.handAct;
  if (act) {
    const env = envelope(act.k);
    if (act.kind === "water") {
      // regando: braço para a frente, regador inclinado com um balanço de quem despeja
      const pour = 0.95 + Math.sin(act.t * 7) * 0.08;
      blendArm({ shRx: -1.0, shRz: -0.16, elR: -0.32, tilt: pour, headX: 0.2 }, env);
      return act.k > 0.25 && act.k < 0.85 ? "happy" : null;
    }
    // carinho: mão para a frente, dando tapinhas
    const pat = Math.sin(act.t * 13) * 0.18;
    blendArm({ shRx: -1.15 + pat * 0.4, shRz: 0.12, elR: -0.45 + pat, tilt: 0, headX: 0.12 }, env);
    return "happy";
  }

  const item = st.hold;
  if (item !== st.lastHold) {
    st.lastHold = item;
    st.gestureAt = 0;
    // pegou algo agora: o primeiro gole vem logo
    st.nextGestureAt = now + 2600;
  }
  if (!item) return null;
  const rule = VIVO_HELD[item];

  // segurando, conforme o movimento
  const run = anim === "run";
  if (rule.grip === "low") {
    const swing = moving ? Math.sin(st.phase) * (run ? 0.25 : 0.14) : 0.03 * Math.sin(t * 1.3);
    p.shRx = -0.12 - swing;
    p.shRz = -0.22;
    p.elR = -0.22;
  } else if (anim === "sit") {
    p.shRx = -0.6;
    p.shRz = -0.25;
    p.shRy = -0.4;
    p.elR = -0.95;
  } else if (moving) {
    // braço um pouco aberto: o item aparece ao lado do corpo também para quem vê de costas
    const bob = Math.sin(st.phase * 2) * 0.04;
    p.shRx = (run ? -0.45 : -0.34) + bob;
    p.shRz = run ? -0.3 : -0.32;
    p.shRy = -0.5;
    p.elR = run ? -1.55 : -1.45;
  } else {
    p.shRx = -0.34 + 0.03 * Math.sin(t * 1.1);
    p.shRz = -0.32;
    p.shRy = -0.6;
    p.elR = -1.45;
  }

  // gesto parado de vez em quando (gole, cheirar, erguer...)
  const g = rule.gesture;
  if (g === "none") return null;
  const dur = GESTURE_MS[g];
  if (moving || emoting) {
    if (st.gestureAt) st.gestureAt = 0;
    if (now > st.nextGestureAt - 1500) st.nextGestureAt = now + 1500;
    return null;
  }
  if (!st.gestureAt && now >= st.nextGestureAt) {
    st.gestureAt = now;
    st.nextGestureAt = now + dur + heldGestureGap(st.seed, st.gestureN++);
  }
  if (!st.gestureAt) return null;
  const k = (now - st.gestureAt) / dur;
  if (k >= 1) {
    st.gestureAt = 0;
    return null;
  }
  blendArm(GESTURE_POSE[g], envelope(k));
  if (g === "lift" && anim !== "sit") p.bodyY += Math.max(0, Math.sin(k * Math.PI * 3)) * 0.05;
  if (g === "sip" || g === "nibble") return k > 0.35 && k < 0.72 ? "blink" : null;
  if (g === "sniff" || g === "lift") return "happy";
  return null;
}

/** Mistura a pose atual do braço direito com a de um gesto. */
function blendArm(a: ArmPose, w: number): void {
  p.shRx += (a.shRx - p.shRx) * w;
  p.shRz += (a.shRz - p.shRz) * w;
  p.shRy += ((a.shRy ?? 0) - p.shRy) * w;
  p.elR += (a.elR - p.elR) * w;
  p.tilt += (a.tilt - p.tilt) * w;
  p.headX += (a.headX - p.headX) * w;
}

const EXPR: Partial<Record<Emote, Expression>> = { wave: "happy", dance: "happy", clap: "happy", cheer: "laugh", laugh: "laugh", heart: "heart", think: "think", point: "wink" };

/**
 * Aplica a pose do quadro.
 * @param speed velocidade atual (m/s), para o ritmo dos passos
 * @param seatHeight altura do assento quando sentado
 * @param emote emote ativo e há quanto tempo (s)
 */
export function animate(rig: AvatarRig, st: AnimState, anim: Anim, speed: number, dt: number, now: number, seatHeight: number, emote: { e: Emote; t: number } | null): void {
  const t = now / 1000;
  const moving = anim === "walk" || anim === "run";
  if (moving) st.phase += dt * (anim === "run" ? 13 : 9) * Math.min(1.4, Math.max(0.6, speed / 3.6));

  // Base: parado, respirando.
  const breathe = Math.sin(t * 2.1);
  p.bodyY = 0;
  p.hipsY = HIP_Y + breathe * 0.004;
  p.hipsX = 0;
  p.spineX = 0.03;
  p.spineZ = 0;
  p.headX = 0.02 + breathe * 0.01;
  p.headY = Math.sin(t * 0.45) * 0.12;
  p.headZ = Math.sin(t * 0.33) * 0.04;
  p.shLx = 0.04 * Math.sin(t * 1.1);
  p.shRx = -0.04 * Math.sin(t * 1.1);
  p.shLz = 0.13;
  p.shRz = -0.13;
  p.shRy = 0;
  p.elL = -0.18;
  p.elR = -0.18;
  p.hipL = 0;
  p.hipR = 0;
  p.knL = 0.02;
  p.knR = 0.02;

  if (moving) {
    const run = anim === "run";
    const a = Math.sin(st.phase);
    const amp = run ? 0.85 : 0.55;
    p.hipL = -a * amp;
    p.hipR = a * amp;
    p.knL = 0.1 + Math.max(0, Math.sin(st.phase + 1.2)) * (run ? 1.1 : 0.7);
    p.knR = 0.1 + Math.max(0, Math.sin(st.phase + 1.2 + Math.PI)) * (run ? 1.1 : 0.7);
    p.shLx = a * (run ? 0.9 : 0.5);
    p.shRx = -a * (run ? 0.9 : 0.5);
    p.shLz = 0.1;
    p.shRz = -0.1;
    p.elL = run ? -1.15 : -0.35;
    p.elR = run ? -1.15 : -0.35;
    p.bodyY = Math.abs(Math.cos(st.phase)) * (run ? 0.06 : 0.028);
    p.spineX = run ? 0.2 : 0.07;
    p.headY = 0;
    p.headX = run ? -0.1 : 0;
    // na prancha: base de surfista (um pé à frente, joelhos dobrados, braços abertos), sem passadas
    const k = st.board;
    if (k > 0.01) {
      const sway = Math.sin(st.phase * 0.35) * 0.06;
      for (const key of SURF_KEYS) p[key] += (SURF[key] - p[key]) * k;
      p.shLz += sway * k;
      p.shRz += sway * k;
      p.spineZ += sway * k;
    }
  } else if (anim === "sit") {
    p.hipsY = seatHeight + 0.04;
    p.hipL = -1.5;
    p.hipR = -1.5;
    p.knL = 1.45;
    p.knR = 1.45;
    p.shLx = -0.4;
    p.shRx = -0.4;
    p.elL = -0.85;
    p.elR = -0.85;
    p.shLz = 0.08;
    p.shRz = -0.08;
    p.spineX = -0.02;
  }

  // Item na mão direita: braço segurando, gesto parado de vez em quando, ou o gesto de uma atividade.
  const handExpr = holdPose(st, anim, moving, now, t, emote !== null);

  // Emote por cima (corpo de cima; pernas continuam o que estavam fazendo).
  if (emote) {
    const k = emote.t;
    const fade = Math.min(1, k * 6);
    const e = emote.e;
    if (e === "wave") {
      p.shRz = -2.5 + Math.sin(k * 11) * 0.28;
      p.shRx = -0.25;
      p.elR = -0.45;
      p.headZ = 0.12;
    } else if (e === "dance") {
      const b = k * 6.2;
      p.hipsX = Math.sin(b) * 0.05;
      p.spineZ = Math.sin(b) * 0.18;
      p.shLz = 0.5 + Math.max(0, Math.sin(b)) * 1.7;
      p.shRz = -(0.5 + Math.max(0, -Math.sin(b)) * 1.7);
      p.shLx = -0.3;
      p.shRx = -0.3;
      p.elL = -0.7;
      p.elR = -0.7;
      p.headZ = Math.sin(b * 0.5) * 0.18;
      if (anim !== "sit" && !moving) {
        p.knL = 0.25 + Math.abs(Math.sin(b)) * 0.35;
        p.knR = p.knL;
        p.hipL = -p.knL * 0.5;
        p.hipR = p.hipL;
        p.bodyY = -Math.abs(Math.sin(b)) * 0.035;
      }
    } else if (e === "clap") {
      const c = 0.5 + 0.5 * Math.sin(k * 17);
      p.shLx = -1.15;
      p.shRx = -1.15;
      p.shLz = 0.12 + c * 0.28;
      p.shRz = -(0.12 + c * 0.28);
      p.elL = -0.75;
      p.elR = -0.75;
    } else if (e === "cheer") {
      p.shLz = 2.7;
      p.shRz = -2.7;
      p.shLx = -0.2;
      p.shRx = -0.2;
      p.elL = -0.25;
      p.elR = -0.25;
      p.headX = -0.15;
      if (anim !== "sit") p.bodyY = Math.abs(Math.sin(k * 7)) * 0.18;
    } else if (e === "point") {
      p.shRx = -1.5;
      p.shRz = -0.12;
      p.elR = -0.05;
      p.headY = -0.15;
    } else if (e === "think") {
      p.shRx = -1.05;
      p.shRz = -0.3;
      p.elR = -2.15;
      p.headZ = 0.16;
      p.headX = -0.1;
    } else if (e === "laugh") {
      p.spineX = -0.14 + Math.sin(k * 20) * 0.04;
      p.headX = -0.22;
      p.shLx = -0.35;
      p.shRx = -0.35;
      p.elL = -1.0;
      p.elR = -1.0;
    } else if (e === "heart") {
      p.shLz = 2.35;
      p.shRz = -2.35;
      p.shLx = -0.55;
      p.shRx = -0.55;
      p.elL = -1.55;
      p.elR = -1.55;
    }
    void fade;
    // o emote usa o braço do jeito dele: sem o giro de quem segura um copo
    p.shRy = 0;
  }

  // Juntas seguem a pose alvo suavemente.
  const s = 1 - Math.exp(-dt * 14);
  const l = (cur: number, target: number) => cur + (target - cur) * s;
  rig.body.position.y = l(rig.body.position.y, p.bodyY);
  rig.hips.position.y = l(rig.hips.position.y, p.hipsY);
  rig.hips.position.x = l(rig.hips.position.x, p.hipsX);
  rig.spine.rotation.x = l(rig.spine.rotation.x, p.spineX);
  rig.spine.rotation.z = l(rig.spine.rotation.z, p.spineZ);
  rig.head.rotation.x = l(rig.head.rotation.x, p.headX);
  rig.head.rotation.y = l(rig.head.rotation.y, p.headY);
  rig.head.rotation.z = l(rig.head.rotation.z, p.headZ);
  rig.shoulderL.rotation.x = l(rig.shoulderL.rotation.x, p.shLx);
  rig.shoulderL.rotation.z = l(rig.shoulderL.rotation.z, p.shLz);
  rig.shoulderR.rotation.x = l(rig.shoulderR.rotation.x, p.shRx);
  rig.shoulderR.rotation.z = l(rig.shoulderR.rotation.z, p.shRz);
  rig.shoulderR.rotation.y = l(rig.shoulderR.rotation.y, p.shRy);
  rig.elbowL.rotation.x = l(rig.elbowL.rotation.x, p.elL);
  rig.elbowR.rotation.x = l(rig.elbowR.rotation.x, p.elR);
  rig.hipL.rotation.x = l(rig.hipL.rotation.x, p.hipL);
  rig.hipR.rotation.x = l(rig.hipR.rotation.x, p.hipR);
  rig.kneeL.rotation.x = l(rig.kneeL.rotation.x, p.knL);
  rig.kneeR.rotation.x = l(rig.kneeR.rotation.x, p.knR);
  st.tilt = l(st.tilt, p.tilt);

  // O item fica de pé no mundo: desfaz a rotação de tronco, ombro e cotovelo e aplica só a inclinação do gesto.
  if (st.hold) {
    _qChain.copy(rig.spine.quaternion).multiply(rig.shoulderR.quaternion).multiply(rig.elbowR.quaternion).invert();
    _qTilt.setFromAxisAngle(_axisX, st.tilt);
    rig.handR.quaternion.copy(_qChain).multiply(_qTilt);
  }

  // Expressão: emote manda; depois o gesto com o item; senão, pisca de vez em quando.
  let expr: Expression = emote ? (EXPR[emote.e] ?? "neutral") : (handExpr ?? "neutral");
  if (!emote && !handExpr) {
    if (now >= st.blinkAt) {
      st.blinkUntil = now + 120;
      st.blinkAt = now + 2200 + Math.random() * 3500;
    }
    if (now < st.blinkUntil) expr = "blink";
  }
  if (expr !== st.expr) {
    st.expr = expr;
    rig.setExpression(expr);
  }
}
