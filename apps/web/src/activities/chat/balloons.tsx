import { useCallback, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import * as THREE from "three";
import { useApp } from "../../state/store.ts";
import { currentEmote } from "../../world/registry.ts";
import { useMedia } from "../../media/rtc.ts";
import { useBalloons, type Balloon } from "./balloonStore.ts";
import { groundY, poseOf, useAfterRender } from "./util.ts";

/**
 * Balão do Perto acima da cabeça de quem escreveu, nas duas lentes. HTML numa camada própria
 * (como o balão de status), posicionado depois de cada quadro pela projeção da cabeça na tela,
 * fora do React. Fica acima do balão de status quando a pessoa tem um.
 */

/** Elementos dos balões por pessoa (preenchidos pela camada HTML, movidos pela cena). */
const els = new Map<string, HTMLDivElement>();

export function ChatBalloons() {
  const list = useBalloons((s) => s.list);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ zIndex: -1 }} aria-hidden>
      <AnimatePresence>
        {Object.entries(list).map(([id, b]) => (
          <BalloonEl key={id} id={id} balloon={b} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function BalloonEl({ id, balloon }: { id: string; balloon: Balloon }) {
  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      if (el) els.set(id, el);
      else els.delete(id);
    },
    [id],
  );
  return (
    <div ref={ref} data-chat-balloon={id} className="absolute left-0 top-0 will-change-transform" style={{ visibility: "hidden" }}>
      <motion.div
        key={balloon.key}
        initial={{ opacity: 0, y: 6, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -4, scale: 0.96 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        style={{ transformOrigin: "50% 100%" }}
        className="relative w-max max-w-[240px] rounded-xl bg-offwhite px-2.5 py-1.5 text-[12px] font-medium leading-snug text-space shadow-[0_6px_18px_-6px_rgb(0_0_0/0.65)] ring-2 ring-signal"
      >
        <p className="line-clamp-3 whitespace-pre-line break-words [overflow-wrap:anywhere]">{balloon.text}</p>
        <span className="absolute -bottom-[5px] left-1/2 size-2.5 -translate-x-1/2 rotate-45 rounded-[2px] border-b-2 border-r-2 border-signal bg-offwhite" />
      </motion.div>
    </div>
  );
}

/**
 * Distância (px) da base do balão até o ponto da etiqueta de nome (1,72 m acima do chão), igual
 * à do balão de status do pacote escritorio: [emoji do emote: 0 ou 32 px] [vídeo: 0 ou 76 px]
 * [nome: ~20 px], com 4 px entre as peças. Com status, sobe a altura do balão de status.
 */
const STATUS_H = 24;
const GAP = 5;
function liftFor(video: boolean, emote: boolean, status: boolean): number {
  const h = (emote ? 32 : 0) + 4 + (video ? 80 : 0) + 20.5;
  return -h / 2 - 3 - (status ? STATUS_H + GAP : 0);
}

export function ChatBalloonProjector() {
  const v = useMemo(() => new THREE.Vector3(), []);
  const st = useMemo(() => new Map<string, { lift: number; x: number; y: number; shown: boolean }>(), []);
  const last = useRef(performance.now());
  useAfterRender(({ camera, size }) => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last.current) / 1000);
    last.current = now;
    if (!els.size) {
      if (st.size) st.clear();
      return;
    }
    const k = 1 - Math.exp(-dt * 16);
    const videos = useMedia.getState().videos;
    const players = useApp.getState().players;
    for (const [id, el] of els) {
      let s = st.get(id);
      if (!s) {
        s = { lift: NaN, x: NaN, y: NaN, shown: false };
        st.set(id, s);
      }
      const p = poseOf(id);
      let visible = false;
      if (p) {
        v.set(p.x, groundY(p.x, p.z) + 1.72, p.z).project(camera);
        visible = v.z < 1 && v.z > -1 && Math.abs(v.x) < 1.15 && Math.abs(v.y) < 1.15;
      }
      if (!visible) {
        if (s.shown) el.style.visibility = "hidden";
        s.shown = false;
        continue;
      }
      const target = liftFor(!!videos[id], !!currentEmote(id, now), !!players[id]?.note);
      s.lift = Number.isNaN(s.lift) ? target : s.lift + (target - s.lift) * k;
      const x = Math.round(((v.x + 1) / 2) * size.width);
      const y = Math.round(((1 - v.y) / 2) * size.height + s.lift);
      if (x !== s.x || y !== s.y) {
        s.x = x;
        s.y = y;
        el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -100%)`;
      }
      if (!s.shown) el.style.visibility = "visible";
      s.shown = true;
    }
    if (st.size > els.size) for (const id of st.keys()) if (!els.has(id)) st.delete(id);
  });
  return null;
}
