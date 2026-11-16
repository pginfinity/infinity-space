import { useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { AnimatePresence, motion } from "motion/react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { GONG_ID, GONG_KIND, GONG_MSG_MAX, type GongRing, type MapObject, type Vec2 } from "@infinity/world";
import { sendAct, type ActivityClient } from "../registry.ts";
import { registerSynth, sfx } from "../../audio/sfx.ts";
import { world } from "../../world/world.ts";
import { toast } from "../../ui/toasts.ts";
import { focusSoon, useEscape } from "./shared.tsx";
import { T } from "./strings.ts";

/**
 * Gongo do Comercial (implementação de referência de uma atividade):
 * interação abre um campo de mensagem opcional; o servidor confere e avisa todo mundo;
 * cada cliente toca o som, solta confete no gongo e mostra a faixa de comemoração.
 */

interface GongUi {
  open: boolean;
  banner: (GongRing & { key: number }) | null;
}
const useGongUi = create<GongUi>(() => ({ open: false, banner: null }));

/** Disparos de confete pendentes (lidos pela cena). */
let burstAt = 0;

function gongPos(): Vec2 {
  const g = world().map.objects.find((o) => o.type === "gong");
  return g?.pos ?? { x: 0, z: 0 };
}

export const gong: ActivityClient = {
  name: "escritorio/gongo",
  kinds: [GONG_KIND],
  objects: ["gong"],
  label: () => T.gong.action,
  use: (_o: MapObject) => useGongUi.setState({ open: true }),
  onEvent: (e) => {
    if (e.ev === "busy") toast(T.gong.busy((e.data as { ms: number }).ms));
    if (e.ev !== "ring") return;
    const ring = e.data as GongRing;
    sfx("gong", { volume: 0.8 });
    burstAt = performance.now();
    useGongUi.setState({ banner: { ...ring, key: Date.now() } });
  },
  Overlay: GongOverlay,
  Scene: Confetti,
};

function GongOverlay() {
  const open = useGongUi((s) => s.open);
  const banner = useGongUi((s) => s.banner);
  useEffect(() => {
    if (!banner) return;
    const t = window.setTimeout(() => useGongUi.setState((s) => (s.banner?.key === banner.key ? { banner: null } : s)), 6500);
    return () => window.clearTimeout(t);
  }, [banner]);
  return (
    <>
      <AnimatePresence>{open && <RingDialog />}</AnimatePresence>
      <AnimatePresence>
        {banner && (
          <motion.div
            key={banner.key}
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ type: "spring", stiffness: 380, damping: 26 }}
            className="pointer-events-none absolute left-1/2 top-16 z-20 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-orange/40 bg-space/95 py-3 pl-3 pr-5 shadow-2xl"
            role="status"
          >
            <img src="/brand/sparkle.svg" width={34} height={34} alt="" aria-hidden className="shrink-0" />
            <div>
              <p className="font-display text-xs font-bold uppercase tracking-[0.12em] text-orange">{T.gong.bannerTitle(banner.name)}</p>
              {banner.msg && <p className="mt-0.5 max-w-sm text-sm text-offwhite">“{banner.msg}”</p>}
              <p className="mt-0.5 text-[11px] text-slate">{T.gong.bannerCount(banner.count)}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function RingDialog() {
  const [msg, setMsg] = useState("");
  const input = useRef<HTMLInputElement>(null);
  // Foca depois do E que abriu o campo (senão o "e" entra no texto).
  useEffect(() => focusSoon(input.current), []);
  const close = () => useGongUi.setState({ open: false });
  useEscape(close);
  const ring = () => {
    sendAct(GONG_ID, "ring", { msg });
    close();
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="pointer-events-auto absolute bottom-[calc(max(12px,env(safe-area-inset-bottom))+72px)] left-1/2 z-30 w-[min(92vw,380px)] -translate-x-1/2 rounded-2xl border border-offwhite/10 bg-space p-4 shadow-2xl"
      role="dialog"
      aria-label={T.gong.action}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
        if (e.key === "Enter") ring();
        e.stopPropagation();
      }}
    >
      <p className="font-display text-sm font-bold uppercase tracking-[0.1em]">{T.gong.action}</p>
      <p className="mt-1 text-xs text-slate">{T.gong.hint}</p>
      <input
        ref={input}
        value={msg}
        maxLength={GONG_MSG_MAX}
        onChange={(e) => setMsg(e.target.value)}
        placeholder={T.gong.placeholder}
        className="mt-3 w-full rounded-xl border border-offwhite/10 bg-deep px-3 py-2 text-sm text-offwhite placeholder:text-slate/70 focus:border-signal focus:outline-none"
      />
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={close} className="rounded-xl px-3 py-2 text-sm text-slate hover:bg-offwhite/8 hover:text-offwhite">
          {T.cancel}
        </button>
        <button type="button" onClick={ring} className="rounded-xl bg-orange px-4 py-2 text-sm font-semibold text-offwhite hover:brightness-110">
          {T.gong.ring}
        </button>
      </div>
    </motion.div>
  );
}

// ---- confete ------------------------------------------------------------------------------

const N = 180;
const LIFE = 4.2;
const COLORS = ["#EE5C29", "#00B7FF", "#F2F0EF", "#46AFE3", "#ECE6DF"].map((c) => new THREE.Color(c));

function Confetti() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const parts = useMemo(() => Array.from({ length: N }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3() })), []);
  const seen = useRef(0);
  const started = useRef(-1);
  const tmp = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    for (let i = 0; i < N; i++) m.setColorAt(i, COLORS[i % COLORS.length]!);
    m.count = 0;
    // Escondido até o primeiro toque: o shader só compila quando precisa.
    m.visible = false;
  }, []);

  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;
    if (burstAt !== seen.current) {
      seen.current = burstAt;
      started.current = 0;
      const at = gongPos();
      for (const q of parts) {
        q.p.set(at.x + (Math.random() - 0.5) * 0.6, 1.7, at.z + (Math.random() - 0.5) * 0.6);
        const a = Math.random() * Math.PI * 2;
        const s = 1.2 + Math.random() * 2.4;
        q.v.set(Math.cos(a) * s, 3.5 + Math.random() * 3, Math.sin(a) * s);
        q.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
        q.w.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
      }
    }
    if (started.current < 0) return;
    started.current += dt;
    if (started.current > LIFE) {
      started.current = -1;
      m.count = 0;
      m.visible = false;
      return;
    }
    m.visible = true;
    const k = Math.min(dt, 1 / 20);
    for (let i = 0; i < N; i++) {
      const q = parts[i]!;
      q.v.y -= 7 * k;
      q.v.multiplyScalar(1 - 1.6 * k); // arrasto: o confete flutua
      q.p.addScaledVector(q.v, k);
      if (q.p.y < 0.02) {
        q.p.y = 0.02;
        q.v.set(0, 0, 0);
      }
      q.r.x += q.w.x * k;
      q.r.y += q.w.y * k;
      q.r.z += q.w.z * k;
      tmp.position.copy(q.p);
      tmp.rotation.copy(q.r);
      const fade = started.current > LIFE - 0.6 ? (LIFE - started.current) / 0.6 : 1;
      tmp.scale.setScalar(fade);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
    }
    m.count = N;
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, N]} frustumCulled={false}>
      <planeGeometry args={[0.09, 0.05]} />
      <meshBasicMaterial side={THREE.DoubleSide} toneMapped={false} />
    </instancedMesh>
  );
}

// ---- som de reserva -----------------------------------------------------------------------

/** Gongo sintetizado (parciais inarmônicas com decaimento longo) até existir o arquivo gerado. */
registerSynth("gong", (c, out) => {
  const t = c.currentTime;
  const partials = [
    [110, 0.5, 5.5],
    [167, 0.32, 4.2],
    [231, 0.24, 3.4],
    [298, 0.16, 2.6],
    [412, 0.1, 1.8],
    [587, 0.06, 1.2],
  ] as const;
  for (const [f, a, d] of partials) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(f * 1.02, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.4);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(a, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + d + 0.1);
  }
});
