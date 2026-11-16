import { useEffect, useMemo, useRef } from "react";
import { create } from "zustand";
import { AnimatePresence, motion } from "motion/react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import {
  COPA_ID,
  COPA_ITEMS,
  COPA_KIND,
  COPA_STATIONS,
  VIVO_POPCORN_SPOT,
  copaCountsFor,
  copaProgress,
  copaStationPoint,
  isCopaStation,
  vivoDay,
  type CopaItem,
  type CopaServed,
  type CopaState,
  type CopaStationType,
  type Lens,
  type MapObject,
  type Vec2,
} from "@infinity/world";
import { actState, sendAct, useAct, type ActivityClient, type DynamicTarget } from "../registry.ts";
import { sfx } from "../../audio/sfx.ts";
import { toast } from "../../ui/toasts.ts";
import { useApp } from "../../state/store.ts";
import { self } from "../../world/registry.ts";
import { world } from "../../world/world.ts";
import { objectMatrix } from "../../scene/furniture/index.ts";
import { CHALK_FACE } from "../../scene/furniture/vivo.ts";
import { Builder, C, clear, lit, mix } from "../../scene/furniture/core.ts";
import { serverNow } from "./clock.ts";
import { FaceBoard, chalkText } from "./board.ts";
import { Particles, ballGeometry, flatMaterial } from "./particles.ts";
import { ICON } from "./held.tsx";
import { T } from "./strings.ts";

/**
 * Copa: café e chá na máquina, água no bebedouro, suco na geladeira e pipoca na bancada.
 * Escolher → preparo curto (vapor, bolhas, pipoca estourando, som) → o servidor põe o item na mão.
 * O quadro de giz embaixo do neon mostra o que o time pegou hoje.
 */

interface CopaUi {
  menu: { station: string; type: CopaStationType } | null;
}
const useCopaUi = create<CopaUi>(() => ({ menu: null }));

const SOUND: Record<CopaItem, string> = { coffee: "vivo-espresso", tea: "vivo-kettle", water: "vivo-water", juice: "vivo-fridge", popcorn: "vivo-popcorn" };

function stationLabel(type: CopaStationType): string {
  if (type === "coffee-machine") return T.copa.machine;
  if (type === "water-cooler") return T.copa.water;
  if (type === "fridge") return T.copa.juice;
  return T.copa.popcorn;
}

function order(o: Pick<MapObject, "id" | "type">): void {
  if (!isCopaStation(o.type)) return;
  const items = COPA_STATIONS[o.type].items;
  if (items.length > 1) {
    useCopaUi.setState({ menu: { station: o.id, type: o.type } });
    return;
  }
  sendAct(COPA_ID, "order", { station: o.id, item: items[0] });
}

/** Geladeira e bancada não têm ponto de interação no mapa: viram alvos do pacote. */
let extra: Array<{ o: MapObject; point: Vec2 }> | null = null;
function extraTargets(): Array<{ o: MapObject; point: Vec2 }> {
  extra ??= world()
    .map.objects.filter((o) => o.type === "fridge" || o.type === "kitchen-counter")
    .map((o) => ({ o, point: copaStationPoint(o) }));
  return extra;
}

export const copaClient: ActivityClient = {
  name: "vivo/copa",
  kinds: [COPA_KIND],
  objects: ["coffee-machine", "water-cooler"],
  label: (o) => (isCopaStation(o.type) ? stationLabel(o.type) : undefined),
  use: order,
  targets: () =>
    extraTargets().map<DynamicTarget>(({ o, point }) => ({
      key: `copa:${o.id}`,
      point,
      radius: 1.75,
      label: stationLabel(o.type as CopaStationType),
      run: () => order(o),
    })),
  onEvent: (e) => {
    const me = useApp.getState().selfId;
    if (e.ev === "start" || e.ev === "served") {
      const d = e.data as CopaServed;
      const o = world().map.objects.find((x) => x.id === d.station);
      if (!o) return;
      const at = copaStationPoint(o);
      if (e.ev === "start") sfx(SOUND[d.item], { at, volume: 0.6, range: 12 });
      else {
        sfx("vivo-ready", { at, volume: 0.45, range: 8 });
        servedAt.set(d.station, performance.now());
      }
      return;
    }
    if (e.ev === "refuse" && (!e.from || e.from === me)) {
      const d = e.data as { reason: string; name?: string };
      if (d.reason === "busy") toast(T.copa.busy(d.name ?? "Alguém"));
      else if (d.reason === "away") toast(T.copa.walkedAway);
      else if (d.reason === "far") toast(T.copa.tooFar);
    }
  },
  Overlay: CopaOverlay,
  Scene: CopaScene,
};

