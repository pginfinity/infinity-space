import { useRef } from "react";
import { motion } from "motion/react";
import { clsx } from "clsx";
import { TTT_EMPTY, type TicTacToeState } from "@infinity/world";
import { sendGame, type Table } from "./api.ts";
import { MarkSvg } from "./tokens.tsx";
import { S } from "./strings.ts";

interface Props {
  t: Table<TicTacToeState>;
  seat: number;
  canMove: boolean;
}

/** Jogo da velha: toque numa casa vazia para marcar. */
export function TicTacToeBoard({ t, seat, canMove }: Props) {
  const s = t.state;
  const openedAt = useRef({ round: s.round, moves: s.moves });
  const fresh = s.round !== openedAt.current.round || s.moves > openedAt.current.moves;
  const line = new Set(s.line ?? []);

  return (
    <div className="mx-auto grid aspect-square w-full max-w-[360px] touch-manipulation select-none grid-cols-3 gap-2 rounded-2xl bg-offwhite/6 p-2 ring-1 ring-offwhite/10" role="grid" aria-label="Jogo da velha">
      {s.grid.map((who, i) => {
        const empty = who === TTT_EMPTY;
        const playable = canMove && empty;
        const dim = s.over && s.line && !line.has(i);
        return (
          <button
            key={i}
            type="button"
            role="gridcell"
            aria-label={`${S.cell(i + 1)}${empty ? "" : who === 0 ? ", X" : ", O"}`}
            disabled={!playable}
            onClick={() => sendGame(t.table, "move", { cell: i })}
            className={clsx(
              "group relative grid place-items-center rounded-xl bg-space/70 outline-none ring-1 ring-offwhite/8 transition-colors focus-visible:ring-2 focus-visible:ring-signal",
              playable ? "cursor-pointer hover:bg-card" : "cursor-default",
              s.over && line.has(i) && "bg-card ring-2 ring-offwhite/40",
            )}
          >
            {!empty && (
              <motion.span className="h-3/4 w-3/4" animate={{ opacity: dim ? 0.35 : 1 }} transition={{ duration: 0.4, delay: 0.2 }}>
                <MarkSvg seat={who} className="h-full w-full" animate={fresh && s.last === i} />
              </motion.span>
            )}
            {playable && (
              <span className="absolute h-1/2 w-1/2 opacity-0 transition-opacity group-hover:opacity-25">
                <MarkSvg seat={seat} className="h-full w-full" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
