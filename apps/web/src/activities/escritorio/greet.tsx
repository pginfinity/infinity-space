import { useEffect, useMemo, useRef } from "react";
import { create } from "zustand";
import { AnimatePresence, motion } from "motion/react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  GREET_ID,
  GREET_KIND,
  GREET_KINDS,
  GREET_RANGE,
  angleDelta,
  wallBetween,
  yawOf,
  type GreetEnd,
  type GreetGo,
  type GreetInvite,
  type GreetKind,
  type GreetPending,
} from "@infinity/world";
import { sendAct, type ActivityClient, type DynamicTarget } from "../registry.ts";
import { registerSynth, sfx } from "../../audio/sfx.ts";
import { useApp } from "../../state/store.ts";
import { toast } from "../../ui/toasts.ts";
import { remoteIds, sampleRemote, self, type Pose } from "../../world/registry.ts";
import { world } from "../../world/world.ts";
import { seatedAt } from "../../engine/movement.ts";
import { toon } from "../../scene/materials.ts";
import { Kbd, deferScene, focusSoon, groundY, nameOf, plainKey, poseOf, useEscape } from "./shared.tsx";
import { noise, tone } from "./synth.ts";
import { T } from "./strings.ts";

/**
 * Toca aqui, brinde e abraço. Perto de alguém (até 1,6 m), E abre a escolha do gesto; a outra
 * pessoa recebe o convite e topa com T (ou o botão). Aí as duas se viram uma para a outra, fazem
 * o emote do gesto (pelo servidor) e todo mundo vê o efeito entre elas.
 */

interface GreetUi {
  chooser: { id: string } | null;
  invite: (GreetInvite & { start: number }) | null;
  pending: (GreetPending & { start: number }) | null;
}
const useGreetUi = create<GreetUi>(() => ({ chooser: null, invite: null, pending: null }));

/** Gestos em andamento (lidos pela cena). */
interface Effect {
  a: string;
  b: string;
  kind: GreetKind;
  start: number;
}
const effects: Effect[] = [];
/** Virar para a outra pessoa (só o próprio avatar). */
const turn = { other: "", until: 0 };

const scratch: Pose = { x: 0, z: 0, yaw: 0, anim: "idle" };

export const greet: ActivityClient = {
  name: "escritorio/toca",
  kinds: [GREET_KIND],
  targets: () => {
    if (seatedAt()) return [];
    const now = performance.now();
    const walls = world().map.walls;
    const out: DynamicTarget[] = [];
    for (const id of remoteIds()) {
      const p = sampleRemote(id, now, scratch);
      if (!p) continue;
      const d = Math.hypot(p.x - self.x, p.z - self.z);
      const r = p.anim === "sit" ? 1.2 : GREET_RANGE;
      if (d > r || wallBetween(walls, self, p)) continue;
      out.push({ key: `greet:${id}`, point: { x: p.x, z: p.z }, radius: r, label: T.greet.target(nameOf(id)), run: () => useGreetUi.setState({ chooser: { id } }) });
    }
    return out;
  },
  onEvent: (e) => {
    const now = performance.now();
    const me = useApp.getState().selfId;
    switch (e.ev) {
      case "invite":
        useGreetUi.setState({ invite: { ...(e.data as GreetInvite), start: now } });
        sfx("greet-invite", { volume: 0.5 });
        break;
      case "pending":
        useGreetUi.setState({ pending: { ...(e.data as GreetPending), start: now } });
        break;
      case "go": {
        const d = e.data as GreetGo;
        effects.push({ a: d.a, b: d.b, kind: d.kind, start: now });
        if (effects.length > 6) effects.shift();
        const pa = poseOf(d.a, { ...scratch });
        const pb = poseOf(d.b, { ...scratch });
        if (pa && pb) window.setTimeout(() => sfx(`greet-${d.kind}`, { at: { x: (pa.x + pb.x) / 2, z: (pa.z + pb.z) / 2 }, range: 14, volume: 0.7 }), 320);
        if (me === d.a || me === d.b) {
          turn.other = me === d.a ? d.b : d.a;
          turn.until = now + 600;
          useGreetUi.setState({ invite: null, pending: null });
        }
        break;
      }
      case "declined":
      case "expired":
      case "cancel": {
        const d = e.data as GreetEnd;
        const ui = useGreetUi.getState();
        if (ui.invite && ui.invite.from === d.from) useGreetUi.setState({ invite: null });
        if (ui.pending && d.from === me) {
          useGreetUi.setState({ pending: null });
          if (e.ev === "declined") toast(T.greet.declined(ui.pending.name));
          if (e.ev === "expired") toast(T.greet.expired);
        }
        break;
      }
    }
  },
  Overlay: GreetOverlay,
  Scene: deferScene(GreetEffects, 2000),
};