/** Quando cada estação acabou de servir (para um brilho rápido). */
const servedAt = new Map<string, number>();

// ---- interface ----------------------------------------------------------------------------

function CopaOverlay() {
  const menu = useCopaUi((s) => s.menu);
  return (
    <>
      <AnimatePresence>{menu && <CopaMenu key="menu" station={menu.station} type={menu.type} />}</AnimatePresence>
      <Preparing />
    </>
  );
}

function CopaMenu({ station, type }: { station: string; type: CopaStationType }) {
  const items = COPA_STATIONS[type].items;
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus(), []);
  const close = () => useCopaUi.setState({ menu: null });
  const pick = (item: CopaItem) => {
    sendAct(COPA_ID, "order", { station, item });
    close();
  };
  // Sair de perto fecha o menu.
  useEffect(() => {
    const o = world().map.objects.find((x) => x.id === station);
    if (!o) return;
    const at = copaStationPoint(o);
    const t = window.setInterval(() => {
      if (Math.hypot(self.x - at.x, self.z - at.z) > 3.2) close();
    }, 300);
    return () => window.clearInterval(t);
  }, [station]);
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className="pointer-events-auto absolute bottom-[calc(max(12px,env(safe-area-inset-bottom))+72px)] left-1/2 z-30 w-[min(92vw,340px)] -translate-x-1/2 rounded-2xl border border-offwhite/10 bg-space p-3 shadow-2xl"
      role="dialog"
      aria-label={stationLabel(type)}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
        const n = Number(e.key);
        if (n >= 1 && n <= items.length) pick(items[n - 1]!);
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          const btns = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-item]")];
          const i = btns.indexOf(document.activeElement as HTMLButtonElement);
          btns[(i + (e.key === "ArrowRight" ? 1 : -1) + btns.length) % btns.length]?.focus();
        }
        e.stopPropagation();
      }}
    >
      <div className="flex items-baseline justify-between px-1">
        <p className="font-display text-xs font-bold uppercase tracking-[0.12em]">{T.copa.choose}</p>
        <button type="button" onClick={close} className="rounded-lg px-2 py-1 text-xs text-slate hover:bg-offwhite/8 hover:text-offwhite">
          {T.cancel}
        </button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {items.map((it, i) => {
          const Icon = ICON[it];
          return (
            <button
              key={it}
              ref={i === 0 ? first : undefined}
              data-item={it}
              aria-label={T.item(it)}
              aria-keyshortcuts={String(i + 1)}
              type="button"
              onClick={() => pick(it)}
              className="group flex items-center gap-2.5 rounded-xl border border-offwhite/10 bg-card/60 px-3 py-2.5 text-left text-sm text-offwhite transition-colors hover:border-signal/60 hover:bg-card focus-visible:border-signal"
            >
              <span className="grid size-8 place-items-center rounded-lg bg-deep text-sky">
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="flex-1 font-medium">{T.item(it)}</span>
              <kbd className="font-display text-[10px] text-slate">{i + 1}</kbd>
            </button>
          );
        })}
      </div>
      <p className="mt-2 px-1 text-[11px] text-slate">{T.copa.chooseHint}</p>
    </motion.div>
  );
}

