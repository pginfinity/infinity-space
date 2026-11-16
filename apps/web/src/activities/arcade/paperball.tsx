import { useEffect, useMemo, useRef } from "react";
import { create } from "zustand";
import { AnimatePresence, motion } from "motion/react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { PAPER, PAPER_ID, PAPER_KIND, dirOfYaw, paperArc, paperFlight, paperLanding, paperOutcome, yawOf, type Lens, type MapObject, type PaperResult, type PaperState, type PaperThrow, type Vec2 } from "@infinity/world";
import { useApp } from "../../state/store.ts";
import { world } from "../../world/world.ts";
import { self } from "../../world/registry.ts";
import { sfx } from "../../audio/sfx.ts";
import { toast } from "../../ui/toasts.ts";
import { toon } from "../../scene/materials.ts";
import { sendAct, useAct, type ActivityClient } from "../registry.ts";
import { T as TT } from "./strings.ts";

/**
 * Bolinha de papel: E na lixeira põe a bolinha na mão. Mire com o mouse, segure para encher a força
 * (ela vai e volta) e solte. A bolinha voa em arco e todo mundo por perto vê. Sequência de acertos
 * e recorde do dia ficam com o servidor.
 */

const T = TT.paper;

interface PaperUi {
  aiming: boolean;
  streak: number;
  pop: { text: string; good: boolean; key: number } | null;
}
const usePaper = create<PaperUi>(() => ({ aiming: false, streak: 0, pop: null }));

/** Mira e força atuais (lidas pela cena a cada quadro, fora do React). */
const aim = { dir: null as Vec2 | null, charging: false, chargeAt: 0 };

/** Força agora (0 a 1): enche em 1,1 s e volta; segurar demais perde força. Calculada na hora, sem depender do quadro. */
function powerNow(): number {
  if (!aim.charging) return 0;
  const k = ((performance.now() - aim.chargeAt) / 1100) % 2;
  return k < 1 ? k : 2 - k;
}
/** Câmera e canvas da lente ativa (para converter o mouse em ponto no chão). */
const probe = { camera: null as THREE.Camera | null, el: null as HTMLElement | null };

function bins(): MapObject[] {
  return world().map.objects.filter((o) => o.type === "trash-bin");
}

function nearestBin(p: Vec2): MapObject | null {
  let best: MapObject | null = null;
  let bestD = Infinity;
  for (const b of bins()) {
    const d = Math.hypot(b.pos.x - p.x, b.pos.z - p.z);
    if (d < bestD) {
      best = b;
      bestD = d;
    }
  }
  return best && bestD <= PAPER.RANGE ? best : null;
}

function startAiming(): void {
  if (usePaper.getState().aiming) return;
  aim.dir = null;
  aim.charging = false;
  usePaper.setState({ aiming: true });
  sendAct(PAPER_ID, "hold", { on: true });
}

function stopAiming(): void {
  if (!usePaper.getState().aiming) return;
  aim.charging = false;
  usePaper.setState({ aiming: false });
  sendAct(PAPER_ID, "hold", { on: false });
}

// ---------------------------------------------------------------- voos

interface Flight {
  mine: boolean;
  from: Vec2;
  to: Vec2;
  bin: Vec2 | null;
  result: PaperResult;
  start: number;
  dur: number;
  /** O resultado já foi mostrado (só nos meus). */
  shown: boolean;
  streak: number;
  record: boolean;
}
const flights: Flight[] = [];

function launch(f: Omit<Flight, "start" | "dur" | "shown">): Flight {
  const fl: Flight = { ...f, start: performance.now(), dur: paperFlight(f.from, f.to) * 1000, shown: false };
  flights.push(fl);
  if (flights.length > 12) flights.shift();
  return fl;
}

function throwNow(): void {
  const st = usePaper.getState();
  if (!st.aiming) return;
  const power = powerNow();
  aim.charging = false;
  const dir = aim.dir ?? dirOfYaw(self.yaw);
  const from = { x: self.x, z: self.z };
  const bin = nearestBin(from);
  if (!bin) return stopAiming();
  sendAct(PAPER_ID, "throw", { dir, power });
  self.yaw = yawOf(dir);
  const to = paperLanding(from, dir, power);
  launch({ mine: true, from, to, bin: bin.pos, result: paperOutcome(from, to, bin.pos), streak: st.streak, record: false });
  sfx("arcade-paper-throw", { volume: 0.5 });
}