// ---- interface ------------------------------------------------------------------------------

function GreetOverlay() {
  const chooser = useGreetUi((s) => s.chooser);
  const invite = useGreetUi((s) => s.invite);
  const pending = useGreetUi((s) => s.pending);
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[calc(max(12px,env(safe-area-inset-bottom))+118px)] flex flex-col items-center gap-2 px-3">
      <AnimatePresence>
        {invite && <InviteCard key={`i-${invite.from}-${invite.start}`} invite={invite} />}
        {pending && <PendingChip key={`p-${pending.to}-${pending.start}`} pending={pending} />}
        {chooser && <Chooser key={`c-${chooser.id}`} id={chooser.id} />}
      </AnimatePresence>
    </div>
  );
}

/** Barrinha do tempo que falta para o convite expirar. */
function Countdown({ start, ms }: { start: number; ms: number }) {
  return (
    <span className="absolute inset-x-3 bottom-1 h-0.5 overflow-hidden rounded-full bg-offwhite/10" aria-hidden>
      <motion.span
        className="block h-full bg-signal"
        initial={{ scaleX: Math.max(0, 1 - (performance.now() - start) / ms) }}
        animate={{ scaleX: 0 }}
        transition={{ duration: Math.max(0, (ms - (performance.now() - start)) / 1000), ease: "linear" }}
        style={{ transformOrigin: "left" }}
      />
    </span>
  );
}

function Chooser({ id }: { id: string }) {
  const root = useRef<HTMLDivElement>(null);
  const close = () => useGreetUi.setState({ chooser: null });
  useEscape(close);
  useEffect(() => focusSoon(root.current?.querySelector("button")), []);
  // A pessoa se afastou: fecha.
  useEffect(() => {
    const t = window.setInterval(() => {
      const p = poseOf(id, { ...scratch });
      if (!p || Math.hypot(p.x - self.x, p.z - self.z) > GREET_RANGE + 0.9) close();
    }, 300);
    return () => window.clearInterval(t);
  }, [id]);
  const pick = (kind: GreetKind) => {
    sendAct(GREET_ID, "invite", { to: id, kind });
    close();
  };
  return (
    <motion.div
      ref={root}
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      className="glass pointer-events-auto rounded-2xl p-1.5"
      role="dialog"
      aria-label={T.greet.choose(nameOf(id))}
      onKeyDown={(e) => {
        const n = /^Digit([1-3])$/.exec(e.code);
        if (e.key === "Escape") close();
        else if (n) pick(GREET_KINDS[Number(n[1]) - 1]!);
        else if (e.code === "KeyE" || e.code === "KeyF") (document.activeElement as HTMLButtonElement | null)?.click?.();
        e.stopPropagation();
      }}
    >
      <p className="px-2 pb-1 pt-0.5 text-[11px] text-slate">{T.greet.choose(nameOf(id))}</p>
      <div className="flex gap-1">
        {GREET_KINDS.map((k, i) => (
          <button
            key={k}
            type="button"
            onClick={() => pick(k)}
            className="group flex w-[92px] flex-col items-center gap-1 rounded-xl px-2 py-2 text-xs text-offwhite/90 transition-colors hover:bg-offwhite/10 focus-visible:bg-offwhite/10"
          >
            <span className="text-2xl leading-none transition-transform group-hover:scale-110">{T.greet.emoji[k]}</span>
            <span className="flex items-center gap-1">
              {T.greet.kinds[k]}
              <Kbd>{i + 1}</Kbd>
            </span>
          </button>
        ))}
      </div>
    </motion.div>
  );
}

