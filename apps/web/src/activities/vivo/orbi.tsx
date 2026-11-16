import { useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { Bot } from "lucide-react";
import {
  ORBI_CALL_RANGE,
  ORBI_ID,
  ORBI_KIND,
  ORBI_PET_MS,
  ORBI_PET_RANGE,
  orbiPoseAt,
  yawOf,
  type Lens,
  type OrbiPose,
  type OrbiState,
} from "@infinity/world";
import { actState, sendAct, useAct, type ActivityClient, type DynamicTarget } from "../registry.ts";
import { sfx } from "../../audio/sfx.ts";
import { toast } from "../../ui/toasts.ts";
import { useApp } from "../../state/store.ts";
import { self } from "../../world/registry.ts";
import { avatarRig, playHandAction } from "../../avatar/hands.ts";
import { Builder, C, T as Tones, lit, mix } from "../../scene/furniture/core.ts";
import { serverNow } from "./clock.ts";
import { Particles, flatMaterial, heartGeometry } from "./particles.ts";
import { T } from "./strings.ts";

/**
 * Orbi, o robô mascote da estação: passeia pelas áreas comuns, segue quem chama e curte carinho.
 * O servidor manda só o trajeto e a hora de saída; aqui cada cliente calcula onde ele está.
 */

/** Onde o Orbi está agora (lido pelos alvos de interação, ~10x por segundo). */
const where: OrbiPose & { y: number; ready: boolean } = { x: 0, z: 0, yaw: 0, moving: false, y: 0, ready: false };
/** Carinho recebido agora (para corações e olhos felizes). */
let petAt = 0;
let callAt = 0;

const targets: DynamicTarget[] = [];
const petTarget: DynamicTarget = { key: "orbi:pet", point: { x: 0, z: 0 }, radius: ORBI_PET_RANGE - 0.3, priority: -1, label: T.orbi.pet, run: () => sendAct(ORBI_ID, "pet") };
const callTarget: DynamicTarget = { key: "orbi:call", point: { x: 0, z: 0 }, radius: Math.min(3.5, ORBI_CALL_RANGE - 1.2), priority: -1, label: T.orbi.call, run: () => sendAct(ORBI_ID, "call") };

export const orbiClient: ActivityClient = {
  name: "vivo/orbi",
  kinds: [ORBI_KIND],
  targets: () => {
    targets.length = 0;
    if (!where.ready) return targets;
    const s = actState<OrbiState>(ORBI_ID);
    const me = useApp.getState().selfId;
    const d = Math.hypot(where.x - self.x, where.z - self.z);
    petTarget.point = callTarget.point = { x: where.x, z: where.z };
    if (d <= petTarget.radius) targets.push(petTarget);
    else if (s?.follow?.id !== me) targets.push(callTarget);
    return targets;
  },
  onEvent: (e) => {
    const me = useApp.getState().selfId;
    if (e.ev === "pet") {
      petAt = performance.now();
      sfx("vivo-orbi-happy", { at: { x: where.x, z: where.z }, volume: 0.55, range: 10 });
      if (e.from) {
        const rig = avatarRig(e.from);
        const pos = e.from === me ? self : rig ? { x: rig.root.position.x, z: rig.root.position.z } : null;
        const face = pos ? yawOf({ x: where.x - pos.x, z: where.z - pos.z }) : undefined;
        playHandAction(e.from, "pet", 1600, face === undefined ? {} : { face });
      }
      return;
    }
    if (e.ev === "call") {
      callAt = performance.now();
      sfx("vivo-orbi-call", { at: { x: where.x, z: where.z }, volume: 0.55, range: 12 });
      return;
    }
    if (e.ev === "bye") {
      const reason = (e.data as { reason?: string } | undefined)?.reason;
      toast(reason === "room" ? T.orbi.waitedOutside : T.orbi.backToWander);
    }
  },
  Overlay: OrbiOverlay,
  Scene: OrbiScene,
};

// ---- interface ----------------------------------------------------------------------------

function OrbiOverlay() {
  const s = useAct<OrbiState>(ORBI_ID);
  const me = useApp((st) => st.selfId);
  const following = !!s?.follow && s.follow.id === me;
  return (
    <AnimatePresence>
      {following && (
        <motion.div
          key="orbi"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="glass pointer-events-auto absolute bottom-[calc(max(12px,env(safe-area-inset-bottom))+128px)] left-3 z-20 flex items-center gap-2 rounded-full py-1 pl-1 pr-1 text-sm text-offwhite"
          role="status"
          aria-live="polite"
        >
          <span className="grid size-7 place-items-center rounded-full bg-card text-sky" aria-hidden>
            <Bot className="size-4" />
          </span>
          <span className="pr-1">{T.orbi.following}</span>
          <button
            type="button"
            onClick={() => sendAct(ORBI_ID, "dismiss")}
            aria-label={T.orbi.dismissHint}
            title={T.orbi.dismissHint}
            className="rounded-full px-2.5 py-1 text-xs text-offwhite/85 transition-colors hover:bg-offwhite/10 hover:text-offwhite"
          >
            {T.orbi.dismiss}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---- modelo -------------------------------------------------------------------------------

interface OrbiModel {
  root: THREE.Group;
  /** Corpo que flutua e inclina. */
  body: THREE.Group;
  head: THREE.Group;
  eyes: THREE.Group;
  happy: THREE.Group;
  bulb: THREE.Mesh;
  ring: THREE.Mesh;
  shadow: THREE.Mesh;
  hands: [THREE.Mesh, THREE.Mesh];
  dispose(): void;
}

/** Tamanho do Orbi (o modelo é feito em ~0,55 m de altura). */
const SCALE = 1.22;

function buildOrbi(): OrbiModel {
  const owned: Array<THREE.BufferGeometry | THREE.Material> = [];
  const root = new THREE.Group();
  root.name = "orbi";
  const body = new THREE.Group();
  body.scale.setScalar(SCALE);
  root.add(body);

  // casco: ovo branco com faixa azul-marinho e "orelhas" de disco
  const shell = new Builder();
  shell.lathe(
    C.offwhite,
    [
      [0, 0],
      [0.12, 0.01],
      [0.2, 0.06],
      [0.235, 0.14],
      [0.24, 0.22],
      [0.225, 0.3],
      [0.18, 0.37],
      [0.1, 0.41],
      [0, 0.42],
    ],
    0,
    0,
    0,
    { seg: 28 },
  );
  shell.lathe(C.navy, [[0.243, 0.135], [0.247, 0.16], [0.243, 0.185]], 0, 0, 0, { seg: 28 });
  shell.cyl(mix(C.navy, C.signal, 0.2), 0.03, 0.035, 0, 0.005, 0, { seg: 12 });
  // painel das costas com três luzinhas (para ninguém ver só um ovo branco de costas)
  shell.box(C.navy, 0.16, 0.12, 0.04, 0, 0.26, -0.215, { r: 0.02, rx: 0.12 });
  for (let i = 0; i < 3; i++) shell.box(lit(i === 1 ? C.signal : C.sky), 0.022, 0.022, 0.01, (i - 1) * 0.04, 0.26, -0.238, { r: 0.004, rx: 0.12 });
  for (const s of [-1, 1]) {
    shell.cyl(C.navy, 0.065, 0.04, s * 0.235, 0.25, 0, { rz: Math.PI / 2, seg: 18 });
    shell.cyl(Tones.steel, 0.04, 0.045, s * 0.24, 0.25, 0, { rz: Math.PI / 2, seg: 14 });
  }
  const parts = shell.finish().parts;
  for (const p of parts) {
    owned.push(p.geometry);
    body.add(new THREE.Mesh(p.geometry, p.material));
  }

  // cabeça (visor e olhos), que olha um pouco para os lados
  const head = new THREE.Group();
  head.position.set(0, 0.25, 0);
  body.add(head);
  const visorGeo = new THREE.SphereGeometry(0.2, 24, 16, -0.95, 1.9, 0.95, 1.05);
  const visorMat = new THREE.MeshToonMaterial({ color: "#071A33" });
  owned.push(visorGeo, visorMat);
  const visor = new THREE.Mesh(visorGeo, visorMat);
  visor.position.set(0, -0.02, 0.045);
  visor.rotation.y = 0;
  visor.scale.set(1, 0.9, 1);
  head.add(visor);
  // os olhos olham para +Z (frente do Orbi)
  const eyeMat = new THREE.MeshBasicMaterial({ color: C.signal, toneMapped: false });
  owned.push(eyeMat);
  const eyes = new THREE.Group();
  head.add(eyes);
  const eyeGeo = new THREE.CapsuleGeometry(0.027, 0.045, 4, 10);
  owned.push(eyeGeo);
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(eyeGeo, eyeMat);
    e.position.set(s * 0.065, 0.0, 0.235);
    eyes.add(e);
  }
  // olhos felizes: arquinhos ^ ^
  const happy = new THREE.Group();
  head.add(happy);
  const arcGeo = new THREE.TorusGeometry(0.03, 0.011, 6, 14, Math.PI);
  owned.push(arcGeo);
  for (const s of [-1, 1]) {
    const a = new THREE.Mesh(arcGeo, eyeMat);
    a.position.set(s * 0.065, -0.005, 0.236);
    happy.add(a);
  }
  happy.visible = false;

  // antena com a luz na ponta
  const stemGeo = new THREE.CylinderGeometry(0.008, 0.01, 0.14, 8);
  const stemMat = new THREE.MeshToonMaterial({ color: C.graphite });
  owned.push(stemGeo, stemMat);
  const stem = new THREE.Mesh(stemGeo, stemMat);
  stem.position.set(0, 0.48, -0.02);
  stem.rotation.x = -0.15;
  body.add(stem);
  const bulbGeo = new THREE.SphereGeometry(0.028, 12, 10);
  const bulbMat = new THREE.MeshBasicMaterial({ color: C.orange, toneMapped: false });
  owned.push(bulbGeo, bulbMat);
  const bulb = new THREE.Mesh(bulbGeo, bulbMat);
  bulb.position.set(0, 0.555, -0.03);
  body.add(bulb);

  // mãozinhas flutuantes
  const handGeo = new THREE.SphereGeometry(0.045, 12, 10);
  const handMat = new THREE.MeshToonMaterial({ color: C.offwhite });
  owned.push(handGeo, handMat);
  const hands: [THREE.Mesh, THREE.Mesh] = [new THREE.Mesh(handGeo, handMat), new THREE.Mesh(handGeo, handMat)];
  hands[0].position.set(0.3, 0.12, 0.04);
  hands[1].position.set(-0.3, 0.12, 0.04);
  body.add(hands[0], hands[1]);

  // anel de flutuação e sombra no chão (ficam no chão, fora do corpo)
  const ringGeo = new THREE.TorusGeometry(0.16, 0.014, 6, 32);
  const ringMat = new THREE.MeshBasicMaterial({ color: C.signal, toneMapped: false, transparent: true, opacity: 0.7, depthWrite: false });
  owned.push(ringGeo, ringMat);
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  root.add(ring);
  const shadowGeo = new THREE.CircleGeometry(0.2, 24);
  const shadowMat = new THREE.MeshBasicMaterial({ color: "#000814", transparent: true, opacity: 0.16, depthWrite: false });
  owned.push(shadowGeo, shadowMat);
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  root.add(shadow);

  return {
    root,
    body,
    head,
    eyes,
    happy,
    bulb,
    ring,
    shadow,
    hands,
    dispose: () => owned.forEach((o) => o.dispose()),
  };
}

// ---- no mundo -----------------------------------------------------------------------------

const HOVER = 0.48;
const _pose: OrbiPose = { x: 0, z: 0, yaw: 0, moving: false };
const ORANGE = new THREE.Color(C.orange);
const ORANGE_DIM = new THREE.Color(mix(C.orange, C.navyDeep, 0.6));
const PINK = new THREE.Color(C.pink);
const HEART_ORANGE = new THREE.Color("#FF8A65");

function OrbiScene({ lens }: { lens: Lens }) {
  const camera = useThree((s) => s.camera);
  const model = useMemo(buildOrbi, []);
  const hearts = useMemo(() => {
    const p = new Particles(heartGeometry(), flatMaterial({ side: THREE.DoubleSide }), 40);
    p.billboard = true;
    return p;
  }, []);
  const label = useRef<HTMLDivElement>(null);
  const anim = useRef({ x: 0, z: 0, yaw: 0, init: false, lean: 0, lastMode: "", lastPet: 0, look: 0 });

  useEffect(
    () => () => {
      model.dispose();
      hearts.dispose();
      where.ready = false;
    },
    [model, hearts],
  );

  useFrame((_, dt) => {
    const s = actState<OrbiState>(ORBI_ID);
    if (!s) {
      model.root.visible = false;
      return;
    }
    model.root.visible = true;
    const now = serverNow();
    orbiPoseAt(s, now, _pose);
    const a = anim.current;
    const t = performance.now() / 1000;
    // segue a pose calculada suavemente (um estado novo nunca dá salto brusco)
    if (!a.init) {
      a.x = _pose.x;
      a.z = _pose.z;
      a.yaw = _pose.yaw;
      a.init = true;
    }
    const k = 1 - Math.exp(-dt * 10);
    a.x += (_pose.x - a.x) * k;
    a.z += (_pose.z - a.z) * k;
    a.yaw += Math.atan2(Math.sin(_pose.yaw - a.yaw), Math.cos(_pose.yaw - a.yaw)) * (1 - Math.exp(-dt * 6));
    where.x = a.x;
    where.z = a.z;
    where.yaw = a.yaw;
    where.moving = _pose.moving;
    where.ready = true;

    const petting = performance.now() - petAt < ORBI_PET_MS;
    const pk = petting ? (performance.now() - petAt) / ORBI_PET_MS : 1;
    const calling = performance.now() - callAt < 900;

    model.root.position.set(a.x, 0, a.z);
    model.root.rotation.y = Math.PI - a.yaw + (petting ? Math.sin(pk * Math.PI * 2) * Math.PI * (pk < 0.5 ? 1 : 0) : 0);
    // flutua; inclina para a frente quando anda; pula de alegria no carinho
    const bob = Math.sin(t * 2.2) * 0.035 + (petting ? Math.abs(Math.sin(pk * Math.PI * 4)) * 0.12 * (1 - pk) : 0) + (calling ? Math.abs(Math.sin(t * 14)) * 0.05 : 0);
    model.body.position.y = HOVER + bob;
    a.lean += ((_pose.moving ? (s.mode === "follow" ? 0.28 : 0.16) : 0) - a.lean) * (1 - Math.exp(-dt * 5));
    model.body.rotation.x = a.lean;
    model.body.rotation.z = Math.sin(t * 1.3) * 0.04 + (petting ? Math.sin(pk * Math.PI * 6) * 0.15 * (1 - pk) : 0);
    // olha em volta quando descansa
    if (s.mode === "rest") a.look = Math.sin(t * 0.6) * 0.5 + Math.sin(t * 1.7) * 0.15;
    else a.look *= 1 - Math.min(1, dt * 4);
    model.head.rotation.y = a.look;
    // olhos: piscam; no carinho viram ^ ^
    const blink = (t % 3.7) < 0.12;
    model.eyes.visible = !petting;
    model.happy.visible = petting;
    model.eyes.scale.y = blink ? 0.15 : 1;
    // antena: pulsa devagar, rápido quando chamam ou no carinho
    const pulse = petting || calling ? 0.5 + 0.5 * Math.sin(t * 18) : 0.5 + 0.5 * Math.sin(t * 2.4);
    (model.bulb.material as THREE.MeshBasicMaterial).color.copy(ORANGE_DIM).lerp(ORANGE, pulse);
    // mãos: balançam; no carinho acenam
    const wave = petting ? Math.sin(t * 16) * 0.08 : 0;
    model.hands[0].position.y = 0.12 + Math.sin(t * 2.2 + 1) * 0.02 + (petting ? 0.14 : 0) + wave;
    model.hands[1].position.y = 0.12 + Math.sin(t * 2.2 + 2) * 0.02 + (petting ? 0.14 : 0) - wave;
    // anel e sombra acompanham a altura
    const h = model.body.position.y;
    model.ring.position.y = h - 0.03;
    model.ring.scale.setScalar(1 + Math.sin(t * 4) * 0.06);
    model.shadow.scale.setScalar(1.1 - (h - HOVER) * 1.5);

    // corações no carinho
    if (petting && pk < 0.6 && Math.random() < dt * 14) {
      hearts.spawn({ x: a.x + (Math.random() - 0.5) * 0.3, y: h + 0.5, z: a.z + (Math.random() - 0.5) * 0.3, vx: (Math.random() - 0.5) * 0.4, vy: 0.6 + Math.random() * 0.4, vz: (Math.random() - 0.5) * 0.4, life: 1.4, size: 0.12 + Math.random() * 0.06, drag: 0.5, color: Math.random() < 0.6 ? PINK : HEART_ORANGE });
    }
    hearts.update(dt, camera);

    // bipe quando chega a um lugar e há gente por perto
    if (s.mode !== a.lastMode) {
      if (s.mode === "rest" && a.lastMode === "wander" && Math.hypot(a.x - self.x, a.z - self.z) < 6) sfx("vivo-orbi-beep", { at: { x: a.x, z: a.z }, volume: 0.35, range: 8 });
      a.lastMode = s.mode;
    }

    // nome por cima, só para quem está perto (sem re-render do React)
    if (label.current) {
      const show = Math.hypot(a.x - self.x, a.z - self.z) < (lens === "2d" ? 9 : 7);
      if (label.current.dataset.show !== String(show)) {
        label.current.dataset.show = String(show);
        label.current.style.opacity = show ? "1" : "0";
      }
    }
  });

  return (
    <>
      <primitive object={model.root}>
        <Html position={[0, 1.38, 0]} center zIndexRange={[7, 0]} style={{ pointerEvents: "none" }}>
          <div ref={label} className="flex items-center gap-1 whitespace-nowrap rounded-full bg-space/85 px-2 py-0.5 text-[11px] font-semibold text-offwhite shadow-md transition-opacity duration-300" style={{ opacity: 0 }}>
            <Bot className="size-3 text-sky" aria-hidden />
            {T.orbi.name}
          </div>
        </Html>
      </primitive>
      <primitive object={hearts.mesh} />
    </>
  );
}
