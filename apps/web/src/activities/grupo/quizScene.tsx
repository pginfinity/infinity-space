import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { QUIZ_ID, type Lens, type QuizState } from "@infinity/world";
import { actState } from "../registry.ts";
import { objectMatrix } from "../../scene/furniture/index.ts";
import { sampleRemote, self } from "../../world/registry.ts";
import { useApp } from "../../state/store.ts";
import { world } from "../../world/world.ts";
import { burst } from "./fx.tsx";
import { deadlineOf } from "./shared.tsx";
import { SCREEN_H, SCREEN_W, paintQuizScreen } from "./quizScreen.ts";
import { useQuiz, useQuizLocal } from "./quizStore.ts";

/**
 * O Quiz Show no mundo: o telão do auditório mostra pergunta, alternativas e placar (por cima da TV,
 * só enquanto há quiz), canhões de luz varrem o palco e o confete cai no fim. Igual nas duas lentes.
 */
export function QuizScene({ lens }: { lens: Lens }) {
  const s = useQuiz();
  const on = !!s && s.phase !== "idle";
  return (
    <>
      {on && <BigScreen lens={lens} />}
      {on && <StageLights />}
      <FinalBurst />
    </>
  );
}

/** Plano do telão: mesma posição e tamanho da tela da TV do auditório, um pouco à frente. */
function BigScreen({ lens }: { lens: Lens }) {
  const tv = useMemo(() => world().map.objects.find((o) => o.screenId === "auditorio"), []);
  const canvas = useMemo(() => {
    const c = document.createElement("canvas");
    // No 2D (pixelado) meia resolução basta e fica mais nítido no pixel art.
    const k = lens === "2d" ? 0.5 : 1;
    c.width = Math.round(SCREEN_W * k);
    c.height = Math.round(SCREEN_H * k);
    return c;
  }, [lens]);
  const tex = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter;
    t.anisotropy = 4;
    return t;
  }, [canvas]);
  const matrix = useMemo(() => {
    if (!tv) return null;
    // Tela da TV no espaço do modelo: (1,7 - 0,08) x (0,96 - 0,08), centro em y = 0,48, z = 0,022.
    return objectMatrix(tv).multiply(new THREE.Matrix4().makeTranslation(0, 0.48, 0.034));
  }, [tv]);
  const last = useRef({ state: null as QuizState | null, bucket: -1, fonts: 0 });
  const fonts = useRef(0);

  useEffect(() => {
    void document.fonts?.ready.then(() => fonts.current++);
    return () => tex.dispose();
  }, [tex]);

  useFrame(() => {
    const st = actState<QuizState>(QUIZ_ID);
    if (!st) return;
    const timed = st.phase === "ready" || st.phase === "question";
    const left = timed ? Math.max(0, deadlineOf(st) - performance.now()) : 0;
    const bucket = timed ? Math.ceil(left / 250) : -1;
    const l = last.current;
    if (l.state === st && l.bucket === bucket && l.fonts === fonts.current) return;
    l.state = st;
    l.bucket = bucket;
    l.fonts = fonts.current;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(canvas.width / SCREEN_W, 0, 0, canvas.height / SCREEN_H, 0, 0);
    paintQuizScreen(ctx, st, left, () => fonts.current++);
    tex.needsUpdate = true;
  });

  if (!matrix) return null;
  return (
    <mesh matrixAutoUpdate={false} matrix={matrix} renderOrder={3} name="quiz:telao">
      <planeGeometry args={[1.62, 0.88]} />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  );
}

// ---- luzes do palco -------------------------------------------------------------------------

const STAGE = { x0: 23, x1: 26, z0: 13.4, z1: 20.6 };
const H = 3.1;

