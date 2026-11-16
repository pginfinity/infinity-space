import { useEffect, useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";
import { HOCKEY_KIND, PONG_KIND, RT_EV, type DuelState, type Lens, type MapObject } from "@infinity/world";
import { useApp } from "../../state/store.ts";
import { world } from "../../world/world.ts";
import { sfx } from "../../audio/sfx.ts";
import { useActs, type ActivityClient, type DynamicTarget } from "../registry.ts";
import { duelNet, type DuelNet } from "./rt/net.ts";
import { DuelPanel, tableOf, type DuelView } from "./rt/DuelPanel.tsx";
import { duelStand, openDuel, useDuelUi } from "./rt/ui.ts";
import { HockeyTables, hockeyView } from "./hockey.tsx";
import { PongTables, pongView } from "./pong.tsx";
import { T } from "./strings.ts";

/**
 * Hockey de mesa e pingue-pongue: E na mesa abre o painel; a física vem do servidor (quadros a 30 Hz)
 * e quem joga prevê localmente. Na mesa do mundo, disco, bola e raquetes andam para todos.
 */

const VIEWS: Record<string, DuelView<any>> = { [HOCKEY_KIND]: hockeyView, [PONG_KIND]: pongView };

function viewOf(id: string): DuelView<unknown> | undefined {
  const kind = useActs.getState().acts[id]?.kind;
  return kind ? VIEWS[kind] : undefined;
}

/** Rede da mesa, com os sons ligados na primeira vez. */
function netOf(id: string): DuelNet<unknown> | undefined {
  const view = viewOf(id);
  if (!view) return undefined;
  const net = duelNet(id, view.game);
  if (!net.onEvent) {
    const at = tableOf(id)?.pos;
    const hockey = view.kind === HOCKEY_KIND;
    net.onEvent = (ev, predicted) => {
      const seat = net.seat;
      // quem joga ouve na cabeça (o que previu na hora + a rebatida do outro, que vem do servidor);
      // quem assiste ouve da mesa
      let bits = ev;
      if (!predicted && seat >= 0) bits &= seat === 0 ? RT_EV.hit1 : RT_EV.hit0;
      const opt = seat >= 0 ? { volume: 0.7 } : { at, range: 12, volume: 0.6 };
      if (bits & (RT_EV.hit0 | RT_EV.hit1)) sfx(hockey ? "arcade-hockey-hit" : "arcade-pong-hit", opt);
      else if (bits & RT_EV.wall) sfx("arcade-hockey-wall", { ...opt, volume: (opt.volume ?? 0.7) * 0.7 });
      if (bits & RT_EV.bounce) sfx("arcade-pong-bounce", { ...opt, volume: (opt.volume ?? 0.7) * 0.6 });
    };
  }
  return net;
}

/** Cabeceiras das mesas: chegar perto de qualquer lado já oferece o jogo. */
let ends: DynamicTarget[] | null = null;
function tableEnds(): DynamicTarget[] {
  if (ends) return ends;
  ends = [];
  for (const o of world().map.objects) {
    if (!o.gameId || (o.type !== "airhockey" && o.type !== "pingpong")) continue;
    const view = o.type === "airhockey" ? hockeyView : pongView;
    const label = o.type === "airhockey" ? T.duel.playHockey : T.duel.playPong;
    const id = o.gameId;
    for (const seat of [0, 1]) {
      const { point } = duelStand(o, view.game.def as never, seat);
      ends.push({ key: `${id}:${seat}`, point, radius: 1.1, label, run: () => openDuel(id) });
    }
  }
  return ends;
}

export const duels: ActivityClient = {
  name: "arcade/duelos",
  kinds: [HOCKEY_KIND, PONG_KIND],
  objects: ["airhockey", "pingpong"],
  label: (o) => (o.type === "airhockey" ? T.duel.playHockey : T.duel.playPong),
  use: (o) => {
    if (o.gameId) openDuel(o.gameId);
  },
  targets: () => (useDuelUi.getState().open ? [] : tableEnds()),
  onEvent: (e) => {
    const net = netOf(e.id);
    if (!net) return;
    if (e.ev === "f") net.onFrame(e.data);
    else if (e.ev === "pong") net.onPong(e.data);
    else if (e.ev === "point") {
      const view = viewOf(e.id);
      const at = tableOf(e.id)?.pos;
      sfx(view?.goal ? "arcade-hockey-goal" : "arcade-duel-point", net.seat >= 0 ? { volume: 0.75 } : { at, range: 14 });
    } else if (e.ev === "end") {
      const d = e.data as { winner?: number; reason?: string } | null;
      const st = useActs.getState().acts[e.id]?.state as DuelState | undefined;
      const selfId = useApp.getState().selfId;
      const mine = st && selfId ? st.seats.indexOf(selfId) : -1;
      if (mine >= 0) sfx(d?.winner === mine ? "arcade-duel-win" : "arcade-duel-lose", { volume: 0.8 });
      else if (d?.reason === "score") sfx("arcade-duel-win", { at: tableOf(e.id)?.pos, range: 14, volume: 0.5 });
    }
  },
  Overlay: DuelOverlay,
  Scene: DuelScene,
};

function DuelOverlay() {
  const open = useDuelUi((s) => s.open);
  const kind = useActs((s) => (open ? s.acts[open]?.kind : undefined));
  const view = kind ? VIEWS[kind] : undefined;

  // Esc fecha o painel (quem digita num campo não é interrompido)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      openDuel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // o lugar some (levantou, saiu da mesa): a previsão desliga junto com o painel
  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      <AnimatePresence>{open && view && <DuelPanel key={open} id={open} view={view} />}</AnimatePresence>
      <AnimatePresence>{!open && <BackChip />}</AnimatePresence>
    </div>
  );
}

