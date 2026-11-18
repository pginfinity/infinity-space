import { useEffect, useMemo, useRef } from "react";
import { create } from "zustand";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { COPA_KIND, ORBI_ID, ORBI_KIND, dirOfYaw, orbiPoseAt, type CopaServed, type Lens, type MapObject, type ObjectType, type OrbiPose, type OrbiState, type Vec2 } from "@infinity/world";
import { actState, type ActivityClient, type DynamicTarget } from "../registry.ts";
import { sfx } from "../../audio/sfx.ts";
import { toast } from "../../ui/toasts.ts";
import { useApp } from "../../state/store.ts";
import { playEmote, self } from "../../world/registry.ts";
import { world } from "../../world/world.ts";
import { walkTo } from "../../engine/movement.ts";
import { Html } from "../../scene/Html.tsx";
import { lit as litMaterial } from "../../scene/materials.ts";
import { mountedFurniture, objectMatrix } from "../../scene/furniture/index.ts";
import { BOOK, LENS, PLATFORM_SIGN, RAMEN_TOP, bookRestMatrix } from "../../scene/furniture/easter.ts";
import { useWallVisible } from "../../scene/wallFacing.ts";
import { serverNow } from "../vivo/clock.ts";
import { Particles, ballGeometry, flatMaterial, glintGeometry } from "../vivo/particles.ts";
import { pickFrom, roll } from "./state.ts";
import { T } from "./strings.ts";

/**
 * Homenagens discretas: cada objeto do mapa ganha um alvo de interação quando alguém chega perto
 * (sem aparecer no guia). Tudo acontece só no cliente de quem mexeu: toast, som baixinho e um
 * efeito pequeno no mundo. O Orbi e a geladeira ganham falas raras, também só para quem fez.
 */

// ---- efeitos em andamento (lidos a cada quadro pela cena, fora do React) -------------------------

const fx = {
  /** performance.now() de cada acontecimento (0 = nada). */
  hal: 0,
  book: 0,
  barrel: 0,
  ramen: 0,
  bonk: 0,
};

/** Fala do Orbi em cima dele (balão), só para quem fez carinho. */
const useQuote = create<{ text: string | null }>(() => ({ text: null }));

/** Livro: tempo caído antes de voltar para a estante (ms). */
const BOOK_BACK_MS = 7500;

// ---- alvos ------------------------------------------------------------------------------------

interface Spot extends DynamicTarget {
  o: MapObject;
  /** Enquanto agora < busy, apertar de novo não faz nada. */
  busy: number;
  /** Enquanto agora < hidden, o alvo some (o livro está no chão). */
  hidden: number;
}

function find(type: ObjectType, variant?: number): MapObject | undefined {
  return world().map.objects.find((o) => o.type === type && (variant === undefined || (o.variant ?? 0) === variant));
}

let spots: Spot[] | null = null;
const out: DynamicTarget[] = [];

function buildSpots(): Spot[] {
  const list: Spot[] = [];
  /** `reach`: o ponto do alvo fica tantos metros à frente do objeto (a caneta: na ponta da mesa). */
  const add = (type: ObjectType, variant: number | undefined, label: string, radius: number, act: (s: Spot) => void, reach = 0) => {
    const o = find(type, variant);
    if (!o) return;
    const f = dirOfYaw(o.rot);
    const s: Spot = {
      key: `easter:${o.id}`,
      point: { x: o.pos.x + f.x * reach, z: o.pos.z + f.z * reach },
      radius,
      label,
      o,
      busy: 0,
      hidden: 0,
      run: () => {
        const now = performance.now();
        if (now < s.busy || now < s.hidden) return;
        act(s);
      },
    };
    list.push(s);
  };
  add("lens-rack", undefined, T.hal.label, 1.5, hal);
  add("crooked-book", undefined, T.book.label, 1.4, pullBook);
  add("pill-dish", 0, T.pills.red.label, 1.5, (s) => pill(s, "red"));
  add("pill-dish", 1, T.pills.blue.label, 1.5, (s) => pill(s, "blue"));
  add("brick-pillar", undefined, T.platform.label, 1.3, platform);
  add("fancy-pen", undefined, T.pen.label, 1.2, pen, 0.55);
  add("barrel", undefined, T.barrel.label, 1.4, barrel);
  add("ramen-bowl", undefined, T.ramen.label, 1.2, ramen);
  return list;
}