/** Feixe de luz (cone aditivo) que varre o palco; no fim, um deles segue o vencedor. */
function StageLights() {
  const group = useRef<THREE.Group>(null);
  const poolGroup = useRef<THREE.Group>(null);
  const beams = useMemo(
    () =>
      [
        { color: "#BFE9FF", from: { x: 22.2, z: 13.8 }, phase: 0 },
        { color: "#FFD9C7", from: { x: 22.2, z: 20.2 }, phase: 2.1 },
        { color: "#E6F4FF", from: { x: 24.5, z: 17 }, phase: 4.2 },
      ] as const,
    [],
  );
  const geo = useMemo(() => {
    const g = new THREE.ConeGeometry(0.9, H, 28, 1, true);
    g.translate(0, -H / 2, 0); // ápice na origem (a lâmpada), base para baixo
    return g;
  }, []);
  const mats = useMemo(
    () =>
      beams.map(
        (b) =>
          new THREE.MeshBasicMaterial({
            color: b.color,
            transparent: true,
            opacity: 0.1,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
            toneMapped: false,
          }),
      ),
    [beams],
  );
  const pools = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const x = c.getContext("2d")!;
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,0.9)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    return beams.map((b) => new THREE.MeshBasicMaterial({ map: t, color: b.color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  }, [beams]);
  const target = useMemo(() => new THREE.Vector3(), []);
  const flash = useRef({ seen: useQuizLocal.getState().fxReveal, t: 0 });

  useEffect(
    () => () => {
      geo.dispose();
      mats.forEach((m) => m.dispose());
      pools.forEach((m) => {
        m.map?.dispose();
        m.dispose();
      });
    },
    [geo, mats, pools],
  );

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    const st = actState<QuizState>(QUIZ_ID);
    const t = state.clock.elapsedTime;
    const fx = useQuizLocal.getState().fxReveal;
    if (fx !== flash.current.seen) {
      flash.current.seen = fx;
      flash.current.t = 0.9;
    }
    flash.current.t = Math.max(0, flash.current.t - dt);
    // No fim, o feixe do meio procura o vencedor (se estiver por perto).
    let winner: { x: number; z: number } | null = null;
    if (st?.phase === "final") {
      const top = [...st.players].sort((a, b) => b.score - a.score)[0];
      if (top && top.score > 0) {
        const me = useApp.getState().selfId;
        const p = top.id === me ? self : sampleRemote(top.id);
        if (p && p.x > 9 && p.x < 26 && p.z > 12 && p.z < 22) winner = { x: p.x, z: p.z };
      }
    }
    const busy = st?.phase === "question" || st?.phase === "ready";
    const pl = poolGroup.current;
    g.children.forEach((child, i) => {
      const b = beams[i % beams.length]!;
      const beam = child.children[0] as THREE.Mesh;
      const pool = pl?.children[i] as THREE.Mesh | undefined;
      // varredura suave pelo palco
      const sp = busy ? 0.9 : 0.45;
      let tx = (STAGE.x0 + STAGE.x1) / 2 + Math.sin(t * sp * 0.8 + b.phase) * 1.1;
      let tz = (STAGE.z0 + STAGE.z1) / 2 + Math.sin(t * sp + b.phase * 1.7) * 3.1;
      let sx: number = b.from.x;
      let sz: number = b.from.z;
      if (winner && i === 2) {
        // canhão seguidor: logo acima e um pouco à frente de quem venceu
        tx = winner.x;
        tz = winner.z;
        sx = winner.x + 0.9;
        sz = winner.z;
      }
      child.position.set(sx, H, sz);
      target.set(tx - sx, -H, tz - sz).normalize();
      child.quaternion.setFromUnitVectors(DOWN, target);
      beam.scale.set(1, Math.hypot(tx - sx, H, tz - sz) / H, 1);
      (beam.material as THREE.MeshBasicMaterial).opacity = 0.08 + flash.current.t * 0.12 + (winner && i === 2 ? 0.06 : 0);
      if (pool) {
        // a mancha de luz fica no chão do palco (0,35 m) ou da plateia
        pool.position.set(tx, tx >= STAGE.x0 ? 0.37 : 0.03, tz);
        (pool.material as THREE.MeshBasicMaterial).opacity = 0.28 + flash.current.t * 0.3;
      }
    });
  });

  return (
    <>
      <group ref={group} name="quiz:luzes">
        {beams.map((b, i) => (
          <group key={i}>
            <mesh geometry={geo} material={mats[i]} renderOrder={4} />
          </group>
        ))}
      </group>
      <group ref={poolGroup} name="quiz:manchas">
        {beams.map((b, i) => (
          <mesh key={i} material={pools[i]} rotation-x={-Math.PI / 2} renderOrder={4}>
            <circleGeometry args={[1.0, 24]} />
          </mesh>
        ))}
      </group>
    </>
  );
}

const DOWN = new THREE.Vector3(0, -1, 0);

/** Confete no palco quando o quiz termina. */
function FinalBurst() {
  const fx = useQuizLocal((l) => l.fxFinal);
  const seen = useRef(fx);
  useEffect(() => {
    if (fx === seen.current) return;
    seen.current = fx;
    burst({ x: 24.5, z: 15.5 }, 2.6, 1.6);
    window.setTimeout(() => burst({ x: 24.5, z: 18.5 }, 2.6, 1.6), 350);
    window.setTimeout(() => burst({ x: 18, z: 17 }, 2.8, 3), 700);
  }, [fx]);
  return null;
}
