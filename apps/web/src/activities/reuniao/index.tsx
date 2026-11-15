import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Html } from "@react-three/drei";
import { Circle, ExternalLink, Square } from "lucide-react";
import { REC_ID, REC_KIND, recGroup, recordable, type RecSession, type RecState, type Zone } from "@infinity/world";
import { registerActivity, sendAct, useAct } from "../registry.ts";
import { registerSynth, sfx } from "../../audio/sfx.ts";
import { toast } from "../../ui/toasts.ts";
import { world } from "../../world/world.ts";
import { self } from "../../world/registry.ts";

/**
 * Gravação de reuniões: quem está numa sala de reunião (ou no auditório) grava com um clique.
 * Todos na sala são avisados, quem entra depois também, e um selo "Gravando" aparece no mundo.
 * O áudio vai para o Drive do time (ver apps/server/src/recording).
 */

const T = {
  record: "Gravar reunião",
  confirmTitle: "Gravar esta reunião?",
  confirmText: "Todos na sala serão avisados. Só o áudio de quem está aqui é gravado e vai para o Drive do time.",
  start: "Gravar",
  cancel: "Cancelar",
  recording: "Gravando",
  stop: "Parar",
  startedBy: (n: string) => `Iniciada por ${n}`,
  starting: "Preparando gravação…",
  saving: "Salvando gravação…",
  uploaded: "Gravação no Drive",
  open: "Abrir",
  error: "A gravação falhou",
  startedToast: (by: string, room: string) => `${by} começou a gravar a reunião (${room}).`,
  enteredToast: (room: string) => `${room} está sendo gravada.`,
  finishedToast: "Gravação encerrada.",
  badge: "Gravando",
};

/** Zona onde estou (atualiza 4x por segundo, sem re-render se não mudar). */
function useMyZone(): Zone | undefined {
  const [zone, setZone] = useState<Zone | undefined>(undefined);
  useEffect(() => {
    const id = window.setInterval(() => {
      const z = world().zones.zoneAt({ x: self.x, z: self.z });
      setZone((prev) => (prev?.id === z?.id ? prev : z));
    }, 250);
    return () => window.clearInterval(id);
  }, []);
  return zone;
}

