import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { clsx } from "clsx";
import { checkersDark, checkersIsKing, checkersMoves, checkersOwner, checkersSquareName, type CheckersState } from "@infinity/world";
import { sendGame, type Table } from "./api.ts";
import { CHECKERS_DARK, CHECKERS_LIGHT } from "./palette.ts";
import { CheckerArt } from "./Art.tsx";
import { S } from "./strings.ts";

interface Props {
  t: Table<CheckersState>;
  /** Meu lugar (-1 = assistindo). Escuras veem o tabuleiro virado. */
  seat: number;
  canMove: boolean;
}

/**
 * Tabuleiro de damas interativo. Clique na peça e depois em cada casa onde ela para: nas capturas em
 * sequência, uma casa de cada vez. O cliente só sugere (com as mesmas regras de packages/world); quem confere é o servidor.
 */
export function CheckersBoard({ t, seat, canMove }: Props) {
  const s = t.state;
  const flipped = seat === 1;
  // Caminho escolhido até agora: casa de saída e as paradas já clicadas.
  const [sel, setSel] = useState<number[]>([]);
  const legal = useMemo(() => (canMove ? checkersMoves(s) : []), [s, canMove]);
  useEffect(() => setSel([]), [s.moves, s.round, canMove]);

  const candidates = sel.length ? legal.filter((m) => sel.every((x, i) => m.path[i] === x)) : [];
  const next = new Set(candidates.map((m) => m.path[sel.length]).filter((x): x is number => x !== undefined));
  const movable = new Set(legal.map((m) => m.path[0]!));
  const capture = (legal[0]?.captured.length ?? 0) > 0;
  // Peças já "tomadas" no caminho escolhido (ainda no tabuleiro até o lance ir).
  const taking = new Set(candidates[0]?.captured.slice(0, Math.max(0, sel.length - 1)) ?? []);
  const lastPath = new Set(s.last?.path ?? []);
  const lastTaken = new Set(s.last?.captured ?? []);

  const onSquare = (sq: number) => {
    if (!canMove) return;
    if (sel.length && next.has(sq)) {
      const path = [...sel, sq];
      const done = legal.find((m) => m.path.length === path.length && m.path.every((x, i) => x === path[i]));
      if (done) {
        sendGame(t.table, "move", { path });
        setSel([]);
      } else setSel(path);
      return;
    }
    setSel(movable.has(sq) && !(sel.length === 1 && sel[0] === sq) ? [sq] : []);
  };

  const order = useMemo(() => {
    const list = Array.from({ length: 64 }, (_, i) => i);
    return flipped ? list.reverse() : list;
  }, [flipped]);

  return (
    <div className="flex flex-col gap-2">
      <div className="relative aspect-square w-full touch-manipulation select-none overflow-hidden rounded-xl [container-type:inline-size] shadow-[0_12px_40px_-16px_rgb(0_0_0/0.8)] ring-1 ring-offwhite/10">
        <div className="grid h-full w-full grid-cols-8 grid-rows-8" role="grid" aria-label={S.checkersBoard}>
          {order.map((sq, i) => {
            const col = i % 8;
            const row = Math.floor(i / 8);
            const dark = checkersDark(sq);
            const piece = s.board[sq] ?? 0;
            const owner = checkersOwner(piece);
            const name = checkersSquareName(sq);
            const isSel = sel.includes(sq);
            const target = next.has(sq);
            const canPick = movable.has(sq);
            const fresh = s.last && s.last.path.at(-1) === sq;
            return (
              <button
                key={sq}
                type="button"
                role="gridcell"
                aria-label={`${S.square(name)}${owner >= 0 ? `, ${checkersIsKing(piece) ? S.king : S.man} ${owner === 0 ? S.lightPiece : S.darkPiece}` : ""}`}
                aria-selected={sel[0] === sq}
                onClick={() => onSquare(sq)}
                className={clsx("relative outline-none focus-visible:z-20 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal", canPick || target ? "cursor-pointer" : "cursor-default")}
                style={{ background: dark ? CHECKERS_DARK : CHECKERS_LIGHT }}
              >
                {lastPath.has(sq) && <span className="absolute inset-0 bg-signal/25" />}
                {lastTaken.has(sq) && <span className="absolute inset-[30%] rounded-full border-2 border-dashed border-offwhite/45" />}
                {isSel && <span className="absolute inset-0 bg-signal/40 shadow-[inset_0_0_0_3px_rgb(0_183_255/0.9)]" />}
                {canPick && !isSel && sel.length === 0 && <span className={clsx("absolute inset-[6%] rounded-full", capture ? "shadow-[0_0_0_3px_rgb(0_183_255/0.85)]" : "shadow-[0_0_0_2px_rgb(0_183_255/0.45)]")} />}

                {col === 0 && (
                  <span className="pointer-events-none absolute left-[5%] top-[3%] text-[clamp(8px,2.6cqw,11px)] font-semibold leading-none" style={{ color: dark ? CHECKERS_LIGHT : CHECKERS_DARK }}>
                    {name[1]}
                  </span>
                )}
                {row === 7 && (
                  <span className="pointer-events-none absolute bottom-[3%] right-[6%] text-[clamp(8px,2.6cqw,11px)] font-semibold leading-none" style={{ color: dark ? CHECKERS_LIGHT : CHECKERS_DARK }}>
                    {name[0]}
                  </span>
                )}

                {owner >= 0 && (
                  <motion.span
                    key={fresh ? `m${s.round}-${s.moves}` : "p"}
                    className={clsx("absolute inset-[7%] grid place-items-center", taking.has(sq) && "opacity-40")}
                    initial={fresh ? { scale: 0.7, opacity: 0.4 } : false}
                    animate={{ scale: 1, opacity: taking.has(sq) ? 0.4 : 1 }}
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <CheckerArt piece={piece} size={64} fluid />
                  </motion.span>
                )}
                {target && <span className="pointer-events-none absolute left-1/2 top-1/2 size-[32%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-signal/70 shadow-[0_0_0_3px_rgb(0_17_42/0.35)]" />}
              </button>
            );
          })}
        </div>
      </div>
      {canMove && capture && (
        <p className="rounded-lg bg-signal/10 px-3 py-1.5 text-xs text-signal" role="status">
          {S.mustCapture}
        </p>
      )}
    </div>
  );
}

/** Quantas peças cada lado perdeu (fileirinha ao lado do nome). */
export function CheckersLost({ s, seat }: { s: CheckersState; seat: number }) {
  // As peças que este lado tomou são as que o outro perdeu.
  const n = s.lost[seat === 0 ? 1 : 0];
  if (!n) return null;
  return (
    <span className="flex items-center gap-1" aria-label={`${S.captured}: ${n}`}>
      <CheckerArt piece={seat === 0 ? 3 : 1} size={14} />
      <span className="text-[11px] font-medium tabular-nums text-slate">×{n}</span>
    </span>
  );
}