function hal(s: Spot): void {
  s.busy = performance.now() + 2600;
  fx.hal = performance.now();
  sfx("deploy-beep", { at: s.point, volume: 0.45, range: 9 });
  window.setTimeout(() => sfx("deploy-beep", { at: s.point, volume: 0.35, range: 9 }), 220);
  toast(T.hal.line, 4500);
}

function pullBook(s: Spot): void {
  const now = performance.now();
  s.hidden = now + BOOK_BACK_MS + 400;
  fx.book = now;
  window.setTimeout(() => sfx("easter-book", { at: s.point, volume: 0.6, range: 10 }), 560);
  window.setTimeout(() => toast(T.book.line, 4500, { sub: T.book.morse }), 800);
}

function pill(s: Spot, color: "red" | "blue"): void {
  s.busy = performance.now() + 1500;
  if (color === "red") {
    sfx("presenca-warp", { volume: 0.4 });
    toast(T.pills.red.line, 4200);
  } else {
    sfx("vivo-ready", { volume: 0.4 });
    toast(T.pills.blue.line, 5200);
  }
}

function platform(s: Spot): void {
  s.busy = performance.now() + 3000;
  const f = dirOfYaw(s.o.rot);
  // um passinho até encostar na pilastra, a cabeçada e a volta
  const wall: Vec2 = { x: s.o.pos.x + f.x * 0.2, z: s.o.pos.z + f.z * 0.2 };
  const back: Vec2 = { x: s.o.pos.x + f.x * 1.0, z: s.o.pos.z + f.z * 1.0 };
  const hit = () => {
    fx.bonk = performance.now();
    sfx("easter-bonk", { volume: 0.5 });
    toast(T.platform.line, 3800);
    window.setTimeout(() => {
      walkTo(back, () => {
        const id = useApp.getState().selfId;
        if (id) playEmote(id, "laugh");
      }, { speed: 2.2 });
    }, 180);
  };
  if (!walkTo(wall, hit, { speed: 3.4 })) hit();
}

function pen(s: Spot): void {
  s.busy = performance.now() + 1200;
  sfx("board-pin", { at: s.point, volume: 0.5, range: 6 });
  toast(pickFrom("caneta", T.pen.lines), 5200);
}

function barrel(s: Spot): void {
  s.busy = performance.now() + 1600;
  fx.barrel = performance.now();
  sfx("porta-batida", { at: s.point, volume: 0.45, range: 8 });
  toast(T.barrel.line, 3800);
}

function ramen(s: Spot): void {
  s.busy = performance.now() + 1800;
  fx.ramen = performance.now();
  sfx("easter-slurp", { at: s.point, volume: 0.5, range: 6 });
  toast(T.ramen.line, 4200);
}

export const easterClient: ActivityClient = {
  name: "easter/homenagens",
  kinds: [ORBI_KIND, COPA_KIND],
  targets: () => {
    spots ??= buildSpots();
    out.length = 0;
    const now = performance.now();
    for (const s of spots) if (now >= s.hidden) out.push(s);
    return out;
  },
  onEvent: (e) => {
    const me = useApp.getState().selfId;
    if (!me || e.from !== me) return;
    // Orbi: de vez em quando (1 em 5) solta uma frase para quem fez carinho.
    if (e.kind === ORBI_KIND && e.ev === "pet") {
      if (!roll("orbi", 5)) return;
      const text = pickFrom("orbi-frase", T.orbi.quotes);
      window.setTimeout(() => {
        useQuote.setState({ text });
        sfx("vivo-orbi-beep", { volume: 0.35 });
        window.setTimeout(() => useQuote.getState().text === text && useQuote.setState({ text: null }), 3400);
      }, 650);
      return;
    }
    // Geladeira: 1 em 12, para quem pegou.
    if (e.kind === COPA_KIND && e.ev === "served") {
      const d = e.data as CopaServed;
      const o = world().map.objects.find((x) => x.id === d.station);
      if (o?.type !== "fridge" || !roll("gabagool", 12)) return;
      window.setTimeout(() => toast(T.fridge.line, 4200), 900);
    }
  },
  Scene: EasterScene,
};