/** Painel fechado com partida rolando: um lembrete para voltar à mesa. */
function BackChip() {
  const id = useActs((s) => {
    const me = useApp.getState().selfId;
    if (!me) return null;
    for (const a of Object.values(s.acts)) {
      if (a.kind !== HOCKEY_KIND && a.kind !== PONG_KIND) continue;
      const st = a.state as DuelState;
      if (st.seats.includes(me) && (st.phase === "playing" || st.phase === "countdown")) return a.id;
    }
    return null;
  });
  const kind = useActs((s) => (id ? s.acts[id]?.kind : undefined));
  if (!id || !kind) return null;
  const view = VIEWS[kind]!;
  return (
    <motion.button
      type="button"
      onClick={() => openDuel(id)}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="glass pointer-events-auto absolute left-1/2 top-16 flex -translate-x-1/2 items-center gap-2.5 rounded-full py-1.5 pl-3 pr-4 text-sm transition-colors hover:border-signal/60"
    >
      <span className="size-2 animate-pulse rounded-full bg-signal" />
      <span className="font-medium text-signal">{T.duel.backTo(view.title.toLowerCase())}</span>
    </motion.button>
  );
}

function DuelScene({ lens }: { lens: Lens }) {
  const tables = useMemo(() => {
    const objs = world().map.objects;
    const pick = (t: MapObject["type"]) => objs.filter((o) => o.type === t && o.gameId);
    return { hockey: pick("airhockey"), pong: pick("pingpong") };
  }, []);
  return (
    <>
      <HockeyTables lens={lens} tables={tables.hockey} />
      <PongTables lens={lens} tables={tables.pong} />
    </>
  );
}

// Gancho de inspeção para os testes de ponta a ponta (só em desenvolvimento).
if (import.meta.env.DEV) {
  const w = window as unknown as { __arcade?: Record<string, unknown> };
  w.__arcade = {
    ...(w.__arcade ?? {}),
    ...{
      /** Último quadro do servidor de uma mesa: { k, paused, pts: [disco/bola x, z, controle 0 x, z, controle 1 x, z] }. */
      frame(id: string) {
        const net = netOf(id);
        const f = net?.latest();
        if (!net || !f) return null;
        const pts = new Float64Array(net.game.npoints * 2);
        net.game.points(f.sim, pts);
        return { k: f.k, paused: f.paused, pts: [...pts], seat: net.seat, tick: net.tick, rtt: Math.round(net.rtt) };
      },
    },
  };
}