function InviteCard({ invite }: { invite: GreetInvite & { start: number } }) {
  const accept = () => {
    sendAct(GREET_ID, "accept", { from: invite.from });
    useGreetUi.setState({ invite: null });
  };
  const decline = () => {
    sendAct(GREET_ID, "decline", { from: invite.from });
    useGreetUi.setState({ invite: null });
  };
  useEscape(decline);
  // T topa (fora de campos de texto). Fica fora de WASD/E/F/Q/R/M/V/L/1-8.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyT" && plainKey(e)) accept();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invite.from]);
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ type: "spring", stiffness: 420, damping: 28 }}
      className="glass pointer-events-auto relative flex items-center gap-3 rounded-2xl py-2.5 pl-3 pr-2.5"
      role="alertdialog"
      aria-label={T.greet.invite[invite.kind]!(invite.name)}
    >
      <span className="text-2xl leading-none">{T.greet.emoji[invite.kind]}</span>
      <p className="text-sm text-offwhite">{T.greet.invite[invite.kind]!(invite.name)}</p>
      <button type="button" onClick={accept} className="flex items-center gap-1.5 rounded-xl bg-orange py-1.5 pl-1.5 pr-3 text-sm font-semibold text-offwhite hover:brightness-110">
        <Kbd light>T</Kbd>
        {T.greet.accept}
      </button>
      <button type="button" onClick={decline} className="rounded-xl px-2.5 py-1.5 text-xs text-slate hover:bg-offwhite/8 hover:text-offwhite">
        {T.greet.decline}
      </button>
      <Countdown start={invite.start} ms={invite.ms} />
    </motion.div>
  );
}

function PendingChip({ pending }: { pending: GreetPending & { start: number } }) {
  const cancel = () => {
    sendAct(GREET_ID, "cancel");
    useGreetUi.setState({ pending: null });
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      className="glass pointer-events-auto relative flex items-center gap-2.5 rounded-full py-1.5 pl-3 pr-1.5 text-xs text-offwhite/90"
      role="status"
    >
      <span className="text-base leading-none">{T.greet.emoji[pending.kind]}</span>
      {T.greet.pending(T.greet.kinds[pending.kind]!, pending.name)}
      <button type="button" onClick={cancel} className="rounded-full px-2.5 py-1 text-slate hover:bg-offwhite/8 hover:text-offwhite">
        {T.cancel}
      </button>
      <Countdown start={pending.start} ms={pending.ms} />
    </motion.div>
  );
}

// ---- efeitos no mundo ---------------------------------------------------------------------

const STARS = 16;
const HEARTS = 7;
const BUBBLES = 10;
const FX_MS: Record<GreetKind, number> = { highfive: 1400, toast: 2000, hug: 2400 };
const DIRS = Array.from({ length: STARS }, (_, i) => {
  // Direções espalhadas numa esfera (espiral de ouro), puxadas para cima.
  const y = 1 - (i / (STARS - 1)) * 1.4;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const a = i * 2.39996;
  return new THREE.Vector3(Math.cos(a) * r, y * 0.8 + 0.25, Math.sin(a) * r);
});
const STAR_COLORS = ["#F2B134", "#F2F0EF", "#00B7FF", "#FFD98A"].map((c) => new THREE.Color(c));

function heartGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, -0.5);
  s.bezierCurveTo(-0.15, -0.35, -0.55, -0.12, -0.55, 0.18);
  s.bezierCurveTo(-0.55, 0.45, -0.25, 0.6, 0, 0.35);
  s.bezierCurveTo(0.25, 0.6, 0.55, 0.45, 0.55, 0.18);
  s.bezierCurveTo(0.55, -0.12, 0.15, -0.35, 0, -0.5);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2, curveSegments: 10 });
  g.center();
  return g;
}

function gobletGeometry(): THREE.BufferGeometry {
  const pts = [
    [0, 0],
    [0.11, 0],
    [0.11, 0.015],
    [0.018, 0.03],
    [0.018, 0.16],
    [0.09, 0.2],
    [0.12, 0.34],
    [0.11, 0.36],
    [0.0, 0.2],
  ].map(([r, h]) => new THREE.Vector2(r!, h!));
  return new THREE.LatheGeometry(pts, 14);
}

