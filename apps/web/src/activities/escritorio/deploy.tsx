import { useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { AnimatePresence, motion } from "motion/react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  DEPLOY_FLIGHT_MS,
  DEPLOY_ID,
  DEPLOY_KIND,
  DEPLOY_PAD,
  DEPLOY_PAD_Y,
  DEPLOY_WATCH_RANGE,
  deployCountdownDigit,
  deployProgress,
  type DeployBusy,
  type DeployCountdown,
  type DeployLaunch,
  type DeployState,
  type Lens,
  type Vec2,
} from "@infinity/world";
import { actState, sendAct, useAct, type ActivityClient } from "../registry.ts";
import { registerSynth, sfx } from "../../audio/sfx.ts";
import { toast } from "../../ui/toasts.ts";
import { world } from "../../world/world.ts";
import { buildDock, buildRocket } from "./rocket.ts";
import { deferScene, selfNear } from "./shared.tsx";
import { noise, tone } from "./synth.ts";
import { T } from "./strings.ts";

/**
 * Botão de deploy do Dev Lab. Apertar dispara uma contagem 3-2-1 (para quem está perto) e o
 * foguete decola do berço do lado de fora da janela norte do Dev Lab, cruzando o céu de cada
 * pessoa, onde ela estiver, com rastro de fumaça. Conta os deploys do mês (do time).
 */

interface DeployUi {
  countdown: { name: string; start: number; ms: number; key: number } | null;
}
const useDeployUi = create<DeployUi>(() => ({ countdown: null }));

/** Acontecimentos lidos pela cena (fora do React). */
const timeline = { countdownAt: -1, countdownMs: 0, launchAt: -1 };

let buttonPos: Vec2 | null = null;
function button(): Vec2 {
  buttonPos ??= world().map.objects.find((o) => o.type === "big-button")?.pos ?? { x: 0, z: 0 };
  return buttonPos;
}

export const deploy: ActivityClient = {
  name: "escritorio/deploy",
  kinds: [DEPLOY_KIND],
  objects: ["big-button"],
  label: () => {
    const s = actState<DeployState>(DEPLOY_ID);
    if (s && s.phase !== "idle") return T.deploy.flying;
    return T.deploy.actionCount(s?.count ?? 0);
  },
  use: () => sendAct(DEPLOY_ID, "press"),
  onEvent: (e) => {
    const now = performance.now();
    if (e.ev === "countdown") {
      const d = e.data as DeployCountdown;
      timeline.countdownAt = now;
      timeline.countdownMs = d.ms;
      if (selfNear(button(), DEPLOY_WATCH_RANGE)) {
        useDeployUi.setState({ countdown: { name: d.name, start: now, ms: d.ms, key: now } });
        for (let i = 0; i < Math.round(d.ms / 1000); i++) window.setTimeout(() => sfx("deploy-beep", { at: button(), range: 16, volume: 0.55 }), i * 1000);
      }
    } else if (e.ev === "launch") {
      const d = e.data as DeployLaunch;
      timeline.launchAt = now;
      sfx("deploy-launch", { volume: 0.5 });
      toast(T.deploy.launched(d.count), 4200);
    } else if (e.ev === "busy") {
      toast(T.deploy.busy((e.data as DeployBusy).ms));
    }
  },
  Overlay: CountdownOverlay,
  Scene: deferScene(DeployScene, 1500),
};

// ---- contagem ---------------------------------------------------------------------------