// ---- no mundo -----------------------------------------------------------------------------

const ONE = new THREE.Vector3(1, 1, 1);
const STEAM = new THREE.Color("#F4F7FA");
const DUST = new THREE.Color("#D9D2C7");
const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();
const _e = new THREE.Euler();
/** Estante: o tremor gira em torno da quina de trás, no chão. */
const SHELF_BACK = new THREE.Matrix4().makeTranslation(0, 0, 0.2);

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

/** Queda do livro: poses do corpo no referencial do objeto (montadas uma vez). */
function bookKeys(elev: number) {
  const rest = bookRestMatrix();
  const restInv = rest.clone().invert();
  const pulled = new THREE.Matrix4().makeTranslation(0, 0.015, 0.22).multiply(rest);
  const p1 = new THREE.Vector3();
  const q1 = new THREE.Quaternion();
  pulled.decompose(p1, q1, _s);
  // deitado no chão, na frente da estante, meio de lado
  const pf = new THREE.Vector3(0.08, -elev + BOOK.w / 2 + 0.002, 0.5);
  const qf = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.7, -Math.PI / 2, "YXZ"));
  return { rest, restInv, p1, q1, pf, qf };
}

function EasterScene({ lens }: { lens: Lens }) {
  const objs = useMemo(() => {
    const book = find("crooked-book");
    // a estante do livro é a mais perto dele
    const shelf = book
      ? world()
          .map.objects.filter((o) => o.type === "bookshelf")
          .sort((a, b) => Math.hypot(a.pos.x - book.pos.x, a.pos.z - book.pos.z) - Math.hypot(b.pos.x - book.pos.x, b.pos.z - book.pos.z))[0]
      : undefined;
    return { book, shelf, rack: find("lens-rack"), pillar: find("brick-pillar"), barrel: find("barrel"), ramen: find("ramen-bowl") };
  }, []);
  const keys = useMemo(() => (objs.book ? bookKeys(objs.book.elevation ?? 0) : null), [objs]);
  const parts = useMemo(() => {
    const steam = new Particles(ballGeometry(), flatMaterial({ opacity: 0.42 }), 60);
    const halo = objs.rack ? haloMesh(objs.rack) : null;
    const stars = starRing();
    return { steam, halo, stars };
  }, [objs]);
  const st = useRef({ book: "rest" as "rest" | "anim", shelf: false, barrel: false, landed: false, steamAcc: 0, version: -1 });

  useEffect(
    () => () => {
      parts.steam.dispose();
      parts.halo?.geometry.dispose();
      (parts.halo?.material as THREE.MeshBasicMaterial | undefined)?.map?.dispose();
      (parts.halo?.material as THREE.Material | undefined)?.dispose();
      parts.stars.dispose();
    },
    [parts],
  );

  useFrame((_, dt) => {
    const now = performance.now();
    const s = st.current;
    const mf = mountedFurniture();
    const build = mf.build;
    // móveis montados de novo (troca de lente): as poses voltam ao normal sozinhas
    if (mf.version !== s.version) {
      s.version = mf.version;
      s.book = "rest";
      s.shelf = s.barrel = false;
    }

    // Interestelar: o livro sai, cai no chão e depois volta ao lugar; a estante treme um pouco
    if (build && objs.book && keys) {
      const t = fx.book ? (now - fx.book) / 1000 : -1;
      if (t >= 0 && t < BOOK_BACK_MS / 1000 + 0.35) {
        s.book = "anim";
        bookPose(t, keys, _m);
        build.setInstance(objs.book.id, { shape: _m2.multiplyMatrices(_m, keys.restInv) });
        if (t >= 0.72 && !s.landed) {
          s.landed = true;
          const w = _v.set(keys.pf.x, keys.pf.y, keys.pf.z).applyMatrix4(objectMatrix(objs.book, _m));
          for (let i = 0; i < 9; i++) {
            const a = (i / 9) * Math.PI * 2;
            parts.steam.spawn({ x: w.x, y: w.y + 0.02, z: w.z, vx: Math.cos(a) * 0.5, vy: 0.12 + Math.random() * 0.1, vz: Math.sin(a) * 0.5, life: 0.8, size: 0.05, grow: 1.6, drag: 2.5, color: DUST });
          }
        }
      } else if (s.book === "anim") {
        s.book = "rest";
        s.landed = false;
        fx.book = 0;
        build.setInstance(objs.book.id, { shape: null });
      }
      if (objs.shelf) {
        if (t >= 0 && t < 0.8) {
          const k = Math.sin(t * 46) * 0.012 * (1 - t / 0.8);
          _m.makeTranslation(0, 0, -0.2).multiply(_m2.makeRotationX(k)).multiply(SHELF_BACK);
          build.setInstance(objs.shelf.id, { shape: _m });
          s.shelf = true;
        } else if (s.shelf) {
          s.shelf = false;
          build.setInstance(objs.shelf.id, { shape: null });
        }
      }
    }

    // Chaves: o barril balança e dá um pulinho
    if (build && objs.barrel) {
      const t = fx.barrel ? (now - fx.barrel) / 1000 : -1;
      if (t >= 0 && t < 0.9) {
        const k = 1 - t / 0.9;
        const a = Math.sin(t * 22) * 0.07 * k;
        _q.setFromEuler(_e.set(a * 0.5, 0, a, "YXZ"));
        _m.compose(_p.set(0, Math.abs(Math.sin(t * 22)) * 0.025 * k, 0), _q, ONE);
        build.setInstance(objs.barrel.id, { shape: _m });
        s.barrel = true;
      } else if (s.barrel) {
        s.barrel = false;
        fx.barrel = 0;
        build.setInstance(objs.barrel.id, { shape: null });
      }
    }

    // 2001: a lente acende forte quando alguém fala com o computador
    if (parts.halo) {
      const k = fx.hal ? (now - fx.hal) / 2800 : 1;
      const o = k < 1 ? (k < 0.08 ? k / 0.08 : 1 - (k - 0.08) / 0.92) * (0.85 + 0.15 * Math.sin(now / 60)) : 0;
      (parts.halo.material as THREE.MeshBasicMaterial).opacity = o;
      parts.halo.visible = o > 0.01;
    }

    // Naruto: vapor subindo do lámen para quem está perto; uma baforada ao comer
    if (objs.ramen) {
      const o = objs.ramen;
      const near = Math.hypot(self.x - o.pos.x, self.z - o.pos.z) < (lens === "2d" ? 10 : 8);
      const y = (o.elevation ?? 0) + RAMEN_TOP + 0.015;
      const eating = fx.ramen && now - fx.ramen < 600;
      if (near || eating) {
        s.steamAcc += dt * (eating ? 26 : 2.6);
        while (s.steamAcc > 1) {
          s.steamAcc -= 1;
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * 0.05;
          parts.steam.spawn({ x: o.pos.x + Math.cos(a) * r, y, z: o.pos.z + Math.sin(a) * r, vx: (Math.random() - 0.5) * 0.06, vy: 0.16 + Math.random() * 0.12, vz: (Math.random() - 0.5) * 0.06, life: 1.5, size: 0.026, grow: 2.4, drag: 0.4, color: STEAM });
        }
      }
    }
    parts.steam.update(dt);

    // 9¾: estrelinhas girando em volta da cabeça depois da cabeçada
    parts.stars.update(fx.bonk ? (now - fx.bonk) / 1000 : -1);
  });

  return (
    <>
      <primitive object={parts.steam.mesh} />
      {parts.halo && <primitive object={parts.halo} />}
      <primitive object={parts.stars.group} />
      {objs.pillar && <PlatformSign o={objs.pillar} />}
      <OrbiQuote />
    </>
  );
}

