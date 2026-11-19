import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Canvas, useFrame } from "@react-three/fiber";
import { RotateCcw, RotateCw } from "lucide-react";
import * as THREE from "three";
import type { AvatarLook, Emote } from "@infinity/world";
import { buildAvatar, useAvatarKit } from "../avatar/build.ts";
import { animate, newAnimState } from "../avatar/animate.ts";

const STEP = Math.PI / 4; // um clique gira 45°
const DRAG = 0.012; // rad por pixel arrastado

/** Giro da prévia: `target` é para onde o avatar olha; `user` desliga o balanço automático depois que a pessoa mexe. */
type Spin = { yaw: number; target: number; user: boolean; drag: { x: number; yaw: number } | null };

/** Prévia 3D do avatar no criador: arraste (mouse ou dedo) ou use os botões para dar a volta completa. */
export default function AvatarStudio({ look, emote }: { look: AvatarLook; emote?: { e: Emote; at: number } | null }) {
  const { t } = useTranslation();
  const spin = useRef<Spin>({ yaw: 0, target: 0, user: false, drag: null });
  // Os botões param sempre em múltiplos de 45° a partir da frente (frente, perfil, costas...).
  const turn = (d: number) => {
    const s = spin.current;
    s.target = (s.user ? Math.round(s.target / STEP) * STEP : 0) + d * STEP;
    s.user = true;
  };
  const btn =
    "grid size-9 place-items-center rounded-full border border-offwhite/12 bg-deep/60 text-slate transition-colors hover:border-signal hover:text-offwhite focus-visible:outline-2 focus-visible:outline-signal";
  return (
    <div className="relative size-full">
      <div
        className="size-full cursor-grab touch-none active:cursor-grabbing"
        data-testid="avatar-studio"
        onPointerDown={(e) => {
          const s = spin.current;
          s.user = true;
          s.drag = { x: e.clientX, yaw: s.target };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const s = spin.current;
          if (s.drag) s.target = s.yaw = s.drag.yaw + (e.clientX - s.drag.x) * DRAG;
        }}
        onPointerUp={() => (spin.current.drag = null)}
        onPointerCancel={() => (spin.current.drag = null)}
      >
        <Canvas dpr={[1, 2]} camera={{ fov: 30, position: [0, 0.85, 3.7] }} gl={{ antialias: true, alpha: true }} onCreated={({ camera }) => camera.lookAt(0, 0.62, 0)}>
          <hemisphereLight args={["#E6F0FF", "#2A3550", 1.25]} />
          <directionalLight position={[2, 4, 3]} intensity={1.6} color="#FFF1DE" />
          <directionalLight position={[-3, 2, -2]} intensity={0.6} color="#7FC8FF" />
          <Model look={look} emote={emote ?? null} spin={spin} />
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
            <circleGeometry args={[0.75, 48]} />
            <meshBasicMaterial color="#00B7FF" transparent opacity={0.12} />
          </mesh>
        </Canvas>
      </div>
      <div className="absolute inset-x-0 bottom-2 flex justify-center gap-2">
        <button type="button" className={btn} aria-label={t("entry.rotateLeft")} title={t("entry.rotateLeft")} onClick={() => turn(-1)}>
          <RotateCcw className="size-4" aria-hidden />
        </button>
        <button type="button" className={btn} aria-label={t("entry.rotateRight")} title={t("entry.rotateRight")} onClick={() => turn(1)}>
          <RotateCw className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

function Model({ look, emote, spin }: { look: AvatarLook; emote: { e: Emote; at: number } | null; spin: React.RefObject<Spin> }) {
  const key = JSON.stringify(look);
  const kit = useAvatarKit();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rig = useMemo(() => buildAvatar(kit, look), [kit, key]);
  useEffect(() => () => rig.dispose(), [rig]);
  const st = useMemo(newAnimState, []);
  const sway = useRef(0.35);
  const lastKey = useRef(key);
  const waveAt = useRef(performance.now());

  // Acena quando o visual muda (feedback de "ficou bom!").
  useEffect(() => {
    if (lastKey.current !== key) {
      lastKey.current = key;
      waveAt.current = performance.now();
    }
  }, [key]);

  useFrame((_, dt) => {
    const now = performance.now();
    const s = spin.current;
    if (!s.user) {
      sway.current += dt * 0.35;
      s.target = Math.sin(sway.current) * 0.6;
    }
    if (!s.drag) s.yaw += (s.target - s.yaw) * (1 - Math.exp(-dt * 10));
    rig.root.rotation.y = s.yaw;
    const custom = emote && now - emote.at < 2500 ? { e: emote.e, t: (now - emote.at) / 1000 } : null;
    const since = (now - waveAt.current) / 1000;
    const auto = since < 1.6 ? { e: "wave" as Emote, t: since } : null;
    animate(rig, st, "idle", 0, dt, now, 0, custom ?? auto);
  });

  return <primitive object={rig.root} />;
}

export const _three = THREE;
