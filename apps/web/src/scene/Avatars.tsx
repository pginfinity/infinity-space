import { Suspense, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "./Html.tsx";
import * as THREE from "three";
import { isHeldItem, pointInPolygon, type AvatarLook, type Emote, type HeldItem, type PlayerInfo, type Vec2 } from "@infinity/world";
import { useApp } from "../state/store.ts";
import { currentEmote, sampleRemote, self, type Pose } from "../world/registry.ts";
import { world } from "../world/world.ts";
import { STATUS_COLOR } from "../world/theme.ts";
import { buildAvatar, useAvatarKit } from "../avatar/build.ts";
import { animate, newAnimState } from "../avatar/animate.ts";
import { HeldSlot } from "../avatar/held.ts";
import { currentHandAction, registerRig } from "../avatar/hands.ts";
import { hoverboard } from "../avatar/board.ts";
import { useMedia } from "../media/rtc.ts";
import { applyGhost, avatarEffect, avatarEffectsVersion } from "../avatar/effects.ts";

/** Todos os avatares da sala, iguais nas duas lentes. */
export function Avatars() {
  const players = useApp((s) => s.players);
  const selfId = useApp((s) => s.selfId);
  // as peças dos avatares chegam num arquivo só (public/avatar/kit.glb); até lá, ninguém aparece
  return (
    <Suspense fallback={null}>
      {Object.values(players).map((p) => (
        <AvatarView key={p.id} info={p} isSelf={p.id === selfId} />
      ))}
    </Suspense>
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
  const kit = useAvatarKit();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rig = useMemo(() => buildAvatar(kit, info.look), [kit, key]);
  useEffect(() => () => rig.dispose(), [rig]);
  // Nó fixo durante a vida do avatar: leva a posição e a etiqueta de nome. Quando o visual muda, só o
  // boneco dentro dele é trocado (trocar o objeto da etiqueta desmontava o Html no meio da renderização).
  const holder = useMemo(() => {
    const g = new THREE.Group();
    g.name = `avatar:${info.id}`;
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    holder.add(rig.root);
    return () => void holder.remove(rig.root);
  }, [holder, rig]);
  const st = useMemo(newAnimState, []);
  const scratch = useMemo<Pose>(() => ({ x: 0, z: 0, yaw: 0, anim: "idle" }), []);
  const last = useRef<{ x: number; z: number } | null>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const lastEmote = useRef<Emote | null>(null);
  const y = useRef(0);
  // Item na mão: o que a pessoa segura (do servidor) ou o do gesto em andamento (regador ao regar).
  const slot = useMemo(() => new HeldSlot(rig.handR), [rig]);
  const held = useRef<HeldItem | null>(null);
  held.current = isHeldItem(info.held) ? info.held : null;
  const faceYaw = useRef<number | null>(null);
  const tag = useRef<HTMLDivElement>(null);
  const fx = useRef({ version: -1, ghost: false, rig: null as unknown });
  useEffect(() => registerRig(info.id, rig), [info.id, rig]);
  // Prancha flutuante sob os pés quando corre.
  const board = useMemo(hoverboard, []);
  useEffect(() => {
    rig.root.add(board);
    return () => void rig.root.remove(board);
  }, [rig, board]);

  useFrame((_, dt) => {
    const now = performance.now();
    const p = isSelf ? self : sampleRemote(info.id, now, scratch);
    if (!p) return;
    const prev = last.current;
    const speed = prev && dt > 0 ? Math.hypot(p.x - prev.x, p.z - prev.z) / dt : 0;
    last.current = { x: p.x, z: p.z };
    const seatH = p.anim === "sit" ? seatHeightAt(p.x, p.z) : 0;
    y.current += (floorY(p.x, p.z) - y.current) * Math.min(1, dt * 12);
    // correndo de verdade (não só o último pacote dizendo "run"): sobe na prancha
    const surfing = p.anim === "run" && speed > 1.5;
    st.board += ((surfing ? 1 : 0) - st.board) * Math.min(1, dt * (surfing ? 7 : 5));
    const lift = 0.12 * st.board;
    holder.position.set(p.x, y.current + lift, p.z);
    board.visible = st.board > 0.03;
    if (board.visible) {
      const bob = Math.sin(now / 160) * 0.008;
      board.position.y = -lift + 0.02 + bob;
      board.scale.setScalar(0.55 + 0.45 * st.board);
      board.rotation.x = -0.05 * st.board;
      board.children[board.children.length - 1]!.position.y = -0.015 - bob;
    }
    // Efeitos das atividades (fantasma do Impostor): checa só quando algum efeito muda ou o boneco é refeito.
    const v = avatarEffectsVersion();
    if (v !== fx.current.version || fx.current.rig !== rig) {
      const ghost = !!avatarEffect(info.id)?.ghost;
      if (ghost !== fx.current.ghost || fx.current.rig !== rig) {
        applyGhost(rig.root, ghost);
        if (tag.current) tag.current.style.opacity = ghost ? "0.45" : "";
      }
      fx.current = { version: v, ghost, rig };
    }
    const act = currentHandAction(info.id, now);
    st.handAct = act;
    const shown = fx.current.ghost ? null : (act?.item ?? held.current);
    st.hold = shown;
    slot.show(shown);
    // Durante um gesto com alvo (regar a planta), o corpo vira para o alvo e depois volta.
    const goalYaw = act && act.face !== null && p.anim !== "sit" ? act.face : p.yaw;
    if (act && act.face !== null) faceYaw.current = faceYaw.current ?? p.yaw;
    if (faceYaw.current !== null) {
      const d = Math.atan2(Math.sin(goalYaw - faceYaw.current), Math.cos(goalYaw - faceYaw.current));
      faceYaw.current += d * Math.min(1, dt * 10);
      if (!act && Math.abs(d) < 0.02) faceYaw.current = null;
    }
    rig.root.rotation.y = Math.PI - (faceYaw.current ?? p.yaw);
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
  const speaking = useMedia((s) => !!s.speaking[info.id]);
  const video = useMedia((s) => s.videos[info.id]);
  return (
    <primitive object={holder}>
      <Html position={[0, 1.72, 0]} center zIndexRange={[8, 1]} style={{ pointerEvents: "none" }}>
        <div ref={tag} className="flex flex-col items-center gap-1" style={{ opacity: away ? 0.6 : 1 }}>
          <div ref={bubble} className="text-2xl drop-shadow-[0_2px_6px_rgb(0_0_0/0.5)] transition-all duration-300" style={{ opacity: 0 }} />
          {video && <VideoBubble el={video} speaking={speaking} mirror={isSelf} />}
          <div
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold shadow-md transition-shadow ${isSelf ? "bg-card text-offwhite ring-1 ring-signal/70" : "bg-space/85 text-offwhite"}`}
            style={speaking ? { boxShadow: "0 0 0 2px #2BC48A, 0 0 14px 2px rgb(43 196 138 / 0.55)" } : undefined}
          >
            <span className="size-1.5 rounded-full" style={{ background: STATUS_COLOR[info.status] }} />
            {info.name}
            {info.mic && <span className="text-[9px] text-ok">●</span>}
          </div>
        </div>
      </Html>
    </primitive>
  );
}

/** Câmera da pessoa numa bolha redonda acima da cabeça. */
function VideoBubble({ el, speaking, mirror }: { el: HTMLVideoElement; speaking: boolean; mirror: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = box.current;
    if (!host) return;
    el.className = "h-full w-full object-cover";
    el.style.transform = mirror ? "scaleX(-1)" : "";
    host.appendChild(el);
    void el.play().catch(() => undefined);
    return () => {
      if (el.parentElement === host) host.removeChild(el);
    };
  }, [el, mirror]);
  return (
    <div
      ref={box}
      className="size-[76px] overflow-hidden rounded-full bg-space shadow-lg ring-2 transition-[box-shadow]"
      style={{ boxShadow: speaking ? "0 0 0 3px #2BC48A, 0 0 18px 3px rgb(43 196 138 / 0.5)" : "0 0 0 2px rgb(242 240 239 / 0.6)" }}
    />
  );
}