/** Pose do corpo do livro no instante t (s) da queda, no referencial do objeto. */
function bookPose(t: number, k: ReturnType<typeof bookKeys>, outM: THREE.Matrix4): THREE.Matrix4 {
  const back = BOOK_BACK_MS / 1000;
  if (t < 0.25) {
    // puxado para fora
    const e = easeOut(t / 0.25);
    return outM.makeTranslation(0, 0.015 * e, 0.22 * e).multiply(k.rest);
  }
  if (t < 0.72) {
    // cai: acelera para baixo, gira e deita de lado
    const u = (t - 0.25) / 0.47;
    _p.set(k.p1.x + (k.pf.x - k.p1.x) * u, k.p1.y + (k.pf.y - k.p1.y) * u * u, k.p1.z + (k.pf.z - k.p1.z) * u);
    _q.copy(k.q1).slerp(k.qf, Math.min(1, u * u * 1.2));
    return outM.compose(_p, _q, ONE);
  }
  if (t < back) return outM.compose(k.pf, k.qf, ONE);
  // volta ao lugar com um "pop"
  const u = Math.min(1, (t - back) / 0.35);
  const sc = Math.max(0.001, 1 + 0.12 * Math.sin(u * Math.PI) - (1 - u) * 0.9);
  return outM.copy(k.rest).multiply(_m2.makeScale(sc, sc, sc));
}