/** "Preparando um café…" com a barra até ficar pronto (só para quem pediu). */
function Preparing() {
  const state = useAct<CopaState>(COPA_ID);
  const me = useApp((s) => s.selfId);
  const mine = state && me ? Object.values(state.busy).find((b) => b.id === me) : undefined;
  const now = serverNow();
  const p0 = mine ? copaProgress(mine, now) : 0;
  const left = mine ? Math.max(0, mine.until - now) : 0;
  return (
    <AnimatePresence>
      {mine && (
        <motion.div
          key={`${mine.at}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          className="glass pointer-events-none absolute bottom-[calc(max(12px,env(safe-area-inset-bottom))+124px)] left-1/2 z-20 w-[min(80vw,260px)] -translate-x-1/2 rounded-2xl px-3.5 py-2.5"
          role="status"
          aria-live="polite"
        >
          <p className="text-sm text-offwhite">{T.copa.preparing(mine.item)}</p>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-offwhite/10">
            <div
              className="h-full origin-left rounded-full bg-signal"
              style={{ transform: `scaleX(${p0})`, animation: `vivo-fill ${left}ms linear forwards` }}
            />
          </div>
          <style>{`@keyframes vivo-fill { from { transform: scaleX(${p0}); } to { transform: scaleX(1); } }`}</style>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---- no mundo -----------------------------------------------------------------------------

const _v = new THREE.Vector3();

/** Pipoqueira de bancada (carrinho vermelho com vitrine), montada uma vez. */
let popParts: ReturnType<Builder["finish"]>["parts"] | null = null;
function popcornMachine(): THREE.Group {
  if (!popParts) {
    const b = new Builder();
    const red = mix(C.red, C.orange, 0.15);
    b.box(red, 0.3, 0.1, 0.24, 0, 0.05, 0, { r: 0.02 });
    b.box(C.gold, 0.31, 0.015, 0.25, 0, 0.1, 0, { r: 0.004 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(red, 0.02, 0.26, 0.02, sx * 0.14, 0.23, sz * 0.11, { r: 0.006 });
    b.box(clear(C.offwhite, 0.22), 0.27, 0.25, 0.21, 0, 0.23, 0, { r: 0.004 });
    b.box(red, 0.32, 0.05, 0.26, 0, 0.385, 0, { r: 0.02 });
    b.box(lit(C.gold), 0.2, 0.05, 0.006, 0, 0.385, 0.131, { r: 0 });
    b.cyl(C.gold, 0.012, 0.04, 0, 0.43, 0, { seg: 8 });
    b.sph(red, 0.022, 0, 0.455, 0, { seg: 10 });
    // panelinha pendurada e um montinho de pipoca no fundo
    b.cyl(T_STEEL, 0.05, 0.05, 0.02, 0.31, 0, { rt: 0.06, seg: 12 });
    b.rod(T_STEEL, 0.004, 0.02, 0.34, 0, 0.02, 0.37, 0, { seg: 4 });
    for (let i = 0; i < 14; i++) {
      const a = i * 2.39;
      const r = 0.02 + (i % 4) * 0.022;
      b.sph(i % 3 ? C.cream : "#FFF3C4", 0.014, Math.cos(a) * r, 0.118 + (i % 3) * 0.008, Math.sin(a) * r * 0.8, { seg: 6 });
    }
    popParts = b.finish().parts;
  }
  const g = new THREE.Group();
  g.name = "vivo:pipoqueira";
  for (const p of popParts) g.add(new THREE.Mesh(p.geometry, p.material));
  return g;
}
const T_STEEL = mix(C.metal, C.offwhite, 0.35);

interface StationFx {
  id: string;
  type: CopaStationType;
  m: THREE.Matrix4;
  /** Para onde a frente da estação aponta (no chão). */
  front: Vec2;
  /** Acúmulo para emitir partículas num ritmo fixo. */
  acc: number;
}

function CopaScene({ lens }: { lens: Lens }) {
  const camera = useThree((s) => s.camera);
  const fx = useMemo(() => {
    const puffs = new Particles(ballGeometry(), flatMaterial({ opacity: 0.55 }), 140);
    const balls = new Particles(ballGeometry(), flatMaterial(), 120);
    return { puffs, balls };
  }, []);
  const stations = useMemo<StationFx[]>(
    () =>
      world()
        .map.objects.filter((o) => isCopaStation(o.type))
        .map((o) => ({ id: o.id, type: o.type as CopaStationType, m: objectMatrix(o), front: { x: Math.sin(o.rot), z: -Math.cos(o.rot) }, acc: 0 })),
    [],
  );
  const pop = useMemo(() => {
    const counter = world().map.objects.find((o) => o.type === "kitchen-counter");
    if (!counter) return null;
    const g = popcornMachine();
    const m = objectMatrix(counter).multiply(new THREE.Matrix4().makeTranslation(VIVO_POPCORN_SPOT.x, 0.92, VIVO_POPCORN_SPOT.z));
    m.decompose(g.position, g.quaternion, g.scale);
    return g;
  }, []);
  const board = useMemo(() => {
    const o = world().map.objects.find((x) => x.type === "chalkboard");
    return o ? { o, fb: new FaceBoard(o, CHALK_FACE, 448) } : null;
  }, []);
  const label = useRef<HTMLDivElement>(null);
  const state = useAct<CopaState>(COPA_ID);

  useEffect(
    () => () => {
      fx.puffs.dispose();
      fx.balls.dispose();
      board?.fb.dispose();
    },
    [fx, board],
  );

  // Quadro do dia: redesenha quando os números mudam (e de novo quando a fonte chegar).
  const counts = state ? copaCountsFor(state, vivoDay(serverNow())) : null;
  const countsKey = counts ? COPA_ITEMS.map((i) => counts[i]).join(",") : "";
  useEffect(() => {
    if (!board || !counts) return;
    board.fb.draw(countsKey, (ctx, w, h) => drawChalk(ctx, w, h, counts));
    if (document.fonts) void document.fonts.load("600 32px Geist").then(() => {
      board.fb.invalidate();
      board.fb.draw(countsKey, (ctx, w, h) => drawChalk(ctx, w, h, counts));
    });
  }, [board, countsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, dt) => {
    const s = actState<CopaState>(COPA_ID);
    const now = serverNow();
    for (const st of stations) {
      const b = s?.busy[st.id];
      const served = servedAt.get(st.id);
      if (served && performance.now() - served < 400) emitServed(st, fx);
      if (!b) {
        st.acc = 0;
        continue;
      }
      const k = copaProgress(b, now);
      st.acc += dt;
      emit(st, b.item, k, fx);
    }
    fx.puffs.update(dt, camera);
    fx.balls.update(dt, camera);
    // Etiqueta nítida no 2D quando a pessoa está perto do quadro.
    if (label.current && board) {
      const near = Math.hypot(self.x - board.o.pos.x, self.z - board.o.pos.z) < 9;
      const show = lens === "2d" && near;
      if (label.current.dataset.show !== String(show)) {
        label.current.dataset.show = String(show);
        label.current.style.opacity = show ? "1" : "0";
      }
    }
  });

  return (
    <>
      <primitive object={fx.puffs.mesh} />
      <primitive object={fx.balls.mesh} />
      {pop && <primitive object={pop} />}
      {board && <primitive object={board.fb.mesh} />}
      {board && counts && (
        <Html position={[board.o.pos.x, 1.45, board.o.pos.z]} center zIndexRange={[6, 0]} style={{ pointerEvents: "none" }}>
          <div ref={label} className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-space/80 px-2.5 py-1 text-[11px] font-medium text-offwhite shadow-lg transition-opacity duration-300" style={{ opacity: 0 }}>
            <span className="text-slate">{T.copa.boardShort}</span>
            {boardLine(counts)}
          </div>
        </Html>
      )}
    </>
  );
}

/** Ponto local do modelo de uma estação levado para o mundo. */
function at(st: StationFx, x: number, y: number, z: number): THREE.Vector3 {
  return _v.set(x, y, z).applyMatrix4(st.m);
}

const STEAM = new THREE.Color("#F4F7FA");
const MIST = new THREE.Color("#CFEFFF");
const BUBBLE = new THREE.Color("#BDE8FF");
const KERNEL = new THREE.Color("#FFF1C2");
const GLINT = new THREE.Color("#FFE7A0");

function emit(st: StationFx, item: CopaItem, k: number, fx: { puffs: Particles; balls: Particles }): void {
  const rate = st.type === "kitchen-counter" ? 0.07 : st.type === "fridge" ? 0.05 : 0.09;
  while (st.acc > rate) {
    st.acc -= rate;
    const r = Math.random;
    if (st.type === "coffee-machine") {
      // vapor saindo da xícara e, no chá, também do bico da chaleira de vapor
      const p = at(st, -0.06 + (r() - 0.5) * 0.04, 1.06, 0.2 + (r() - 0.5) * 0.04);
      fx.puffs.spawn({ x: p.x, y: p.y, z: p.z, vx: (r() - 0.5) * 0.08, vy: 0.32 + r() * 0.2, vz: (r() - 0.5) * 0.08, life: 1.3, size: 0.05, grow: 2.2, drag: 0.6, color: STEAM });
      if (item === "tea" || r() < 0.3) {
        const q = at(st, 0.2, 0.96, 0.21);
        fx.puffs.spawn({ x: q.x, y: q.y, z: q.z, vx: (r() - 0.5) * 0.1, vy: 0.5, vz: 0.1, life: 0.9, size: 0.04, grow: 2.5, drag: 0.8, color: STEAM });
      }
    } else if (st.type === "water-cooler") {
      // bolhas subindo dentro do galão
      const a = r() * Math.PI * 2;
      const p = at(st, Math.cos(a) * 0.08 * r(), 1.03, Math.sin(a) * 0.08 * r());
      fx.balls.spawn({ x: p.x, y: p.y, z: p.z, vy: 0.5 + r() * 0.35, life: 0.55, size: 0.025 + r() * 0.025, grow: 0.6, color: BUBBLE });
    } else if (st.type === "fridge") {
      // ar gelado escapando pela porta
      const p = at(st, (r() - 0.5) * 0.4, 0.9 + r() * 0.6, 0.38);
      fx.puffs.spawn({ x: p.x, y: p.y, z: p.z, vx: st.front.x * 0.35 + (r() - 0.5) * 0.1, vy: -0.12, vz: st.front.z * 0.35 + (r() - 0.5) * 0.1, life: 1.2, size: 0.07, grow: 1.8, drag: 0.9, color: MIST });
    } else {
      // pipoca estourando dentro da vitrine (mais no meio do preparo)
      const busy = Math.sin(Math.PI * Math.min(1, k * 1.15));
      if (r() > 0.25 + busy * 0.75) continue;
      const base = at(st, VIVO_POPCORN_SPOT.x, 0.92 + 0.3, VIVO_POPCORN_SPOT.z);
      const floor = 0.92 + 0.115;
      fx.balls.spawn({ x: base.x + (r() - 0.5) * 0.06, y: base.y, z: base.z + (r() - 0.5) * 0.06, vx: (r() - 0.5) * 0.3, vy: 0.35 + r() * 0.45, vz: (r() - 0.5) * 0.3, life: 1.4, size: 0.022 + r() * 0.012, gravity: -4, floor, color: KERNEL });
      if (r() < 0.25) fx.puffs.spawn({ x: base.x, y: base.y + 0.15, z: base.z, vy: 0.25, life: 1, size: 0.035, grow: 2, drag: 0.5, color: STEAM });
    }
  }
}

/** Brilhinho rápido quando fica pronto. */
function emitServed(st: StationFx, fx: { puffs: Particles; balls: Particles }): void {
  if (Math.random() > 0.5) return;
  const y = st.type === "fridge" ? 1.2 : st.type === "kitchen-counter" ? 1.35 : 1.1;
  const x = st.type === "kitchen-counter" ? VIVO_POPCORN_SPOT.x : 0;
  const zz = st.type === "kitchen-counter" ? VIVO_POPCORN_SPOT.z : 0.25;
  const p = at(st, x, y, zz);
  const a = Math.random() * Math.PI * 2;
  fx.balls.spawn({ x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * 0.5, vy: 0.6 + Math.random() * 0.4, vz: Math.sin(a) * 0.5, life: 0.7, size: 0.02, gravity: -1.5, color: GLINT });
}

// ---- quadro de giz ------------------------------------------------------------------------

const CHALK = { white: "#F2F0EF", yellow: "#F6E3A1", blue: "#9FD8F2", pink: "#F3B7CF", green: "#A9E2C3" };
const ROWS: Array<{ item: CopaItem; color: string }> = [
  { item: "coffee", color: CHALK.yellow },
  { item: "tea", color: CHALK.green },
  { item: "water", color: CHALK.blue },
  { item: "juice", color: CHALK.pink },
  { item: "popcorn", color: CHALK.white },
];

function drawChalk(ctx: CanvasRenderingContext2D, w: number, h: number, counts: Record<CopaItem, number>): void {
  const u = w / 448;
  // cabeçalho
  chalkText(ctx, T.copa.boardTitle.toUpperCase(), w / 2, 62 * u, 40 * u, CHALK.white, { align: "center", weight: 700, font: "NORD, Geist, sans-serif" });
  ctx.save();
  ctx.strokeStyle = CHALK.yellow;
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 4 * u;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(70 * u, 96 * u);
  ctx.bezierCurveTo(160 * u, 88 * u, 290 * u, 104 * u, 378 * u, 92 * u);
  ctx.stroke();
  ctx.restore();
  // xícara desenhada a giz no canto
  drawCup(ctx, 370 * u, 585 * u, 40 * u);
  // linhas por item
  const total = COPA_ITEMS.reduce((n, i) => n + counts[i], 0);
  if (total === 0) {
    chalkText(ctx, "Ninguém passou", w / 2, 250 * u, 30 * u, CHALK.white, { align: "center" });
    chalkText(ctx, "por aqui ainda.", w / 2, 292 * u, 30 * u, CHALK.white, { align: "center" });
    chalkText(ctx, "Inaugure o dia!", w / 2, 360 * u, 30 * u, CHALK.yellow, { align: "center", weight: 700 });
    return;
  }
  ROWS.forEach(({ item, color }, i) => {
    const y = (172 + i * 82) * u;
    const n = counts[item];
    chalkText(ctx, String(n), 118 * u, y, 60 * u, n > 0 ? color : "rgba(242,240,239,0.35)", { align: "right", weight: 800, font: "NORD, Geist, sans-serif" });
    chalkText(ctx, T.copa.count(item, n).replace(/^\d+ /, ""), 140 * u, y + 3 * u, 42 * u, n > 0 ? CHALK.white : "rgba(242,240,239,0.4)");
  });
}

function drawCup(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.save();
  ctx.strokeStyle = CHALK.white;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = s * 0.07;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(x - s * 0.5, y - s * 0.3);
  ctx.lineTo(x - s * 0.42, y + s * 0.4);
  ctx.quadraticCurveTo(x, y + s * 0.55, x + s * 0.42, y + s * 0.4);
  ctx.lineTo(x + s * 0.5, y - s * 0.3);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + s * 0.6, y, s * 0.18, -Math.PI / 2, Math.PI / 2);
  ctx.stroke();
  for (const dx of [-0.18, 0.08]) {
    ctx.beginPath();
    ctx.moveTo(x + dx * s, y - s * 0.45);
    ctx.bezierCurveTo(x + (dx - 0.12) * s, y - s * 0.65, x + (dx + 0.12) * s, y - s * 0.75, x + dx * s, y - s * 0.95);
    ctx.stroke();
  }
  ctx.restore();
}

/** Resumo de uma linha para a etiqueta do 2D: os três itens mais pedidos do dia. */
function boardLine(counts: Record<CopaItem, number>): string {
  const top = COPA_ITEMS.filter((i) => counts[i] > 0)
    .sort((a, b) => counts[b] - counts[a])
    .slice(0, 3);
  return top.length ? top.map((i) => T.copa.count(i, counts[i])).join(" · ") : T.copa.boardNone;
}