export const paperball: ActivityClient = {
  name: "arcade/bolinha",
  kinds: [PAPER_KIND],
  objects: ["trash-bin"],
  label: () => T.use,
  use: () => startAiming(),
  onEvent: (e) => {
    if (e.ev !== "throw") return;
    const t = e.data as PaperThrow;
    const me = useApp.getState().selfId;
    const bin = world().map.objects.find((o) => o.id === t.bin)?.pos ?? null;
    if (t.id === me) {
      // o servidor manda a palavra final: o voo previsto ajusta o destino no ar
      const mine = [...flights].reverse().find((f) => f.mine && !f.shown);
      if (mine) {
        mine.to = t.to;
        mine.result = t.result;
        mine.bin = bin;
        mine.streak = t.streak;
        mine.record = t.record;
      }
      usePaper.setState({ streak: t.streak });
      return;
    }
    launch({ mine: false, from: t.from, to: t.to, bin, result: t.result, streak: t.streak, record: t.record });
    if (t.record) toast(T.recordOf(t.name, t.streak));
  },
  Overlay: PaperOverlay,
  Scene: PaperScene,
};

// ---------------------------------------------------------------- interface

function PaperOverlay() {
  const aiming = usePaper((s) => s.aiming);
  const pop = usePaper((s) => s.pop);
  useEffect(() => {
    if (!pop) return;
    const t = window.setTimeout(() => usePaper.setState((s) => (s.pop?.key === pop.key ? { pop: null } : s)), 1400);
    return () => window.clearTimeout(t);
  }, [pop]);
  return (
    <>
      {aiming && <AimLayer />}
      <AnimatePresence>
        {pop && (
          <motion.div
            key={pop.key}
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8 }}
            className={`pointer-events-none absolute left-1/2 top-[30%] z-20 -translate-x-1/2 rounded-full px-5 py-2 text-lg font-bold shadow-xl ring-1 ${pop.good ? "bg-space/95 text-offwhite ring-signal/50" : "bg-space/90 text-slate ring-offwhite/10"}`}
            role="status"
          >
            {pop.text}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/** Camada de mira: captura o mouse por cima do mundo enquanto a bolinha está na mão. */
function AimLayer() {
  const st = useAct<PaperState>(PAPER_ID);
  const streak = usePaper((s) => s.streak);
  const bar = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = layer.current;
    if (!el) return;
    const ray = new THREE.Raycaster();
    const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.5);
    const hit = new THREE.Vector3();
    const ndc = new THREE.Vector2();
    let raf = 0;
    let turn = 0;
    const toFloor = (cx: number, cy: number) => {
      const cam = probe.camera;
      const canvas = probe.el;
      if (!cam || !canvas) return;
      const r = canvas.getBoundingClientRect();
      ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, cam);
      if (!ray.ray.intersectPlane(floor, hit)) return;
      const dx = hit.x - self.x;
      const dz = hit.z - self.z;
      if (Math.hypot(dx, dz) > 0.2) aim.dir = { x: dx, z: dz };
    };
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      el.setPointerCapture(e.pointerId);
      toFloor(e.clientX, e.clientY);
      aim.charging = true;
      aim.chargeAt = performance.now();
    };
    const move = (e: PointerEvent) => toFloor(e.clientX, e.clientY);
    const up = (e: PointerEvent) => {
      if (e.button !== 0 || !aim.charging) return;
      throwNow();
    };
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.code === "Escape") {
        e.stopImmediatePropagation();
        stopAiming();
      } else if (e.code === "Space") {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!e.repeat && !aim.charging) {
          aim.charging = true;
          aim.chargeAt = performance.now();
        }
      } else if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
        // setas giram a mira (WASD continua andando)
        e.preventDefault();
        e.stopImmediatePropagation();
        turn = e.code === "ArrowLeft" ? -1 : 1;
      }
    };
    const keyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" && aim.charging) throwNow();
      if (e.code === "ArrowLeft" || e.code === "ArrowRight") turn = 0;
    };
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (turn) {
        const yaw = aim.dir ? yawOf(aim.dir) : self.yaw;
        aim.dir = dirOfYaw(yaw + turn * 1.2 * dt);
      }
      if (bar.current) bar.current.style.transform = `scaleX(${powerNow()})`;
      // longe de qualquer lixeira: guarda a bolinha
      if (!nearestBin(self)) stopAiming();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    window.addEventListener("keydown", key, { capture: true });
    window.addEventListener("keyup", keyUp);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", key, { capture: true });
      window.removeEventListener("keyup", keyUp);
    };
  }, []);

  const rec = st?.record;
  return (
    <>
      <div ref={layer} className="pointer-events-auto absolute inset-0 cursor-crosshair" aria-hidden data-paper-aim />
      <div className="glass pointer-events-auto absolute bottom-[calc(max(12px,env(safe-area-inset-bottom))+72px)] left-1/2 w-[min(92vw,420px)] -translate-x-1/2 rounded-2xl p-3.5" role="group" aria-label={T.title}>
        <div className="flex items-center gap-3">
          <p className="font-display text-sm font-bold uppercase tracking-[0.1em]">{T.title}</p>
          <span className="ml-auto text-xs tabular-nums text-offwhite/85">{T.streak(streak)}</span>
        </div>
        <p className="mt-0.5 text-xs text-slate">{rec ? T.record(rec.name, rec.streak) : T.noRecord}</p>
        <div className="mt-2.5 flex items-center gap-2">
          <span className="label-caps">{T.power}</span>
          <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-offwhite/10" role="meter" aria-label={T.power}>
            <div ref={bar} className="absolute inset-0 origin-left rounded-full bg-gradient-to-r from-signal to-sky" style={{ transform: "scaleX(0)" }} />
          </div>
        </div>
        <p className="mt-2 text-[12px] leading-snug text-offwhite/80">{T.hint}</p>
        <p className="text-[11px] text-slate">
          {T.keys} · {T.far}
        </p>
        <div className="mt-2 flex justify-end">
          <button type="button" onClick={stopAiming} className="rounded-lg px-3 py-1.5 text-xs text-slate ring-1 ring-offwhite/12 hover:bg-offwhite/8 hover:text-offwhite">
            {T.exit}
          </button>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- cena

const N = 12;

function PaperScene({ lens }: { lens: Lens }) {
  const { camera, gl } = useThree();
  useEffect(() => {
    probe.camera = camera;
    probe.el = gl.domElement;
  }, [camera, gl]);

  const built = useMemo(() => {
    const root = new THREE.Group();
    root.name = "arcade:bolinha";
    const geo = new THREE.IcosahedronGeometry(0.05, 0);
    const balls = Array.from({ length: N }, () => {
      const m = new THREE.Mesh(geo, toon("#F2F0EF"));
      m.visible = false;
      root.add(m);
      return m;
    });
    // mira: seta no chão e anel na lixeira que conta
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0x00b7ff, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false });
    const shaft = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 1.1), arrowMat);
    shaft.rotation.x = -Math.PI / 2;
    shaft.position.z = -0.75;
    const headShape = new THREE.Shape([new THREE.Vector2(-0.12, 0), new THREE.Vector2(0.12, 0), new THREE.Vector2(0, 0.2)]);
    const head = new THREE.Mesh(new THREE.ShapeGeometry(headShape), arrowMat);
    head.rotation.x = -Math.PI / 2;
    head.position.z = -1.3;
    const arrow = new THREE.Group();
    arrow.add(shaft, head);
    arrow.visible = false;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.36, 32), arrowMat);
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    root.add(arrow, ring);
    return { root, balls, geo, arrow, ring, arrowMat, owned: [geo, shaft.geometry, head.geometry, ring.geometry, arrowMat] };
  }, []);
  useEffect(() => () => built.owned.forEach((x) => x.dispose()), [built]);

  const tmp = useMemo(() => ({ x: 0, y: 0, z: 0 }), []);
  useFrame((_, dt) => {
    const now = performance.now();
    const aiming = usePaper.getState().aiming;
    // mira
    built.arrow.visible = aiming;
    built.ring.visible = aiming;
    if (aiming) {
      const dir = aim.dir ?? dirOfYaw(self.yaw);
      built.arrow.position.set(self.x, 0.02, self.z);
      // a seta foi montada apontando para -z: gira pelo yaw da mira
      built.arrow.rotation.y = -yawOf(dir);
      built.arrow.scale.setScalar(lens === "2d" ? 1.2 : 1);
      const bin = nearestBin(self);
      if (bin) {
        built.ring.position.set(bin.pos.x, 0.015, bin.pos.z);
        const far = Math.hypot(bin.pos.x - self.x, bin.pos.z - self.z) >= PAPER.MIN_DIST;
        built.arrowMat.opacity = 0.55 + 0.3 * Math.sin(now / 180);
        built.ring.scale.setScalar(far ? 1 : 0.8);
      }
    }
    // voos
    let i = 0;
    for (let k = flights.length - 1; k >= 0; k--) {
      const f = flights[k]!;
      const t = (now - f.start) / f.dur;
      const intoBin = f.result === "hit" || f.result === "close";
      const ball = built.balls[i];
      const restMs = f.result === "miss" || f.result === "rim" ? 5000 : 200;
      if (t > 1 + restMs / f.dur || !ball) {
        flights.splice(k, 1);
        continue;
      }
      i++;
      ball.visible = true;
      ball.scale.setScalar(lens === "2d" ? 1.6 : 1);
      if (t <= 1) {
        paperArc(f.from, f.to, t, intoBin || f.result === "rim" ? PAPER.BIN_TOP : 0.05, tmp);
        ball.position.set(tmp.x, tmp.y, tmp.z);
        ball.rotation.x += dt * 9;
        ball.rotation.z += dt * 6;
        continue;
      }
      const after = (t - 1) * f.dur;
      if (!f.shown) {
        f.shown = true;
        landed(f);
      }
      if (intoBin) {
        // cai dentro da lixeira e some
        const b = f.bin ?? f.to;
        ball.position.set(b.x, Math.max(0.2, PAPER.BIN_TOP - after * 0.003), b.z);
        if (after > 150) ball.visible = false;
      } else if (f.result === "rim") {
        // bate na borda e cai para fora
        const b = f.bin ?? f.to;
        const dx = f.to.x - b.x || 0.01;
        const dz = f.to.z - b.z;
        const len = Math.hypot(dx, dz) || 1;
        const u = Math.min(1, after / 450);
        ball.position.set(b.x + (dx / len) * (0.22 + u * 0.45), Math.max(0.05, PAPER.BIN_TOP + 0.25 * u * (1 - u) * 4 - u * 0.45), b.z + (dz / len) * (0.22 + u * 0.45));
      } else {
        // quica uma vez no chão e fica lá um pouco
        const u = Math.min(1, after / 260);
        ball.position.set(f.to.x, 0.05 + 0.12 * u * (1 - u) * 4, f.to.z);
      }
      if (after > restMs - 600) ball.scale.multiplyScalar(Math.max(0, (restMs - after) / 600));
    }
    for (; i < N; i++) built.balls[i]!.visible = false;
  });

  return <primitive object={built.root} />;
}