function RecOverlay() {
  const state = useAct<RecState>(REC_ID);
  const zone = useMyZone();
  const group = recordable(zone) ? recGroup(zone) : null;
  const session = group ? state?.sessions[group] : undefined;
  const [confirm, setConfirm] = useState(false);

  // Avisa quem entra numa sala que já está sendo gravada.
  const lastGroup = useRef<string | null>(null);
  useEffect(() => {
    if (group !== lastGroup.current) {
      lastGroup.current = group;
      if (session?.status === "recording") toast(T.enteredToast(session.room), 5000);
      setConfirm(false);
    }
  }, [group, session]);

  if (!group) return null;
  return (
    <div className="pointer-events-auto absolute left-3 top-[60px] z-10">
      <AnimatePresence mode="wait">
        {!session || session.status === "uploaded" || session.status === "saved" || session.status === "error" ? (
          <motion.div key="idle" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col items-start gap-1.5">
            {session && <Finished s={session} />}
            {!confirm ? (
              <button type="button" onClick={() => setConfirm(true)} className="glass flex items-center gap-2 rounded-full py-1.5 pl-2.5 pr-3.5 text-xs text-offwhite/90 hover:text-offwhite">
                <Circle className="size-3 fill-danger text-danger" />
                {T.record}
              </button>
            ) : (
              <div role="dialog" aria-label={T.confirmTitle} className="w-72 rounded-2xl border border-offwhite/10 bg-space p-3.5 shadow-2xl">
                <p className="text-sm font-medium">{T.confirmTitle}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate">{T.confirmText}</p>
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" onClick={() => setConfirm(false)} className="rounded-lg px-3 py-1.5 text-xs text-slate hover:bg-offwhite/8 hover:text-offwhite">
                    {T.cancel}
                  </button>
                  <button
                    type="button"
                    autoFocus
                    onClick={() => {
                      setConfirm(false);
                      sendAct(REC_ID, "start");
                    }}
                    className="flex items-center gap-1.5 rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-offwhite hover:brightness-110"
                  >
                    <Circle className="size-2.5 fill-current" />
                    {T.start}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div key="live" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="status" className="flex items-center gap-2 rounded-full border border-danger/40 bg-space/95 py-1.5 pl-3 pr-1.5 text-xs shadow-xl">
            {session.status === "recording" ? (
              <>
                <span className="relative flex size-2.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-danger opacity-60" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-danger" />
                </span>
                <span className="font-semibold text-offwhite">{T.recording}</span>
                <Elapsed since={session.startedAt} />
                <span className="hidden text-slate sm:inline">· {T.startedBy(session.by)}</span>
                <button type="button" onClick={() => sendAct(REC_ID, "stop")} className="ml-1 flex items-center gap-1 rounded-full bg-offwhite/10 px-2.5 py-1 font-medium hover:bg-offwhite/20" aria-label="Parar a gravação">
                  <Square className="size-2.5 fill-current" />
                  {T.stop}
                </button>
              </>
            ) : (
              <span className="pr-2 text-slate">{session.status === "starting" ? T.starting : T.saving}</span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Finished({ s }: { s: RecSession }) {
  if (s.status === "uploaded" && s.link) {
    return (
      <a href={s.link} target="_blank" rel="noreferrer" className="glass flex items-center gap-2 rounded-full py-1.5 pl-3 pr-3.5 text-xs text-ok hover:text-offwhite">
        {T.uploaded} · {T.open}
        <ExternalLink className="size-3" />
      </a>
    );
  }
  return <p className="glass max-w-72 rounded-xl px-3 py-1.5 text-[11px] leading-snug text-slate">{s.status === "error" ? `${T.error}. ${s.note ?? ""}` : s.note}</p>;
}

function Elapsed({ since }: { since: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const draw = () => {
      const s = Math.max(0, Math.floor((Date.now() - since) / 1000));
      const h = Math.floor(s / 3600);
      const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
      const ss = String(s % 60).padStart(2, "0");
      if (ref.current) ref.current.textContent = h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
    };
    draw();
    const id = window.setInterval(draw, 1000);
    return () => window.clearInterval(id);
  }, [since]);
  return <span ref={ref} className="tabular-nums text-offwhite/80" />;
}

/** Selo "Gravando" sobre a sala, no mundo (quem passa por fora também vê). */
function RecScene() {
  const state = useAct<RecState>(REC_ID);
  const { map } = world();
  const spots = useMemo(() => {
    const out: Record<string, { x: number; z: number }> = {};
    for (const z of map.zones) {
      const g = z.group ?? z.id;
      if (out[g]) continue;
      const label = map.labels.find((l) => l.text === z.name);
      if (label) out[g] = label.pos;
    }
    return out;
  }, [map]);
  const live = Object.values(state?.sessions ?? {}).filter((s) => s.status === "recording");
  return (
    <>
      {live.map((s) => {
        const p = spots[s.group];
        if (!p) return null;
        return (
          <Html key={s.group} position={[p.x, 2.9, p.z]} center zIndexRange={[6, 0]} style={{ pointerEvents: "none" }}>
            <div className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-danger px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-offwhite shadow-lg">
              <span className="size-1.5 animate-pulse rounded-full bg-offwhite" />
              {T.badge}
            </div>
          </Html>
        );
      })}
    </>
  );
}

registerActivity({
  name: "reuniao/gravacao",
  kinds: [REC_KIND],
  onEvent: (e) => {
    const d = e.data as { room: string; by?: string };
    if (e.ev === "started") {
      sfx("gravacao-inicio", { volume: 0.5 });
      toast(T.startedToast(d.by ?? "Alguém", d.room), 5000);
    }
    if (e.ev === "finished") {
      sfx("gravacao-fim", { volume: 0.5 });
      toast(T.finishedToast, 3500);
    }
  },
  Overlay: RecOverlay,
  Scene: RecScene,
});

/** Dois toques subindo (começou) e descendo (terminou), até existirem os arquivos gerados. */
function chime(up: boolean) {
  return (c: AudioContext, out: AudioNode) => {
    const t = c.currentTime;
    const notes = up ? [660, 990] : [990, 660];
    notes.forEach((f, i) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "sine";
      o.frequency.value = f;
      const at = t + i * 0.14;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.35, at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
      o.connect(g).connect(out);
      o.start(at);
      o.stop(at + 0.25);
    });
  };
}
registerSynth("gravacao-inicio", chime(true));
registerSynth("gravacao-fim", chime(false));