function GreetEffects() {
  const stars = useRef<THREE.InstancedMesh>(null);
  const hearts = useRef<THREE.InstancedMesh>(null);
  const bubbles = useRef<THREE.InstancedMesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const goblets = useRef<THREE.Group>(null);
  const geo = useMemo(() => ({ heart: heartGeometry(), goblet: gobletGeometry() }), []);
  const mats = useMemo(
    () => ({
      glass: toon("#F3E2A9"),
      heart: toon("#E85D9A"),
    }),
    [],
  );
  const tmp = useMemo(() => ({ o: new THREE.Object3D(), a: { ...scratch }, b: { ...scratch }, mid: new THREE.Vector3(), side: new THREE.Vector3(), axis: new THREE.Vector3() }), []);

  useEffect(() => {
    for (let i = 0; i < STARS * 2; i++) stars.current?.setColorAt(i, STAR_COLORS[i % STAR_COLORS.length]!);
    return () => {
      geo.heart.dispose();
      geo.goblet.dispose();
    };
  }, [geo]);

  useFrame((_, dt) => {
    const now = performance.now();
    // Virar para a outra pessoa (só o próprio avatar, sem estar sentado).
    if (turn.other && now < turn.until && !seatedAt()) {
      const o = poseOf(turn.other, tmp.b);
      if (o) {
        const want = yawOf({ x: o.x - self.x, z: o.z - self.z });
        self.yaw += angleDelta(self.yaw, want) * Math.min(1, dt * 14);
      }
    } else turn.other = "";

    for (let i = effects.length - 1; i >= 0; i--) if (now - effects[i]!.start > FX_MS[effects[i]!.kind] + 400) effects.splice(i, 1);
    let ns = 0;
    let nh = 0;
    let nb = 0;
    let ringOn = false;
    let gob = 0;
    const o = tmp.o;
    for (const fx of effects) {
      const pa = poseOf(fx.a, tmp.a);
      const pb = poseOf(fx.b, tmp.b);
      if (!pa || !pb) continue;
      const y0 = groundY((pa.x + pb.x) / 2, (pa.z + pb.z) / 2);
      tmp.mid.set((pa.x + pb.x) / 2, y0, (pa.z + pb.z) / 2);
      const t = (now - fx.start - 320) / FX_MS[fx.kind];
      if (t < 0 || t > 1) continue;
      if (fx.kind === "highfive") {
        // Estouro de estrelinhas onde as mãos se encontram + um anel de impacto.
        const e = 1 - Math.pow(1 - t, 3);
        for (let k = 0; k < STARS && ns < STARS * 2; k++) {
          const d = DIRS[k]!;
          o.position.set(tmp.mid.x + d.x * e * 0.75, y0 + 1.42 + d.y * e * 0.75 - t * t * 0.3, tmp.mid.z + d.z * e * 0.75);
          o.rotation.set(t * 6 + k, t * 4, 0);
          o.scale.setScalar(0.09 * (1 - t * 0.8) + 0.012);
          o.updateMatrix();
          stars.current!.setMatrixAt(ns++, o.matrix);
        }
        if (ring.current && !ringOn) {
          ringOn = true;
          ring.current.position.set(tmp.mid.x, y0 + 1.42, tmp.mid.z);
          ring.current.lookAt(pa.x, y0 + 1.42, pa.z);
          ring.current.scale.setScalar(0.1 + e * 0.55);
          (ring.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 - t * 1.3);
        }
      } else if (fx.kind === "hug") {
        // Coraçõezinhos subindo entre os dois.
        for (let k = 0; k < HEARTS && nh < HEARTS * 2; k++) {
          const tk = Math.min(1, Math.max(0, t * 1.25 - k * 0.06));
          if (tk <= 0) continue;
          const pop = tk < 0.15 ? tk / 0.15 : tk > 0.8 ? (1 - tk) / 0.2 : 1;
          o.position.set(tmp.mid.x + Math.sin(k * 2.1 + tk * 5) * 0.28, y0 + 1.25 + tk * 1.1 + k * 0.03, tmp.mid.z + Math.cos(k * 1.7 + tk * 4) * 0.28);
          o.rotation.set(0, Math.sin(tk * 6 + k) * 0.6, Math.sin(tk * 8 + k) * 0.25);
          o.scale.setScalar(0.11 * pop * (0.8 + (k % 3) * 0.15));
          o.updateMatrix();
          hearts.current!.setMatrixAt(nh++, o.matrix);
        }
      } else if (fx.kind === "toast") {
        // Duas taças saem de cada um, se encontram no meio (tim-tim) e soltam bolhas.
        tmp.side.set(pb.x - pa.x, 0, pb.z - pa.z).normalize();
        const meet = Math.min(1, t / 0.35);
        const em = 1 - Math.pow(1 - meet, 2);
        const tilt = t > 0.35 && t < 0.55 ? Math.sin(((t - 0.35) / 0.2) * Math.PI) * 0.35 : 0;
        const fade = t > 0.85 ? (1 - t) / 0.15 : 1;
        for (const s of [-1, 1]) {
          const g = goblets.current?.children[gob++] as THREE.Mesh | undefined;
          if (!g) continue;
          const dist = 0.1 + (1 - em) * 0.4;
          g.visible = true;
          g.position.set(tmp.mid.x + tmp.side.x * s * dist, y0 + 1.22 + em * 0.2, tmp.mid.z + tmp.side.z * s * dist);
          g.rotation.set(0, 0, 0);
          g.rotateOnWorldAxis(tmp.axis.set(-tmp.side.z, 0, tmp.side.x), s * (0.25 + tilt));
          g.scale.setScalar(1.6 * fade);
        }
        if (t > 0.38) {
          for (let k = 0; k < BUBBLES && nb < BUBBLES * 2; k++) {
            const tk = ((t - 0.38) / 0.62 + k * 0.09) % 1;
            o.position.set(tmp.mid.x + Math.sin(k * 3.3) * 0.12, y0 + 1.55 + tk * 0.7, tmp.mid.z + Math.cos(k * 2.7) * 0.12);
            o.scale.setScalar(0.025 * (1 - tk) * fade);
            o.updateMatrix();
            bubbles.current!.setMatrixAt(nb++, o.matrix);
          }
        }
      }
    }
    for (const [m, n] of [
      [stars.current, ns],
      [hearts.current, nh],
      [bubbles.current, nb],
    ] as const) {
      if (!m || (n === 0 && m.count === 0)) continue;
      m.visible = n > 0;
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
    }
    if (ring.current) ring.current.visible = ringOn;
    const gs = goblets.current?.children ?? [];
    for (let k = gob; k < gs.length; k++) gs[k]!.visible = false;
  });

  return (
    <>
      <instancedMesh ref={stars} args={[undefined, undefined, STARS * 2]} frustumCulled={false} visible={false}>
        <octahedronGeometry args={[1, 0]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={hearts} args={[geo.heart, mats.heart, HEARTS * 2]} frustumCulled={false} visible={false} />
      <instancedMesh ref={bubbles} args={[undefined, undefined, BUBBLES * 2]} frustumCulled={false} visible={false}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshBasicMaterial color="#FFE7A3" toneMapped={false} />
      </instancedMesh>
      <mesh ref={ring} visible={false} frustumCulled={false}>
        <torusGeometry args={[1, 0.06, 6, 28]} />
        <meshBasicMaterial color="#FFF3D1" transparent depthWrite={false} toneMapped={false} />
      </mesh>
      <group ref={goblets}>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} geometry={geo.goblet} material={mats.glass} visible={false} frustumCulled={false} />
        ))}
      </group>
    </>
  );
}

