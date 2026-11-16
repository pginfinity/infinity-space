import { useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { AnimatePresence, motion } from "motion/react";
import { Send, X } from "lucide-react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  PLANE_ID,
  PLANE_KIND,
  PLANE_MSG_MAX,
  dirOfYaw,
  planeArc,
  type PlaneBusy,
  type PlaneFly,
  type PlaneLetter,
  type PlaneSent,
  type EscVec3,
} from "@infinity/world";
import { sendAct, type ActivityClient } from "../registry.ts";
import { registerSynth, sfx } from "../../audio/sfx.ts";
import { useApp } from "../../state/store.ts";
import { toast } from "../../ui/toasts.ts";
import { AvatarFace } from "../../ui/AvatarFace.tsx";
import { InStack } from "../../ui/HudStack.tsx";
import { placeName } from "../../world/zoneLabel.ts";
import { toon } from "../../scene/materials.ts";
import { deferScene, focusSoon, groundY, poseOf, useEscape } from "./shared.tsx";
import { noise } from "./synth.ts";
import { T } from "./strings.ts";

/**
 * Aviãozinho de papel: escolha alguém online, escreva até 140 caracteres e lance. O avião sai da
 * sua mão e voa em arco até a pessoa (seguindo-a se ela andar); todos veem o voo, só ela lê o recado.
 */

interface Letter extends PlaneLetter {
  key: number;
  /** Id de quem mandou (para responder). */
  fromId: string | undefined;
}

interface PlaneUi {
  composer: { to: string | null } | null;
  letters: Letter[];
  openComposer(to: string | null): void;
  closeComposer(): void;
}

export const usePlaneUi = create<PlaneUi>((set) => ({
  composer: null,
  letters: [],
  openComposer: (to) => set({ composer: { to } }),
  closeComposer: () => set({ composer: null }),
}));

/** Voos em andamento (lidos pela cena, fora do React). */
interface Flight {
  id: number;
  to: string;
  start: number;
  ms: number;
  a: EscVec3;
  b: EscVec3;
}
const flights: Flight[] = [];

function handOf(id: string): EscVec3 | null {
  const p = poseOf(id);
  if (!p) return null;
  const f = dirOfYaw(p.yaw);
  // Mão direita, um pouco à frente do corpo.
  return { x: p.x + f.x * 0.25 - f.z * 0.22, y: groundY(p.x, p.z) + 1.15, z: p.z + f.z * 0.25 + f.x * 0.22 };
}

export const plane: ActivityClient = {
  name: "escritorio/aviao",
  kinds: [PLANE_KIND],
  onEvent: (e) => {
    if (e.ev === "fly") {
      const d = e.data as PlaneFly;
      const a = handOf(d.from);
      if (!a) return;
      flights.push({ id: d.id, to: d.to, start: performance.now(), ms: d.ms, a, b: { ...a } });
      if (flights.length > POOL) flights.shift();
      sfx("plane-throw", { at: { x: a.x, z: a.z }, range: 12, volume: 0.6 });
    } else if (e.ev === "letter") {
      const d = e.data as PlaneLetter;
      window.setTimeout(() => {
        usePlaneUi.setState((s) => ({ letters: [...s.letters.slice(-2), { ...d, key: Date.now() + d.id, fromId: e.from }] }));
        sfx("plane-land", { volume: 0.7 });
      }, d.ms);
    } else if (e.ev === "sent") {
      toast(T.plane.sent((e.data as PlaneSent).toName));
    } else if (e.ev === "busy") {
      toast(T.plane.busy((e.data as PlaneBusy).ms));
    }
  },
  Overlay: PlaneOverlay,
  Scene: deferScene(PlaneFlights, 1800),
};

// ---- interface ------------------------------------------------------------------------------

function PlaneOverlay() {
  const composer = usePlaneUi((s) => s.composer);
  const letters = usePlaneUi((s) => s.letters);
  return (
    <>
      <AnimatePresence>{composer && <Composer initialTo={composer.to} />}</AnimatePresence>
      <InStack side="top-left" order={4}>
      <div className="pointer-events-none flex w-[min(300px,calc(100vw-24px))] flex-col gap-2" role="status" aria-live="polite">
        <AnimatePresence initial={false}>
          {letters.map((l) => (
            <LetterCard key={l.key} letter={l} />
          ))}
        </AnimatePresence>
      </div>
      </InStack>
    </>
  );
}

