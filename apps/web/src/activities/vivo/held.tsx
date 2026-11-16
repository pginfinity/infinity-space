import { useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Citrus, Coffee, Droplets, FileText, Flower2, GlassWater, Leaf, Mic, Popcorn, Trophy, type LucideIcon } from "lucide-react";
import { isHeldItem, type HeldItem } from "@infinity/world";
import type { ActivityClient } from "../registry.ts";
import { useApp } from "../../state/store.ts";
import { sendInfo } from "../../net/session.ts";
import { avatarRig } from "../../avatar/hands.ts";
import { heldScale } from "../../avatar/held.ts";
import { Particles, ballGeometry, flatMaterial } from "./particles.ts";
import { T } from "./strings.ts";
import { InStack } from "../../ui/HudStack.tsx";

/**
 * Item na mão: o chip "Segurando: Café · Soltar (G)" e a tecla G para soltar.
 * O desenho do item na mão do avatar fica em avatar/held.ts (nas duas lentes).
 */

export const ICON: Record<HeldItem, LucideIcon> = {
  coffee: Coffee,
  tea: Leaf,
  water: GlassWater,
  juice: Citrus,
  popcorn: Popcorn,
  paper: FileText,
  microphone: Mic,
  trophy: Trophy,
  flower: Flower2,
  "watering-can": Droplets,
};

/** O que a própria pessoa segura agora. */
export function useMyHeld(): HeldItem | null {
  return useApp((s) => {
    const h = s.selfId ? s.players[s.selfId]?.held : undefined;
    return isHeldItem(h) ? h : null;
  });
}

export function dropHeld(): void {
  // O servidor transforma o que não está na lista em "nada".
  sendInfo({ held: "" });
}

function HeldChip() {
  const held = useMyHeld();

  useEffect(() => {
    if (!held) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (e.code === "KeyG") dropHeld();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [held]);

  const Icon = held ? ICON[held] : null;
  return (
    <InStack side="bottom-left" order={0}>
    <AnimatePresence>
      {held && Icon && (
        <motion.div
          key="held"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="glass pointer-events-auto flex items-center gap-2 rounded-full py-1 pl-1 pr-1 text-sm text-offwhite"
          role="status"
          aria-live="polite"
        >
          <span className="grid size-7 place-items-center rounded-full bg-card text-sky" aria-hidden>
            <Icon className="size-4" />
          </span>
          <span className="pr-1">
            <span className="text-slate">{T.held.holding}:</span> <span className="font-medium">{T.item(held)}</span>
          </span>
          <button
            type="button"
            onClick={dropHeld}
            aria-label={T.held.dropHint}
            title={T.held.dropHint}
            className="flex items-center gap-1.5 rounded-full py-1 pl-2.5 pr-1 text-xs text-offwhite/85 transition-colors hover:bg-offwhite/10 hover:text-offwhite"
          >
            {T.held.drop}
            <kbd className="grid size-5 place-items-center rounded-full bg-offwhite/90 font-display text-[10px] font-bold text-space">G</kbd>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
    </InStack>
  );
}

export const heldClient: ActivityClient = {
  name: "vivo/mao",
  Overlay: HeldChip,
  Scene: HeldSteam,
};

// ---- vapor das bebidas quentes -------------------------------------------------------------

/** Boca da caneca, no referencial da mão (antes da escala do item). */
const CUP_TOP = new THREE.Vector3(-0.012, 0.1, 0.05);
const STEAM = new THREE.Color("#F4F7FA");
const _v = new THREE.Vector3();

/** Fiozinhos de vapor saindo do café e do chá de quem está segurando (nas duas lentes). */
function HeldSteam() {
  const camera = useThree((s) => s.camera);
  const puffs = useMemo(() => new Particles(ballGeometry(), flatMaterial({ opacity: 0.5 }), 90), []);
  const acc = useRef(0);
  useEffect(() => () => puffs.dispose(), [puffs]);
  useFrame((_, dt) => {
    acc.current += dt;
    if (acc.current > 0.32) {
      acc.current = 0;
      const players = useApp.getState().players;
      for (const id in players) {
        const h = players[id]!.held;
        if (h !== "coffee" && h !== "tea") continue;
        const rig = avatarRig(id);
        if (!rig) continue;
        _v.copy(CUP_TOP).multiplyScalar(heldScale(h));
        rig.handR.localToWorld(_v);
        puffs.spawn({ x: _v.x + (Math.random() - 0.5) * 0.03, y: _v.y + 0.02, z: _v.z + (Math.random() - 0.5) * 0.03, vx: (Math.random() - 0.5) * 0.05, vy: 0.22 + Math.random() * 0.1, vz: (Math.random() - 0.5) * 0.05, life: 1.1, size: 0.035, grow: 1.6, drag: 0.8, color: STEAM });
      }
    }
    puffs.update(dt, camera);
  });
  return <primitive object={puffs.mesh} />;
}