/** A bolinha chegou: som no lugar e, nos meus arremessos, o resultado na tela. */
function landed(f: Flight): void {
  const at = f.bin ?? f.to;
  if (f.result === "hit" || f.result === "close") sfx("arcade-paper-in", { at, range: 14, volume: 0.7 });
  else if (f.result === "rim") sfx("arcade-paper-rim", { at, range: 14, volume: 0.7 });
  else sfx("arcade-paper-miss", { at: f.to, range: 10, volume: 0.5 });
  if (!f.mine) return;
  const good = f.result === "hit";
  const text = f.record ? T.newRecord(f.streak) : good && f.streak > 1 ? T.streakHit(f.streak) : T.results[f.result];
  usePaper.setState({ pop: { text, good, key: performance.now() } });
  if (f.record) sfx("arcade-duel-win", { volume: 0.5 });
}

// Gancho de inspeção para os testes de ponta a ponta (só em desenvolvimento).
if (import.meta.env.DEV) {
  const w = window as unknown as { __arcade?: Record<string, unknown> };
  w.__arcade = {
    ...(w.__arcade ?? {}),
    /** Ponto do mundo (na altura da boca da lixeira) em coordenadas da tela, para o mouse mirar. */
    paperScreen(x: number, z: number) {
      const cam = probe.camera;
      const el = probe.el;
      if (!cam || !el) return null;
      const v = new THREE.Vector3(x, PAPER.BIN_TOP, z).project(cam);
      const r = el.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    },
    paperAiming: () => usePaper.getState().aiming,
  };
}