function LetterCard({ letter }: { letter: Letter }) {
  const close = () => usePlaneUi.setState((s) => ({ letters: s.letters.filter((x) => x.key !== letter.key) }));
  const reply = () => {
    const online = letter.fromId && useApp.getState().players[letter.fromId] ? letter.fromId : null;
    close();
    usePlaneUi.getState().openComposer(online);
  };
  return (
    <motion.article
      layout
      initial={{ opacity: 0, x: -24, rotate: -3 }}
      animate={{ opacity: 1, x: 0, rotate: 0 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ type: "spring", stiffness: 320, damping: 26 }}
      className="pointer-events-auto relative rounded-2xl bg-cream p-3.5 pr-9 text-space shadow-[0_14px_40px_-12px_rgb(0_0_0/0.7)]"
      aria-label={T.plane.from(letter.fromName)}
    >
      {/* dobra do papel */}
      <span className="absolute right-0 top-0 size-5 rounded-bl-lg rounded-tr-2xl bg-[linear-gradient(225deg,var(--color-deep)_50%,#d8d0c6_50%)] opacity-90" aria-hidden />
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-space/60">
        <Send className="size-3" aria-hidden />
        {T.plane.from(letter.fromName)}
      </p>
      <p className="mt-1.5 whitespace-pre-line break-words text-sm leading-snug">{letter.msg}</p>
      <div className="mt-2.5 flex gap-1.5">
        <button type="button" onClick={reply} className="rounded-lg bg-space px-2.5 py-1 text-xs font-semibold text-offwhite hover:bg-card">
          {T.plane.reply}
        </button>
      </div>
      <button type="button" onClick={close} aria-label={T.close} className="absolute right-2 top-6 rounded-md p-1 text-space/50 hover:bg-space/10 hover:text-space">
        <X className="size-3.5" />
      </button>
    </motion.article>
  );
}

