import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { clsx } from "clsx";
import { CHESS_FILES, CHESS_PROMOTIONS, chessBoard, chessKingSquare, chessTargets, type ChessPromotion, type ChessState } from "@infinity/world";
import { sendGame, type Table } from "./api.ts";
import { PieceSvg } from "./tokens.tsx";
import { CHESS_DARK, CHESS_LIGHT } from "./palette.ts";
import { PIECE_NAME, S } from "./strings.ts";


interface Props {
  t: Table<ChessState>;
  /** Meu lugar (-1 = assistindo). Pretas veem o tabuleiro virado. */
  seat: number;
  /** Posso jogar agora (sentado, partida rolando, minha vez). */
  canMove: boolean;
}

/** Tabuleiro de xadrez interativo: clique na peça mostra os lances; clique no destino joga. */
export function ChessBoard({ t, seat, canMove }: Props) {
  const s = t.state;
  const flipped = seat === 1;
  const myColor = seat === 1 ? "b" : "w";
  const [selected, setSelected] = useState<string | null>(null);
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(null);

  const board = useMemo(() => chessBoard(s.fen), [s.fen]);
  const targets = useMemo(() => (selected && canMove ? chessTargets(s.fen, selected) : []), [s.fen, selected, canMove]);
  const checkSq = s.check ? chessKingSquare(s.fen, s.turn === 0 ? "w" : "b") : null;

  // Lance novo chegou (ou a partida mudou): limpa a seleção.
  useEffect(() => {
    setSelected(null);
    setPromo(null);
  }, [s.fen, t.state.round, canMove]);

  // Só anima lances que chegaram com o painel aberto, não o último lance antigo.
  const openedAt = useRef({ round: s.round, moves: s.moves });
  const animateLast = s.last !== null && (s.round !== openedAt.current.round || s.moves > openedAt.current.moves);

  // Esc fecha a escolha de promoção antes de fechar o painel.
  useEffect(() => {
    if (!promo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        setPromo(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [promo]);

  const pieceAt = (sq: string) => board.find((p) => p?.square === sq) ?? null;

  const play = (from: string, to: string, promotion?: ChessPromotion) => {
    sendGame(t.table, "move", promotion ? { from, to, promotion } : { from, to });
    setSelected(null);
    setPromo(null);
  };

  const onSquare = (sq: string) => {
    if (!canMove) return;
    if (selected) {
      const target = targets.find((x) => x.to === sq);
      if (target) {
        if (target.promotion) setPromo({ from: selected, to: sq });
        else play(selected, sq);
        return;
      }
    }
    const piece = pieceAt(sq);
    setSelected(piece && piece.color === myColor && sq !== selected ? sq : null);
  };

  // Ordem de desenho: a8..h1 (brancas embaixo); virado para quem joga de pretas.
  const squares = useMemo(() => {
    const list: string[] = [];
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) list.push(`${CHESS_FILES[f]}${8 - r}`);
    return flipped ? list.reverse() : list;
  }, [flipped]);

  const pos = (sq: string) => {
    const i = squares.indexOf(sq);
    return { col: i % 8, row: Math.floor(i / 8) };
  };

  return (
    <div className="relative aspect-square w-full touch-manipulation select-none overflow-hidden rounded-xl [container-type:inline-size] shadow-[0_12px_40px_-16px_rgb(0_0_0/0.8)] ring-1 ring-offwhite/10">
      <div className="grid h-full w-full grid-cols-8 grid-rows-8" role="grid" aria-label="Tabuleiro de xadrez">
        {squares.map((sq, i) => {
          const col = i % 8;
          const row = Math.floor(i / 8);
          const file = sq.charCodeAt(0) - 97;
          const rank = Number(sq[1]);
          const light = (file + rank) % 2 === 1;
          const piece = pieceAt(sq);
          const target = targets.find((x) => x.to === sq);
          const isLast = s.last && (s.last.from === sq || s.last.to === sq);
          const isSel = selected === sq;
          const mine = canMove && piece?.color === myColor;
          const moving = animateLast && s.last?.to === sq;
          const from = moving && s.last ? pos(s.last.from) : null;
          return (
            <button
              key={sq}
              type="button"
              role="gridcell"
              aria-label={`${S.square(sq)}${piece ? `, ${PIECE_NAME[piece.type]} ${piece.color === "w" ? "branco" : "preto"}` : ""}`}
              aria-selected={isSel}
              onClick={() => onSquare(sq)}
              className={clsx("relative outline-none focus-visible:z-20 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal", (mine || target) && "cursor-pointer", !mine && !target && "cursor-default")}
              style={{ background: light ? CHESS_LIGHT : CHESS_DARK }}
            >
              {isLast && <span className="absolute inset-0 bg-signal/30" />}
              {isSel && <span className="absolute inset-0 bg-signal/45 shadow-[inset_0_0_0_3px_rgb(0_183_255/0.9)]" />}
              {checkSq === sq && <span className="absolute inset-0" style={{ background: "radial-gradient(circle, rgb(255 90 78) 0%, rgb(255 90 78 / 0.8) 38%, rgb(255 90 78 / 0) 78%)" }} />}
              {mine && !isSel && <span className="absolute inset-0 bg-offwhite/0 transition-colors hover:bg-offwhite/15" />}

              {/* Coordenadas na borda, como num tabuleiro de verdade. */}
              {col === 0 && (
                <span className="pointer-events-none absolute left-[5%] top-[3%] text-[clamp(8px,2.6cqw,11px)] font-semibold leading-none" style={{ color: light ? CHESS_DARK : CHESS_LIGHT }}>
                  {rank}
                </span>
              )}
              {row === 7 && (
                <span className="pointer-events-none absolute bottom-[3%] right-[6%] text-[clamp(8px,2.6cqw,11px)] font-semibold leading-none" style={{ color: light ? CHESS_DARK : CHESS_LIGHT }}>
                  {sq[0]}
                </span>
              )}

              {piece && (
                <motion.span
                  key={moving ? `m${s.round}-${s.moves}` : "p"}
                  className={clsx("absolute inset-[4%] block", moving && "z-10")}
                  initial={from ? { x: `${(from.col - col) * 108.7}%`, y: `${(from.row - row) * 108.7}%` } : false}
                  animate={{ x: 0, y: 0 }}
                  transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                >
                  <PieceSvg type={piece.type} color={piece.color} className="h-full w-full drop-shadow-[0_2px_2px_rgb(0_0_0/0.25)]" />
                </motion.span>
              )}

              {target && !target.capture && <span className="pointer-events-none absolute left-1/2 top-1/2 size-[30%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-space/40" />}
              {target && target.capture && <span className="pointer-events-none absolute inset-[3%] rounded-full shadow-[inset_0_0_0_5px_rgb(0_17_42/0.45)]" />}
            </button>
          );
        })}
      </div>

      <AnimatePresence>
        {promo && (
          <motion.div
            className="absolute inset-0 z-30 grid place-items-center bg-deep/55 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPromo(null)}
          >
            <motion.div
              role="dialog"
              aria-label={S.promoteTitle}
              className="glass flex flex-col items-center gap-3 rounded-2xl px-4 py-3"
              initial={{ scale: 0.92, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="label-caps">{S.promoteTitle}</p>
              <div className="flex gap-2">
                {CHESS_PROMOTIONS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    autoFocus={p === "q"}
                    onClick={() => play(promo.from, promo.to, p)}
                    aria-label={PIECE_NAME[p]}
                    title={PIECE_NAME[p]}
                    className="grid size-14 place-items-center rounded-xl bg-offwhite/8 ring-1 ring-offwhite/10 transition hover:bg-signal/25 hover:ring-signal"
                  >
                    <PieceSvg type={p} color={myColor} className="size-11" />
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Peças capturadas por uma cor e a vantagem de material. */
export function Captured({ s, color }: { s: ChessState; color: "w" | "b" }) {
  const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
  const ORDER = "qrbnp";
  // As peças que esta cor capturou são as que a outra perdeu.
  const taken = [...(color === "w" ? s.lost.b : s.lost.w)].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  const mine = taken.reduce((n, p) => n + (VALUE[p] ?? 0), 0);
  const theirs = (color === "w" ? s.lost.w : s.lost.b).reduce((n, p) => n + (VALUE[p] ?? 0), 0);
  const adv = mine - theirs;
  if (taken.length === 0) return null;
  return (
    <span className="flex min-w-0 items-center" aria-label={`${S.captured}: ${taken.length}`}>
      <span className="flex -space-x-1.5 overflow-hidden">
        {taken.map((p, i) => (
          <PieceSvg key={i} type={p} color={color === "w" ? "b" : "w"} className="size-4 shrink-0" />
        ))}
      </span>
      {adv > 0 && <span className="ml-1 text-[11px] font-medium tabular-nums text-slate">+{adv}</span>}
    </span>
  );
}
