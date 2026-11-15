import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { pointInPolygon, type AvatarLook, type Emote, type PlayerInfo, type Vec2 } from "@infinity/world";
import { useApp } from "../state/store.ts";
import { currentEmote, sampleRemote, self, type Pose } from "../world/registry.ts";
import { world } from "../world/world.ts";
import { STATUS_COLOR } from "../world/theme.ts";
import { buildAvatar } from "../avatar/build.ts";
import { animate, newAnimState } from "../avatar/animate.ts";

/** Todos os avatares da sala, iguais nas duas lentes. */
export function Avatars() {
  const players = useApp((s) => s.players);
  const selfId = useApp((s) => s.selfId);
  return (
    <>
      {Object.values(players).map((p) => (
        <AvatarView key={p.id} info={p} isSelf={p.id === selfId} />
      ))}
    </>
  );
}

const EMOJI: Record<Emote, string> = { wave: "👋", dance: "💃", clap: "👏", cheer: "🎉", point: "👉", think: "🤔", laugh: "😂", heart: "❤️" };

const lookKey = (l: AvatarLook) => JSON.stringify(l);

/** Assentos do mapa (para saber a altura de quem está sentado). */
let seats: Array<{ p: Vec2; h: number }> | null = null;
function seatHeightAt(x: number, z: number): number {
  if (!seats) {
    seats = [];
    for (const o of world().map.objects) {
      const it = o.interact;
      if (!it || it.action !== "sit") continue;
      for (const p of [it.point, ...(it.more ?? [])]) seats.push({ p, h: it.seatHeight ?? 0.45 });
    }
  }
  let best = 0.45;
  let bestD = 0.8;
  for (const s of seats) {
    const d = Math.hypot(s.p.x - x, s.p.z - z);
    if (d < bestD) {
      bestD = d;
      best = s.h;
    }
  }
  return best;
}

/** Altura do piso (palco). */
let raised: Array<{ poly: Vec2[]; y: number }> | null = null;
function floorY(x: number, z: number): number {
  raised ??= world().map.floors.filter((f) => (f.elevation ?? 0) > 0.05).map((f) => ({ poly: f.polygon, y: f.elevation! }));
  for (const r of raised) if (pointInPolygon({ x, z }, r.poly)) return r.y;
  return 0;
}

function AvatarView({ info, isSelf }: { info: PlayerInfo; isSelf: boolean }) {
  const key = lookKey(info.look);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rig = useMemo(() => buildAvatar(info.look), [key]);
  const st = useMemo(newAnimState, []);
  const scratch = useMemo<Pose>(() => ({ x: 0, z: 0, yaw: 0, anim: "idle" }), []);
  const last = useRef<{ x: number; z: number } | null>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const lastEmote = useRef<Emote | null>(null);
  const y = useRef(0);

  useFrame((_, dt) => {
    const now = performance.now();
    const p = isSelf ? self : sampleRemote(info.id, now, scratch);
    if (!p) return;
    const prev = last.current;
    const speed = prev && dt > 0 ? Math.hypot(p.x - prev.x, p.z - prev.z) / dt : 0;
    last.current = { x: p.x, z: p.z };
    const seatH = p.anim === "sit" ? seatHeightAt(p.x, p.z) : 0;
    y.current += (floorY(p.x, p.z) - y.current) * Math.min(1, dt * 12);
    rig.root.position.set(p.x, y.current, p.z);
    rig.root.rotation.y = Math.PI - p.yaw;
    const emote = currentEmote(info.id, now);
    animate(rig, st, p.anim, speed, dt, now, seatH, emote);

    // Balão do emote, sem re-render do React.
    const e = emote?.e ?? null;
    if (bubble.current && e !== lastEmote.current) {
      lastEmote.current = e;
      bubble.current.textContent = e ? EMOJI[e] : "";
      bubble.current.style.opacity = e ? "1" : "0";
      bubble.current.style.transform = e ? "translateY(0) scale(1)" : "translateY(6px) scale(0.6)";
    }
  });

  const away = info.status === "away";
  return (
    <primitive object={rig.root}>
      <Html position={[0, 1.72, 0]} center zIndexRange={[8, 1]} style={{ pointerEvents: "none" }}>
        <div className="flex flex-col items-center gap-1" style={{ opacity: away ? 0.6 : 1 }}>
          <div ref={bubble} className="text-2xl drop-shadow-[0_2px_6px_rgb(0_0_0/0.5)] transition-all duration-300" style={{ opacity: 0 }} />
          <div
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold shadow-md ${isSelf ? "bg-card text-offwhite ring-1 ring-signal/70" : "bg-space/85 text-offwhite"}`}
          >
            <span className="size-1.5 rounded-full" style={{ background: STATUS_COLOR[info.status] }} />
            {info.name}
          </div>
        </div>
      </Html>
    </primitive>
  );
}

export const _types = THREE;
