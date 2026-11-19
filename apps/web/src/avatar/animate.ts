import * as THREE from "three";
import { RUN_SPEED, VIVO_HELD, WALK_SPEED, heldGestureGap, type Anim, type Emote, type HeldGesture, type HeldItem } from "@infinity/world";
import { CLIPS, type AvatarRig, type Clip } from "./build.ts";
import type { Expression } from "./face.ts";
import type { HandActionKind } from "./hands.ts";

/**
 * Animação do avatar: as animações do pacote (parado, andando, correndo, sentado) tocam num
 * AnimationMixer com transição suave; por cima vão as poses procedurais de emote, item na mão e gesto
 * de atividade (braços e pernas trocados pela pose, tronco e cabeça somados), também suavizadas.
 *
 * Convenções das poses (frente = +Z), as mesmas do avatar antigo: o braço parte pendurado; rotation.x
 * negativo leva braço/perna para a frente; cotovelo negativo dobra trazendo a mão para a frente (o braço
 * do pacote é inteiriço, então a dobra entra pela metade no ombro). Ombro esquerdo (+X) abre com z
 * positivo, o direito (-X) com z negativo.
 */

/** Pose procedural: tronco e cabeça somam à animação; braços e pernas trocam por ela, com o peso `w*`. */
interface Pose {
  bodyY: number;
  bodyX: number;
  /** Altura do corpo sentado (assento). */
  seatY: number;
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
  wArmL: number;
  wArmR: number;
  wLegs: number;
  /** Inclinação do item na mão (rad, em torno do eixo lateral; positivo leva o topo para a frente). */
  tilt: number;
}

const newPose = (): Pose => ({ bodyY: 0, bodyX: 0, seatY: 0, spineX: 0, spineZ: 0, headX: 0, headY: 0, headZ: 0, shLx: 0, shLz: 0, shRx: 0, shRz: 0, shRy: 0, elL: 0, elR: 0, hipL: 0, hipR: 0, wArmL: 0, wArmR: 0, wLegs: 0, tilt: 0 });
const POSE_KEYS = Object.keys(newPose()) as Array<keyof Pose>;

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
  /** Em cima da prancha flutuante (0 a 1, suavizado por quem desenha). */
  board: number;
  /** Peso atual de cada animação do pacote. */
  w: Record<Clip, number>;
  /** Pose procedural suavizada. */
  cur: Pose;
  /** Rotação que o mixer deixou em cada osso mexido pela pose (desfeita antes do próximo quadro). */
  mixed: THREE.Quaternion[];
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
  board: 0,
  w: { idle: 1, walk: 0, sprint: 0, sit: 0 },
  cur: newPose(),
  mixed: Array.from({ length: 6 }, () => new THREE.Quaternion()),
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

/** Base de surfista na prancha flutuante (um pé à frente, braços abertos). */
const SURF = { hipL: -0.32, hipR: 0.28, shLx: -0.15, shRx: 0.1, shLz: 0.75, shRz: -0.6, elL: -0.35, elR: -0.4, bodyY: -0.03, spineX: 0.16, headX: -0.06 } as const;

/** Altura do corpo sentado acima do assento (a animação do pacote já baixa o quadril). */
const SIT_Y = 0.05;

const p = newPose();
const _q = new THREE.Quaternion();
const _qTilt = new THREE.Quaternion();
const _e = new THREE.Euler();
const _axisX = new THREE.Vector3(1, 0, 0);
const _axisZ = new THREE.Vector3(0, 0, 1);
/** Do braço do pacote (esticado para o lado) ao braço pendurado, de onde partem as poses. */
const DOWN_L = new THREE.Quaternion().setFromAxisAngle(_axisZ, -Math.PI / 2);
const DOWN_R = new THREE.Quaternion().setFromAxisAngle(_axisZ, Math.PI / 2);

/**
 * Pose do braço direito com o item (e o gesto parado ou da atividade). Mexe em `p`.
 * Devolve a expressão do gesto, se houver.
 */