function Composer({ initialTo }: { initialTo: string | null }) {
  const players = useApp((s) => s.players);
  const selfId = useApp((s) => s.selfId);
  const people = useMemo(() => Object.values(players).filter((p) => p.id !== selfId).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")), [players, selfId]);
  const [to, setTo] = useState<string | null>(initialTo ?? (people.length === 1 ? people[0]!.id : null));
  const [msg, setMsg] = useState("");
  const text = useRef<HTMLTextAreaElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const close = () => usePlaneUi.getState().closeComposer();

  useEffect(
    () => focusSoon(to ? text.current : (list.current?.querySelector("button") as HTMLButtonElement | null)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useEscape(close);
  // A pessoa escolhida saiu: desmarca.
  useEffect(() => {
    if (to && !players[to]) setTo(null);
  }, [players, to]);

  const send = () => {
    if (!to) {
      toast(T.plane.pickFirst);
      return;
    }
    if (!msg.trim()) return;
    sendAct(PLANE_ID, "throw", { to, msg });
    close();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="pointer-events-auto absolute bottom-[calc(max(12px,env(safe-area-inset-bottom))+72px)] left-1/2 z-30 flex max-h-[min(560px,calc(100vh-180px))] w-[min(92vw,400px)] -translate-x-1/2 flex-col rounded-2xl border border-offwhite/10 bg-space p-4 shadow-2xl"
      role="dialog"
      aria-label={T.plane.title}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send();
        e.stopPropagation();
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-sm font-bold uppercase tracking-[0.1em]">{T.plane.title}</p>
          <p className="mt-1 text-xs text-slate">{T.plane.hint}</p>
        </div>
        <button type="button" onClick={close} aria-label={T.close} className="rounded-lg p-1.5 text-slate hover:bg-offwhite/8 hover:text-offwhite">
          <X className="size-4" />
        </button>
      </div>
      <p className="label-caps mt-3">{T.plane.to}</p>
      <div ref={list} className="mt-1 min-h-[52px] overflow-y-auto rounded-xl border border-offwhite/8 bg-deep/60 p-1" role="radiogroup" aria-label={T.plane.to}>
        {people.length === 0 && <p className="px-2 py-3 text-xs text-slate">{T.plane.nobody}</p>}
        {people.map((p) => {
          const pos = poseOf(p.id);
          const on = to === p.id;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                setTo(p.id);
                text.current?.focus();
              }}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors ${on ? "bg-signal/15 ring-1 ring-signal/60" : "hover:bg-offwhite/6"}`}
            >
              <AvatarFace look={p.look} size={28} className="shrink-0 rounded-full" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{p.name}</span>
                <span className="block truncate text-[11px] text-slate">{pos ? placeName(pos) : "—"}</span>
              </span>
            </button>
          );
        })}
      </div>
      <textarea
        ref={text}
        value={msg}
        maxLength={PLANE_MSG_MAX}
        rows={3}
        onChange={(e) => setMsg(e.target.value)}
        placeholder={T.plane.placeholder}
        aria-label={T.plane.title}
        className="mt-3 w-full resize-none rounded-xl border border-offwhite/10 bg-deep px-3 py-2 text-sm text-offwhite placeholder:text-slate/70 focus:border-signal focus:outline-none"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[11px] tabular-nums text-slate">
          {msg.length}/{PLANE_MSG_MAX}
        </span>
        <div className="flex gap-2">
          <button type="button" onClick={close} className="rounded-xl px-3 py-2 text-sm text-slate hover:bg-offwhite/8 hover:text-offwhite">
            {T.cancel}
          </button>
          <button
            type="button"
            onClick={send}
            disabled={!to || !msg.trim()}
            className="flex items-center gap-1.5 rounded-xl bg-orange px-4 py-2 text-sm font-semibold text-offwhite hover:brightness-110 disabled:opacity-40"
          >
            <Send className="size-4" aria-hidden />
            {T.plane.send}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ---- voo no mundo -------------------------------------------------------------------------

const POOL = 6;
const TRAIL = 72;

/** Avião de papel dobrado (dardo clássico), bico para +Z. */
function paperPlaneGeometry(): THREE.BufferGeometry {
  const N = [0, 0.01, 0.27];
  const S = [0, 0.012, -0.21];
  const L = [-0.19, 0.04, -0.23];
  const R = [0.19, 0.04, -0.23];
  const K = [0, -0.06, -0.2];
  const tris = [N, L, S, N, S, R, N, S, K, N, K, S];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(tris.flat(), 3));
  // Asas brancas com as pontas azuis (contraste no piso claro), quilha azul de sinal.
  const W = new THREE.Color("#F7F5F2");
  const E = new THREE.Color("#7CCBF2");
  const B = new THREE.Color("#00B7FF");
  const cols = [W, E, W, W, W, E, B, B, B, B, B, B].flatMap((c) => [c.r, c.g, c.b]);
  geo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  return geo;
}

function PlaneFlights() {
  const group = useRef<THREE.Group>(null);
  const shadows = useRef<THREE.Group>(null);
  const trail = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(paperPlaneGeometry, []);
  const mat = useMemo(() => {
    const m = toon("#FFFFFF", { side: THREE.DoubleSide }).clone();
    m.vertexColors = true;
    return m;
  }, []);
  const tmp = useMemo(
    () => ({ p: { x: 0, y: 0, z: 0 } as EscVec3, q: { x: 0, y: 0, z: 0 } as EscVec3, look: new THREE.Vector3(), o: new THREE.Object3D() }),
    [],
  );
  const puffs = useMemo(() => Array.from({ length: TRAIL }, () => ({ x: 0, y: 0, z: 0, born: -1 })), []);
  const next = useRef(0);
  const lastPuff = useRef(0);

  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );

  useFrame(() => {
    const g = group.current;
    const tr = trail.current;
    if (!g || !tr) return;
    const now = performance.now();
    // Tira os voos que já pousaram.
    for (let i = flights.length - 1; i >= 0; i--) if (now - flights[i]!.start > flights[i]!.ms + 150) flights.splice(i, 1);
    const spawn = now - lastPuff.current > 45;
    if (spawn) lastPuff.current = now;
    for (let k = 0; k < POOL; k++) {
      const mesh = g.children[k] as THREE.Mesh | undefined;
      const shadow = shadows.current?.children[k] as THREE.Mesh | undefined;
      if (!mesh) continue;
      const f = flights[k];
      if (!f) {
        mesh.visible = false;
        if (shadow) shadow.visible = false;
        continue;
      }
      // Quem recebe pode estar andando: o destino é a posição atual (se ainda estiver online).
      const r = poseOf(f.to);
      if (r) {
        f.b.x = r.x;
        f.b.z = r.z;
        f.b.y = groundY(r.x, r.z) + 1.3;
      }
      const t = Math.min(1, (now - f.start) / f.ms);
      planeArc(f.a, f.b, t, tmp.p);
      planeArc(f.a, f.b, Math.min(1, t + 0.02), tmp.q);
      mesh.visible = true;
      mesh.position.set(tmp.p.x, tmp.p.y, tmp.p.z);
      tmp.look.set(tmp.q.x - tmp.p.x, tmp.q.y - tmp.p.y, tmp.q.z - tmp.p.z);
      if (tmp.look.lengthSq() > 1e-8) {
        tmp.look.add(mesh.position);
        mesh.lookAt(tmp.look);
      }
      // Balanço de planador.
      mesh.rotateZ(Math.sin(now * 0.006 + f.id) * 0.25);
      // Sombra no chão: ajuda a ler a altura (principalmente no 2D).
      if (shadow) {
        const floor = groundY(tmp.p.x, tmp.p.z);
        const h = Math.max(0, tmp.p.y - floor);
        shadow.visible = true;
        shadow.position.set(tmp.p.x, floor + 0.012, tmp.p.z);
        shadow.scale.setScalar(Math.max(0.35, 1 - h * 0.12));
      }
      if (spawn && t < 0.98) {
        const pf = puffs[next.current]!;
        next.current = (next.current + 1) % TRAIL;
        pf.x = tmp.p.x;
        pf.y = tmp.p.y;
        pf.z = tmp.p.z;
        pf.born = now;
      }
    }
    // Rastro de ar (bolinhas que encolhem).
    let n = 0;
    for (const pf of puffs) {
      if (pf.born < 0) continue;
      const age = (now - pf.born) / 700;
      if (age >= 1) {
        pf.born = -1;
        continue;
      }
      tmp.o.position.set(pf.x, pf.y, pf.z);
      tmp.o.scale.setScalar((1 - age) * 0.9);
      tmp.o.updateMatrix();
      tr.setMatrixAt(n++, tmp.o.matrix);
    }
    if (n === 0 && tr.count === 0) return;
    tr.visible = n > 0;
    tr.count = n;
    tr.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <group ref={group}>
        {Array.from({ length: POOL }, (_, i) => (
          <mesh key={i} geometry={geo} material={mat} visible={false} scale={1.7} frustumCulled={false} />
        ))}
      </group>
      <group ref={shadows}>
        {Array.from({ length: POOL }, (_, i) => (
          <mesh key={i} rotation-x={-Math.PI / 2} visible={false} frustumCulled={false} renderOrder={1}>
            <circleGeometry args={[0.22, 16]} />
            <meshBasicMaterial color="#00112A" transparent opacity={0.22} depthWrite={false} />
          </mesh>
        ))}
      </group>
      <instancedMesh ref={trail} args={[undefined, undefined, TRAIL]} frustumCulled={false} visible={false}>
        <icosahedronGeometry args={[0.035, 0]} />
        <meshBasicMaterial color="#9AD9F7" toneMapped={false} />
      </instancedMesh>
    </>
  );
}

// ---- sons de reserva ----------------------------------------------------------------------

/** Lançar: um "fuuu" de papel cortando o ar. */
registerSynth("plane-throw", (c, out) => noise(c, out, { dur: 0.5, from: 2400, to: 900, q: 1.4, gain: 0.35, attack: 0.03 }));
/** Pousar: papel dobrado chegando na mão. */
registerSynth("plane-land", (c, out) => {
  noise(c, out, { dur: 0.12, from: 3200, to: 2200, q: 2, gain: 0.3, attack: 0.005 });
  noise(c, out, { dur: 0.1, from: 2600, to: 1800, q: 2, gain: 0.22, attack: 0.005, delay: 0.09 });
});