// ---- sons de reserva ----------------------------------------------------------------------

/** Convite chegando: dois tons curtos e amigáveis. */
registerSynth("greet-invite", (c, out) => {
  tone(c, out, { freq: 660, dur: 0.14, gain: 0.18 });
  tone(c, out, { freq: 990, dur: 0.2, gain: 0.16, delay: 0.1 });
});
/** Toca aqui: palma estalada com um brilho. */
registerSynth("greet-highfive", (c, out) => {
  noise(c, out, { dur: 0.09, from: 2200, to: 1200, q: 0.9, gain: 0.55, attack: 0.002 });
  tone(c, out, { freq: 1568, dur: 0.35, gain: 0.08, delay: 0.03 });
  tone(c, out, { freq: 2093, dur: 0.4, gain: 0.06, delay: 0.07 });
});
/** Brinde: tim-tim de taças. */
registerSynth("greet-toast", (c, out) => {
  for (const [f, g] of [
    [2637, 0.16],
    [3951, 0.09],
    [5274, 0.05],
  ] as const) {
    tone(c, out, { freq: f, dur: 0.9, gain: g, attack: 0.002 });
    tone(c, out, { freq: f * 1.003, dur: 0.7, gain: g * 0.7, attack: 0.002, delay: 0.09 });
  }
});
/** Abraço: acorde quentinho. */
registerSynth("greet-hug", (c, out) => {
  for (const [f, d] of [
    [392, 0],
    [494, 0.06],
    [587, 0.12],
  ] as const) tone(c, out, { freq: f, dur: 0.9, gain: 0.09, attack: 0.05, delay: d });
});