function CountdownOverlay() {
  const cd = useDeployUi((s) => s.countdown);
  const [digit, setDigit] = useState(3);
  useEffect(() => {
    if (!cd) return;
    const tick = () => {
      const el = performance.now() - cd.start;
      setDigit(deployCountdownDigit(el, cd.ms));
      if (el > cd.ms + 1100) useDeployUi.setState((s) => (s.countdown?.key === cd.key ? { countdown: null } : s));
    };
    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [cd]);
  return (
    <AnimatePresence>
      {cd && (
        <motion.div
          key={cd.key}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="glass pointer-events-none absolute left-1/2 top-[16%] flex min-w-[220px] -translate-x-1/2 flex-col items-center rounded-3xl px-6 pb-4 pt-3"
          role="status"
          aria-live="assertive"
        >
          <p className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-slate">{T.deploy.title}</p>
          <AnimatePresence mode="popLayout">
            <motion.p
              key={digit}
              initial={{ scale: 1.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.7, opacity: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 22 }}
              className={`my-1 font-display font-black leading-none tabular-nums ${digit > 0 ? "text-[80px] text-offwhite" : "py-4 text-[44px] text-orange"}`}
            >
              {digit > 0 ? digit : T.deploy.liftoff}
            </motion.p>
          </AnimatePresence>
          <p className="text-xs text-slate">{T.deploy.by(cd.name)}</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---- foguete e berço no mundo ------------------------------------------------------------

const PUFFS = 420;
const SMOKE_LIFE = 1.4;
const FLAME = new THREE.Color("#FFB347");
const SMOKE = new THREE.Color("#E9EDF2");
const UP = new THREE.Vector3(0, 1, 0);
const jitter = () => (Math.random() - 0.5) * 0.6;

interface Flight {
  curve: THREE.CatmullRomCurve3;
  /** Atraso (ms) para quem vê de longe: o foguete chega ao seu céu depois de subir. */
  delay: number;
  /** Quem vê o berço assiste à decolagem. */
  near: boolean;
}

function DeployScene({ lens }: { lens: Lens }) {
  const { camera } = useThree();
  const state = useAct<DeployState>(DEPLOY_ID);
  const rocket = useMemo(buildRocket, []);
  const dock = useMemo(() => buildDock(DEPLOY_PAD_Y, Math.abs(-19 - DEPLOY_PAD.z)), []);
  const smoke = useRef<THREE.InstancedMesh>(null);
  const parts = useMemo(() => Array.from({ length: PUFFS }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), born: -1, size: 1 })), []);
  const cur = useRef(0);
  const seen = useRef({ launch: -1 });
  const flight = useRef<Flight | null>(null);
  const tmp = useMemo(
    () => ({ pos: new THREE.Vector3(), tan: new THREE.Vector3(), prev: new THREE.Vector3(), q: new THREE.Quaternion(), spin: new THREE.Quaternion(), o: new THREE.Object3D(), c: new THREE.Color() }),
    [],
  );
  const padTop = useMemo(() => new THREE.Vector3(DEPLOY_PAD.x, DEPLOY_PAD_Y, DEPLOY_PAD.z), []);
  const back = useRef({ at: -1 });
  const lastPhase = useRef<DeployState["phase"] | undefined>(undefined);

  useEffect(
    () => () => {
      rocket.dispose();
      dock.dispose();
    },
    [rocket, dock],
  );

  // Fim do voo: um foguete novo sobe para o berço.
  useEffect(() => {
    const ph = state?.phase;
    if (lastPhase.current === "flight" && ph === "idle") back.current.at = performance.now();
    lastPhase.current = ph;
  }, [state?.phase]);

  useEffect(() => {
    for (let i = 0; i < PUFFS; i++) smoke.current?.setColorAt(i, SMOKE);
    if (smoke.current) smoke.current.count = 0;
  }, []);

  const emit = (at: THREE.Vector3, vx: number, vy: number, vz: number, size: number, born: number) => {
    const p = parts[cur.current]!;
    cur.current = (cur.current + 1) % PUFFS;
    p.p.copy(at);
    p.v.set(vx, vy, vz);
    p.born = born;
    p.size = size;
  };

  useFrame((_, dt) => {
    const now = performance.now();
    const g = rocket.group;
    const flame = rocket.flame;

    // Novo lançamento: monta a rota a partir da câmera de quem vê.
    if (timeline.launchAt !== seen.current.launch) {
      seen.current.launch = timeline.launchAt;
      flight.current = planFlight(camera, padTop, lens);
    }

    const since = timeline.launchAt < 0 ? Infinity : now - timeline.launchAt;
    const flying = since < DEPLOY_FLIGHT_MS + 400 && flight.current !== null;
    const counting = timeline.countdownAt >= 0 && now - timeline.countdownAt < timeline.countdownMs + 200 && !flying;

    // Braços da torre abrem perto do fim da contagem e voltam com o foguete novo.
    const open = counting ? Math.min(1, Math.max(0, (now - timeline.countdownAt - (timeline.countdownMs - 700)) / 400)) : flying ? 1 : 0;
    dock.arms.forEach((a, i) => (a.rotation.y += ((open * (i ? 1.1 : 0.9)) - a.rotation.y) * Math.min(1, dt * 8)));
    // Luzes do berço: piscam na contagem.
    const blink = counting ? (Math.floor((now - timeline.countdownAt) / 250) % 2 === 0 ? 1 : 0.25) : 0.8 + 0.2 * Math.sin(now * 0.002);
    dock.lights.color.setRGB(blink * 0.0, blink * 0.72, blink * 1.0);

    if (flying) {
      const f = flight.current!;
      const u = flightProgress(f, since);
      tmp.prev.copy(g.position);
      f.curve.getPointAt(u, tmp.pos);
      f.curve.getTangentAt(Math.min(0.999, Math.max(0.001, u)), tmp.tan).normalize();
      g.visible = since >= f.delay || f.delay === 0;
      g.position.copy(tmp.pos);
      tmp.q.setFromUnitVectors(UP, tmp.tan);
      tmp.spin.setFromAxisAngle(UP, since * 0.0016);
      g.quaternion.copy(tmp.q).multiply(tmp.spin);
      g.scale.setScalar(1);
      flame.visible = true;
      flame.scale.set(1, 0.9 + Math.random() * 0.5 + Math.min(1, since / 800), 1);
      // Fumaça saindo do motor, mais densa no começo.
      if (g.visible) {
        const moved = tmp.prev.distanceTo(tmp.pos);
        const n = Math.min(30, Math.ceil(moved / 0.16));
        for (let i = 0; i < n; i++) {
          tmp.o.position.copy(tmp.prev).lerp(tmp.pos, (i + 1) / n).addScaledVector(tmp.tan, -0.35);
          emit(tmp.o.position, jitter() - tmp.tan.x * 1.2, jitter() - tmp.tan.y * 1.2, jitter() - tmp.tan.z * 1.2, 0.7 + Math.random() * 0.5, now - (i / n) * dt * 1000);
        }
      }
    } else {
      // No berço. Depois de um voo, o foguete novo sobe de baixo.
      const returned = timeline.launchAt < 0 || back.current.at > timeline.launchAt;
      const r = returned && back.current.at > 0 ? Math.min(1, (now - back.current.at) / 1600) : 1;
      const ease = 1 - Math.pow(1 - r, 3);
      g.visible = returned;
      g.quaternion.identity();
      g.position.set(DEPLOY_PAD.x, DEPLOY_PAD_Y - 2.4 * (1 - ease), DEPLOY_PAD.z);
      if (counting) {
        const k = (now - timeline.countdownAt) / timeline.countdownMs;
        g.position.x += (Math.random() - 0.5) * 0.018 * k;
        g.position.z += (Math.random() - 0.5) * 0.018 * k;
        flame.visible = k > 0.55;
        flame.scale.set(0.8, 0.15 + k * 0.35 + Math.random() * 0.1, 0.8);
        if (Math.random() < 0.6) {
          tmp.o.position.set(DEPLOY_PAD.x + (Math.random() - 0.5) * 0.4, DEPLOY_PAD_Y + 0.05, DEPLOY_PAD.z + (Math.random() - 0.5) * 0.4);
          const a = Math.random() * Math.PI * 2;
          emit(tmp.o.position, Math.cos(a) * 1.4, 0.25, Math.sin(a) * 1.4, 0.7 + k, now);
        }
      } else {
        flame.visible = false;
      }
    }

    // Fumaça: cresce, esfria (laranja → branco) e some.
    const m = smoke.current;
    if (!m) return;
    let n = 0;
    for (const p of parts) {
      if (p.born < 0) continue;
      const age = (now - p.born) / 1000 / SMOKE_LIFE;
      if (age >= 1) {
        p.born = -1;
        continue;
      }
      p.p.addScaledVector(p.v, dt);
      p.v.multiplyScalar(1 - 1.8 * Math.min(dt, 0.1));
      tmp.o.position.copy(p.p);
      const s = p.size * (0.25 + age * 1.1) * (age > 0.7 ? (1 - age) / 0.3 : 1);
      tmp.o.scale.setScalar(Math.max(0.001, s) * 0.22);
      tmp.o.rotation.set(0, 0, 0);
      tmp.o.updateMatrix();
      m.setMatrixAt(n, tmp.o.matrix);
      tmp.c.copy(FLAME).lerp(SMOKE, Math.min(1, age * 4));
      m.setColorAt(n, tmp.c);
      n++;
    }
    // Sem fumaça (quase sempre): nada sobe para a placa de vídeo.
    if (n === 0 && m.count === 0) return;
    // Escondida quando vazia: o shader só compila no primeiro uso (abre mais leve).
    m.visible = n > 0;
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });

  return (
    <>
      <primitive object={dock.group} position={[DEPLOY_PAD.x, 0, DEPLOY_PAD.z]} />
      <primitive object={rocket.group} />
      <instancedMesh ref={smoke} args={[undefined, undefined, PUFFS]} frustumCulled={false} visible={false}>
        <icosahedronGeometry args={[1, 1]} />
        <meshToonMaterial color="#FFFFFF" />
      </instancedMesh>
    </>
  );
}

const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _plane = new THREE.Plane(UP, 0);

/** Ponto do mundo na altura h que aparece na posição (x, y) da tela (coordenadas -1..1). */
function onScreen(camera: THREE.Camera, x: number, y: number, h: number): THREE.Vector3 {
  _ndc.set(x, y);
  _ray.setFromCamera(_ndc, camera);
  _plane.constant = -h;
  const p = new THREE.Vector3();
  const hit = _ray.ray.intersectPlane(_plane, p);
  // Na câmera em perspectiva, um raio quase horizontal acertaria o plano longe demais: limita.
  const far = (camera as THREE.PerspectiveCamera).isPerspectiveCamera && !!hit && hit.distanceTo(_ray.ray.origin) > 36;
  if (!hit || far) p.copy(_ray.ray.origin).addScaledVector(_ray.ray.direction, 22);
  return p;
}

/**
 * Rota do foguete para quem está vendo: cruza a parte de cima da tela de lado a lado, entrando
 * pelo lado em que o berço fica, e some subindo para o espaço. Quem vê o berço (Dev Lab) assiste
 * à decolagem antes da travessia. Cada pessoa vê o foguete no próprio céu, no mesmo instante.
 */
function planFlight(camera: THREE.Camera, pad: THREE.Vector3, lens: Lens): Flight {
  camera.updateMatrixWorld();
  const H = lens === "3d" ? 4.4 : 5.5;
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  right.y = 0;
  right.normalize();
  const mid = onScreen(camera, 0, 0.6, H);
  const side = Math.sign(new THREE.Vector3().subVectors(pad, mid).dot(right)) || 1;
  // Travessia: da borda do lado do berço até a outra, subindo um pouco.
  const cross = (
    [
      [1.25, 0.46],
      [0.62, 0.54],
      [0, 0.6],
      [-0.62, 0.66],
      [-1.25, 0.74],
    ] as const
  ).map(([x, y]) => onScreen(camera, side * x, y, H));
  const last = cross[cross.length - 1]!;
  const exit = last.clone().addScaledVector(right, -side * 10).add(new THREE.Vector3(0, 30, 0));
  // O berço aparece na tela de quem vê?
  const ndc = pad.clone().project(camera);
  const padVisible = Math.abs(ndc.x) < 1.1 && Math.abs(ndc.y) < 1.1 && ndc.z < 1;
  if (padVisible) {
    // Decola do berço, sobe e entra na travessia já pelo meio da tela.
    const top = pad.clone().add(new THREE.Vector3(0, 3.2, 0));
    const pts = [pad.clone(), pad.clone().add(new THREE.Vector3(0, 1, 0)), top, ...cross.slice(1), exit];
    return { curve: new THREE.CatmullRomCurve3(pts, false, "centripetal"), delay: 0, near: true };
  }
  return { curve: new THREE.CatmullRomCurve3([...cross, exit], false, "centripetal"), delay: 700, near: false };
}

/** Progresso na rota: decolagem lenta para quem vê o berço; travessia quase constante para os outros. */
function flightProgress(f: Flight, since: number): number {
  const t = Math.min(1, Math.max(0, (since - f.delay) / (DEPLOY_FLIGHT_MS - f.delay)));
  return f.near ? deployProgress(since) : 0.6 * t + 0.4 * t * t;
}

// ---- sons de reserva ----------------------------------------------------------------------

/** Bipe da contagem. */
registerSynth("deploy-beep", (c, out) => tone(c, out, { freq: 880, dur: 0.16, type: "square", gain: 0.12 }));
/** Decolagem: ronco grave que sobe e um chiado longo. */
registerSynth("deploy-launch", (c, out) => {
  noise(c, out, { dur: 4.2, from: 180, to: 900, q: 0.7, gain: 0.5, attack: 0.25, type: "lowpass" });
  noise(c, out, { dur: 3.2, from: 1200, to: 4200, q: 0.8, gain: 0.12, attack: 0.6, delay: 0.3 });
  tone(c, out, { freq: 55, to: 90, dur: 3.5, type: "sawtooth", gain: 0.08, attack: 0.3 });
});