/** Brilho vermelho na frente da lente (aparece quando falam com o computador). */
function haloMesh(rack: MapObject): THREE.Mesh {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,170,140,1)");
  grad.addColorStop(0.18, "rgba(255,72,48,0.9)");
  grad.addColorStop(0.5, "rgba(224,72,59,0.28)");
  grad.addColorStop(1, "rgba(224,72,59,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), mat);
  mesh.name = "easter:lente";
  objectMatrix(rack).multiply(new THREE.Matrix4().makeTranslation(0, LENS.y, LENS.z + 0.014)).decompose(mesh.position, mesh.quaternion, mesh.scale);
  mesh.visible = false;
  mesh.renderOrder = 3;
  return mesh;
}

/** Cinco estrelinhas douradas que giram em volta da cabeça por um segundo e pouco. */
function starRing() {
  const group = new THREE.Group();
  group.name = "easter:estrelinhas";
  const geo = glintGeometry();
  const mat = flatMaterial();
  mat.color.set("#F6D27A");
  const stars: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(geo, mat);
    group.add(m);
    stars.push(m);
  }
  group.visible = false;
  return {
    group,
    /** t = segundos desde a cabeçada (negativo = nada). */
    update(t: number) {
      const on = t >= 0 && t < 1.5;
      group.visible = on;
      if (!on) return;
      const fade = t < 1.1 ? 1 : 1 - (t - 1.1) / 0.4;
      stars.forEach((m, i) => {
        const a = t * 7 + (i / stars.length) * Math.PI * 2;
        m.position.set(self.x + Math.cos(a) * 0.3, 1.92 + Math.sin(t * 11 + i) * 0.035, self.z + Math.sin(a) * 0.3);
        m.rotation.set(0, a * 2, 0);
        m.scale.setScalar(0.085 * Math.max(0.01, fade));
      });
    },
    dispose() {
      mat.dispose();
    },
  };
}

