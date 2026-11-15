import type { Anim, Emote } from "@infinity/world";
import { HIP_Y, type AvatarRig } from "./build.ts";
import type { Expression } from "./face.ts";

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
}

export const newAnimState = (): AnimState => ({ phase: 0, blinkAt: performance.now() + 1500 + Math.random() * 3000, blinkUntil: 0, expr: "neutral" });

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
  elL: number;
  elR: number;
  hipL: number;
  hipR: number;
  knL: number;
  knR: number;
}

const p: Pose = { bodyY: 0, hipsY: HIP_Y, hipsX: 0, spineX: 0, spineZ: 0, headX: 0, headY: 0, headZ: 0, shLx: 0, shLz: 0, shRx: 0, shRz: 0, elL: 0, elR: 0, hipL: 0, hipR: 0, knL: 0, knR: 0 };

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
  rig.elbowL.rotation.x = l(rig.elbowL.rotation.x, p.elL);
  rig.elbowR.rotation.x = l(rig.elbowR.rotation.x, p.elR);
  rig.hipL.rotation.x = l(rig.hipL.rotation.x, p.hipL);
  rig.hipR.rotation.x = l(rig.hipR.rotation.x, p.hipR);
  rig.kneeL.rotation.x = l(rig.kneeL.rotation.x, p.knL);
  rig.kneeR.rotation.x = l(rig.kneeR.rotation.x, p.knR);

  // Expressão: emote manda; senão, pisca de vez em quando.
  let expr: Expression = emote ? (EXPR[emote.e] ?? "neutral") : "neutral";
  if (!emote) {
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