function holdPose(st: AnimState, anim: Anim, moving: boolean, now: number, t: number, emoting: boolean): Expression | null {
  const act = st.handAct;
  if (act) {
    p.wArmR = 1;
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
  p.wArmR = 1;

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

/** Emote por cima (corpo de cima; as pernas seguem a animação). Mexe em `p`. */
function emotePose(e: Emote, k: number, anim: Anim, moving: boolean): void {
  p.wArmR = 1;
  p.wArmL = e === "wave" || e === "point" || e === "think" ? p.wArmL : 1;
  // o emote usa o braço do jeito dele: sem o giro de quem segura um copo
  p.shRy = 0;
  if (e === "wave") {
    p.shRz = -2.5 + Math.sin(k * 11) * 0.28;
    p.shRx = -0.25;
    p.elR = -0.45;
    p.headZ = 0.12;
  } else if (e === "dance") {
    const b = k * 6.2;
    p.bodyX = Math.sin(b) * 0.05;
    p.spineZ = Math.sin(b) * 0.18;
    p.shLz = 0.5 + Math.max(0, Math.sin(b)) * 1.7;
    p.shRz = -(0.5 + Math.max(0, -Math.sin(b)) * 1.7);
    p.shLx = -0.3;
    p.shRx = -0.3;
    p.elL = -0.7;
    p.elR = -0.7;
    p.headZ = Math.sin(b * 0.5) * 0.18;
    if (anim !== "sit" && !moving) p.bodyY = -Math.abs(Math.sin(b)) * 0.035;
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
}

const EXPR: Partial<Record<Emote, Expression>> = { wave: "happy", dance: "happy", clap: "happy", cheer: "laugh", laugh: "laugh", heart: "heart", think: "think", point: "wink" };

/** Braço inteiriço na pose (ombro x/y/z com metade da dobra do cotovelo), misturado à animação pelo peso. */
function poseArm(bone: THREE.Bone, x: number, y: number, z: number, el: number, down: THREE.Quaternion, w: number): void {
  if (w < 0.002) return;
  _q.setFromEuler(_e.set(x + el * 0.5, y, z)).multiply(down);
  bone.quaternion.slerp(_q, Math.min(1, w));
}

function poseLeg(bone: THREE.Bone, x: number, w: number): void {
  if (w < 0.002) return;
  _q.setFromEuler(_e.set(x, 0, 0));
  bone.quaternion.slerp(_q, Math.min(1, w));
}

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

  // Base: só a vida da cabeça; braços e pernas ficam com a animação do pacote.
  const breathe = Math.sin(t * 2.1);
  for (const key of POSE_KEYS) p[key] = 0;
  p.headX = 0.02 + breathe * 0.01;
  p.headY = Math.sin(t * 0.45) * 0.12;
  p.headZ = Math.sin(t * 0.33) * 0.04;
  // braços pendurados como na animação parada (ponto de partida dos gestos)
  p.shLz = 0.13;
  p.shRz = -0.13;
  p.elL = -0.18;
  p.elR = -0.18;
  // parado ou sentado, braços mais perto do corpo que no pacote (lá ficam abertos a 45°)
  if (!moving) p.wArmL = p.wArmR = 0.5;

  if (moving) {
    p.headY = 0;
    p.headX = anim === "run" ? -0.1 : 0;
    // na prancha: base de surfista no lugar das passadas
    const k = st.board;
    if (k > 0.01) {
      const sway = Math.sin(st.phase * 0.35) * 0.06;
      p.hipL = SURF.hipL;
      p.hipR = SURF.hipR;
      p.shLx = SURF.shLx;
      p.shRx = SURF.shRx;
      p.shLz = SURF.shLz + sway;
      p.shRz = SURF.shRz + sway;
      p.elL = SURF.elL;
      p.elR = SURF.elR;
      p.wLegs = p.wArmL = p.wArmR = k;
      p.bodyY = SURF.bodyY * k;
      p.spineX = SURF.spineX * k;
      p.spineZ = sway * k;
      p.headX += (SURF.headX - p.headX) * k;
    }
  } else if (anim === "sit") {
    p.seatY = seatHeight + SIT_Y;
  }

  // Item na mão direita: braço segurando, gesto parado de vez em quando, ou o gesto de uma atividade.
  const handExpr = holdPose(st, anim, moving, now, t, emote !== null);
  if (emote) emotePose(emote.e, emote.t, anim, moving);

  // Animação do pacote: troca suave entre parado, andando, correndo e sentado.
  const clip: Clip = anim === "sit" ? "sit" : moving && st.board < 0.5 ? (anim === "run" ? "sprint" : "walk") : "idle";
  const fade = 1 - Math.exp(-dt * 10);
  for (const c of CLIPS) {
    st.w[c] += ((c === clip ? 1 : 0) - st.w[c]) * fade;
    rig.actions[c].setEffectiveWeight(st.w[c]);
  }
  rig.actions.walk.timeScale = Math.min(1.4, Math.max(0.6, speed / WALK_SPEED));
  rig.actions.sprint.timeScale = Math.min(1.4, Math.max(0.6, speed / RUN_SPEED));
  const { root, torso, head, armL, armR, legL, legR } = rig.bones;
  const posed = [torso, head, armL, armR, legL, legR];
  // O mixer só regrava o osso quando o valor dele muda: devolve o que ele deixou antes de mexer de novo.
  for (let i = 0; i < posed.length; i++) posed[i]!.quaternion.copy(st.mixed[i]!);
  rig.mixer.update(dt);
  for (let i = 0; i < posed.length; i++) st.mixed[i]!.copy(posed[i]!.quaternion);

  // Pose procedural segue o alvo suavemente e entra por cima da animação.
  const s = 1 - Math.exp(-dt * 14);
  const c = st.cur;
  for (const key of POSE_KEYS) c[key] += (p[key] - c[key]) * s;
  rig.body.position.set(c.bodyX, c.seatY + c.bodyY, 0);
  torso.quaternion.multiply(_q.setFromEuler(_e.set(c.spineX, 0, c.spineZ)));
  head.quaternion.multiply(_q.setFromEuler(_e.set(c.headX, c.headY, c.headZ)));
  poseArm(armL, c.shLx, 0, c.shLz, c.elL, DOWN_L, c.wArmL);
  poseArm(armR, c.shRx, c.shRy, c.shRz, c.elR, DOWN_R, c.wArmR);
  poseLeg(legL, c.hipL, c.wLegs);
  poseLeg(legR, c.hipR, c.wLegs);

  // O item fica de pé no mundo: desfaz a rotação do corpo até o braço e aplica só a inclinação do gesto.
  if (st.hold) {
    _q.copy(root.quaternion).multiply(torso.quaternion).multiply(armR.quaternion).invert();
    _qTilt.setFromAxisAngle(_axisX, c.tilt);
    rig.handR.quaternion.copy(_q).multiply(_qTilt);
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
