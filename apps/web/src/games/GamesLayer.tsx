import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { canAct, type BaseState } from "@infinity/world";
import { useApp } from "../state/store.ts";
import { closeGame, openGame } from "./api.ts";
import { GamePanel } from "./GamePanel.tsx";
import { MinimizedGame } from "./GameWindow.tsx";
import { SeatToken } from "./tokens.tsx";
import { GAME_TITLE, S } from "./strings.ts";

/**
 * Camada de UI dos jogos, montada pelo WorldView por cima do mundo:
 * o painel da mesa aberta e, com ele fechado, um lembrete quando é a sua vez.
 */
export function GamesLayer() {
  const active = useApp((s) => s.activeGame);

  // Esc fecha o painel (quem está digitando num campo não é interrompido).
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      closeGame();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      <AnimatePresence>{active && <GamePanel key={active} table={active} />}</AnimatePresence>
      <AnimatePresence>{!active && <TurnChip />}</AnimatePresence>
      <MinimizedGame />
    </div>
  );
}

/** Painel fechado e é a sua vez numa partida: um lembrete discreto para voltar à mesa. */
function TurnChip() {
  // O seletor devolve só o id da mesa (valor estável), para não re-renderizar à toa.
  const table = useApp((s) => {
    if (!s.selfId) return null;
    for (const g of Object.values(s.games)) {
      const seat = g.seats.indexOf(s.selfId);
      // Minha vez, ou minha dupla responde a um pedido (truco).
      if (seat >= 0 && g.phase === "playing" && canAct(g.state as BaseState, seat)) return g.table;
    }
    return null;
  });
  const g = useApp((s) => (table ? s.games[table] : undefined));
  const selfId = useApp((s) => s.selfId);
  if (!table || !g || !selfId) return null;
  const mine = { table, kind: g.kind, seat: g.seats.indexOf(selfId) };
  return (
    <motion.button
      type="button"
      onClick={() => openGame(mine.table)}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="glass pointer-events-auto absolute left-1/2 top-16 flex -translate-x-1/2 items-center gap-2.5 rounded-full py-1.5 pl-2 pr-4 text-sm transition-colors hover:border-signal/60"
    >
      <SeatToken kind={mine.kind} seat={mine.seat} className="size-6" />
      <span className="font-medium text-signal">{S.yourTurn}</span>
      <span className="text-offwhite/80">· {GAME_TITLE[mine.kind] ?? ""}</span>
    </motion.button>
  );
}
