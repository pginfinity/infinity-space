import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { clsx } from "clsx";
import { ChevronRight, Users, X } from "lucide-react";
import { DAILY_ID, DAILY_KIND, DAILY_TURNS, dailyAllowed, type DailyRoom, type DailyState, type Zone } from "@infinity/world";
import { registerActivity, sendAct, useAct, actState } from "../registry.ts";
import { registerSynth, sfx } from "../../audio/sfx.ts";
import { toast } from "../../ui/toasts.ts";
import { InStack } from "../../ui/HudStack.tsx";
import { useApp } from "../../state/store.ts";
import { world } from "../../world/world.ts";
import { sampleRemote, self } from "../../world/registry.ts";
import { serverNow } from "../../net/session.ts";

/**
 * Daily do time: cartão na coluna da esquerda (salas de time e de reunião), holofote no chão sob quem
 * fala e um toque suave quando o tempo sugerido acaba. Nada fica registrado.
 */

function useMyZone(): Zone | undefined {
  const [zone, setZone] = useState<Zone | undefined>(undefined);
  useEffect(() => {
    const id = window.setInterval(() => {
      const z = world().zones.zoneAt({ x: self.x, z: self.z });
      setZone((prev) => (prev?.id === z?.id ? prev : z));
    }, 300);
    return () => window.clearInterval(id);
  }, []);
  return zone;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function DailyOverlay() {
  const state = useAct<DailyState>(DAILY_ID);
  const zone = useMyZone();
  const me = useApp((s) => s.selfId);
  const myName = useApp((s) => s.profile.name);
  const [setup, setSetup] = useState(false);
  const [turn, setTurn] = useState<number>(90);
  if (!dailyAllowed(zone)) return null;
  const room = state?.rooms[zone.id];

  return (
    <InStack side="top-left" order={2}>
    <div className="pointer-events-auto w-72">
      {!room ? (
        !setup ? (
          <button type="button" onClick={() => setSetup(true)} className="glass flex items-center gap-2 rounded-full py-1.5 pl-2.5 pr-3.5 text-xs text-offwhite/90 hover:text-offwhite">
            <Users className="size-3.5 text-signal" />
            Começar a daily
          </button>
        ) : (
          <div role="dialog" aria-label="Começar a daily" className="rounded-2xl border border-offwhite/10 bg-space p-3.5 shadow-2xl">
            <p className="text-sm font-medium">Daily em {zone.name}</p>
            <p className="mt-1 text-xs leading-relaxed text-slate">Quem está na sala entra na roda, em ordem sorteada. Cada um fala e passa a vez.</p>
            <p className="mb-1.5 mt-3 text-[11px] text-slate">Tempo sugerido por pessoa</p>
            <div className="flex rounded-xl bg-deep/60 p-0.5" role="radiogroup" aria-label="Tempo por pessoa">
              {DAILY_TURNS.map((t) => (
                <button key={t} type="button" role="radio" aria-checked={turn === t} onClick={() => setTurn(t)} className={clsx("flex-1 rounded-[10px] px-2 py-1.5 text-xs transition-colors", turn === t ? "bg-offwhite/12 text-offwhite" : "text-slate hover:text-offwhite")}>
                  {t < 60 ? `${t} s` : `${t / 60} min`.replace(".", ",")}
                </button>
              ))}
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setSetup(false)} className="rounded-lg px-3 py-1.5 text-xs text-slate hover:bg-offwhite/8 hover:text-offwhite">
                Cancelar
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => {
                  setSetup(false);
                  sendAct(DAILY_ID, "start", { turn });
                }}
                className="rounded-lg bg-orange px-3 py-1.5 text-xs font-semibold text-offwhite hover:brightness-110"
              >
                Começar
              </button>
            </div>
          </div>
        )
      ) : (
        <RunningCard room={room} me={me} myName={myName} />
      )}
    </div>
    </InStack>
  );
}