/** A placa "Plataforma 9¾" da pilastra, em textura (fontes da marca, arte própria). */
function PlatformSign({ o }: { o: MapObject }) {
  const visible = useWallVisible(o.id);
  const sign = useMemo(() => {
    const W = 512;
    const H = Math.round((W * PLATFORM_SIGN.h) / PLATFORM_SIGN.w);
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = litMaterial({ map: tex });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(PLATFORM_SIGN.w, PLATFORM_SIGN.h), mat);
    mesh.name = `easter:placa:${o.id}`;
    objectMatrix(o).multiply(new THREE.Matrix4().makeTranslation(0, PLATFORM_SIGN.y, PLATFORM_SIGN.z + 0.004)).decompose(mesh.position, mesh.quaternion, mesh.scale);
    const draw = () => {
      drawPlatformSign(canvas.getContext("2d")!, W, H);
      tex.needsUpdate = true;
    };
    draw();
    return { mesh, tex, mat, draw };
  }, [o]);

  useEffect(() => {
    let alive = true;
    if (document.fonts) void Promise.all([document.fonts.load("900 120px NORD"), document.fonts.load("600 32px Geist")]).then(() => alive && sign.draw());
    return () => {
      alive = false;
      sign.mesh.geometry.dispose();
      sign.mat.dispose();
      sign.tex.dispose();
    };
  }, [sign]);

  useEffect(() => {
    sign.mesh.visible = visible;
  }, [sign, visible]);

  return <primitive object={sign.mesh} />;
}

function drawPlatformSign(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.clearRect(0, 0, w, h);
  g.fillStyle = "#0A2547";
  g.fillRect(0, 0, w, h);
  // filete claro por dentro, como placa esmaltada
  g.strokeStyle = "#F2F0EF";
  g.lineWidth = 5;
  g.strokeRect(12, 12, w - 24, h - 24);
  g.fillStyle = "#F2F0EF";
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  g.font = '600 30px Geist, "Segoe UI", sans-serif';
  (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "8px";
  g.fillText(T.platform.signTop.toUpperCase(), w / 2 + 4, 62);
  (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "0px";
  // "9" grande e a fração ¾ desenhada à mão (3 sobre 4, com a barra), na fonte da marca
  const cy = h - 40;
  g.font = '900 128px NORD, "Arial Black", sans-serif';
  g.textAlign = "right";
  g.fillText("9", w / 2 + 8, cy);
  g.textAlign = "center";
  g.font = '900 52px NORD, "Arial Black", sans-serif';
  g.fillText("3", w / 2 + 40, cy - 56);
  g.fillText("4", w / 2 + 86, cy);
  g.lineWidth = 7;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(w / 2 + 38, cy - 4);
  g.lineTo(w / 2 + 90, cy - 92);
  g.stroke();
}

/** Balão com a fala do Orbi, preso em cima dele enquanto dura. */
const _pose: OrbiPose = { x: 0, z: 0, yaw: 0, moving: false };
function OrbiQuote() {
  const text = useQuote((s) => s.text);
  const g = useRef<THREE.Group>(null);
  const start = useMemo(() => {
    const s = actState<OrbiState>(ORBI_ID);
    if (s) orbiPoseAt(s, serverNow(), _pose);
    return { x: _pose.x, z: _pose.z };
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame(() => {
    const s = actState<OrbiState>(ORBI_ID);
    if (!g.current || !s || !text) return;
    orbiPoseAt(s, serverNow(), _pose);
    g.current.position.set(_pose.x, 0, _pose.z);
  });
  if (!text) return null;
  return (
    <group ref={g} position={[start.x, 0, start.z]}>
      <Html position={[0, 1.78, 0]} center zIndexRange={[8, 0]} style={{ pointerEvents: "none" }}>
        <div role="status" aria-live="polite" className="relative whitespace-nowrap rounded-2xl bg-offwhite px-3 py-1.5 text-[13px] font-semibold text-space shadow-lg" data-easter-quote>
          {text}
          <span aria-hidden className="absolute left-1/2 top-full size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-offwhite" />
        </div>
      </Html>
    </group>
  );
}