function RunningCard({ room, me, myName }: { room: DailyRoom; me: string | null; myName: string }) {
  const speaker = room.order[room.current];
  const inRound = room.order.some((p) => p.id === me);
  const canPass = speaker?.id === me || room.by === myName;
  const next = room.order.slice(room.current + 1);
  const clock = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const chimed = useRef<string>("");

  useEffect(() => {
    const draw = () => {
      const s = Math.max(0, (serverNow() - room.turnAt) / 1000);
      if (clock.current) clock.current.textContent = `${fmt(s)} / ${fmt(room.turn)}`;
      if (bar.current) {
        bar.current.style.transform = `scaleX(${Math.min(1, s / room.turn)})`;
        bar.current.style.background = s > room.turn ? "var(--color-warn)" : "var(--color-signal)";
      }
      // Um toque suave quando o tempo sugerido acaba (uma vez por vez, só para quem está na sala).
      const key = `${room.turnAt}`;
      if (s > room.turn && chimed.current !== key) {
        chimed.current = key;
        sfx("daily-tempo", { volume: 0.35 });
      }
    };
    draw();
    const id = window.setInterval(draw, 500);
    return () => window.clearInterval(id);
  }, [room.turnAt, room.turn]);

  return (
    <section aria-label="Daily" className="rounded-2xl border border-offwhite/10 bg-space/95 p-3.5 shadow-2xl">
      <header className="flex items-center justify-between">
        <span className="label-caps">Daily · {room.room}</span>
        <button type="button" onClick={() => sendAct(DAILY_ID, "end")} className="rounded-md p-1 text-slate hover:bg-offwhite/8 hover:text-offwhite" aria-label="Encerrar a daily">
          <X className="size-3.5" />
        </button>
      </header>
      <p className="mt-2 text-[11px] text-slate">
        {room.current + 1} de {room.order.length} · falando agora
      </p>
      <p className="truncate font-display text-lg font-medium uppercase tracking-[0.04em]">{speaker?.id === me ? "Você" : speaker?.name}</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-offwhite/8">
        <div ref={bar} className="h-full origin-left rounded-full transition-transform duration-500" style={{ transform: "scaleX(0)" }} />
      </div>
      <span ref={clock} className="mt-1 block text-right text-[11px] tabular-nums text-slate" />
      {next.length > 0 && <p className="mt-1 truncate text-xs text-slate">Depois: {next.map((p) => (p.id === me ? "você" : p.name)).join(", ")}</p>}
      <div className="mt-3 flex items-center justify-between gap-2">
        {!inRound ? (
          <button type="button" onClick={() => sendAct(DAILY_ID, "join")} className="rounded-lg border border-offwhite/10 px-3 py-1.5 text-xs hover:border-signal hover:text-signal">
            Entrar na roda
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          disabled={!canPass}
          onClick={() => sendAct(DAILY_ID, "next")}
          className="flex items-center gap-1 rounded-lg bg-offwhite/10 px-3 py-1.5 text-xs font-medium hover:bg-offwhite/20 disabled:opacity-40"
          title={canPass ? undefined : "Quem está falando (ou quem começou) passa a vez"}
        >
          {next.length ? "Passar a vez" : "Concluir"}
          <ChevronRight className="size-3.5" />
        </button>
      </div>
    </section>
  );
}

/** Holofote suave no chão sob quem está falando em cada daily. */
function DailyScene() {
  const group = useRef<THREE.Group>(null);
  const { geo, mat } = useMemo(
    () => ({
      geo: new THREE.CircleGeometry(0.75, 40).rotateX(-Math.PI / 2),
      mat: new THREE.MeshBasicMaterial({ color: "#00B7FF", transparent: true, opacity: 0.28, depthWrite: false, toneMapped: false }),
    }),
    [],
  );
  useFrame((st) => {
    const g = group.current;
    const s = actState<DailyState>(DAILY_ID);
    if (!g) return;
    const rooms = s ? Object.values(s.rooms) : [];
    while (g.children.length < rooms.length) g.add(new THREE.Mesh(geo, mat));
    const me = useApp.getState().selfId;
    const now = performance.now();
    g.children.forEach((m, i) => {
      const r = rooms[i];
      const sp = r?.order[r.current];
      const p = sp ? (sp.id === me ? self : sampleRemote(sp.id, now)) : null;
      m.visible = !!p;
      if (p) m.position.set(p.x, 0.03, p.z);
    });
    mat.opacity = 0.22 + Math.sin(st.clock.elapsedTime * 2.2) * 0.06;
  });
  return <group ref={group} />;
}

registerActivity({
  name: "rituais/daily",
  kinds: [DAILY_KIND],
  onEvent: (e) => {
    if (e.ev !== "done") return;
    sfx("daily-fim", { volume: 0.4 });
    toast("Daily concluída. Bom trabalho!", 4000);
  },
  Overlay: DailyOverlay,
  Scene: DailyScene,
});

registerSynth("daily-tempo", (c, out) => {
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.value = 784;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 1);
});
registerSynth("daily-fim", (c, out) => {
  const t = c.currentTime;
  [523, 659, 784].forEach((f, i) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.value = f;
    const at = t + i * 0.12;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.6);
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + 0.65);
  });
});
