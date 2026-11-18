import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { clsx } from "clsx";
import { DOMINO_TILES, dominoFits, dominoPlayable, type DominoState } from "@infinity/world";
import { seatPlayerName, sendGame, type Table } from "./api.ts";
import { ArtCanvas, TileArt } from "./Art.tsx";
import { SNAKE_ROW, dominoSnake, drawTile } from "./tableArt.ts";
import { DOMINO_WOOD } from "./palette.ts";
import { S } from "./strings.ts";

interface Props {
  t: Table<DominoState>;
  seat: number;
  canMove: boolean;
}

/** Colunas da cobrinha no painel (7 pedras deitadas por fileira). */
const COLS = 14;

/** Largura de um elemento, acompanhando o redimensionamento. */
function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Nome de quem jogou num lugar (fica mesmo depois de levantar). */
const nameOf = (t: Table, seat: number) => t.state.players?.[seat] ?? seatPlayerName(t, seat) ?? S.seatFallback(seat);

/** Dominó: a fileira na mesa, o monte, a última jogada e a sua mão. */
export function DominoBoard({ t, seat, canMove }: Props) {
  const s = t.state;
  const hand = seat >= 0 ? (s.hands[seat] ?? []) : [];
  const playable = canMove ? dominoPlayable(s, hand) : [];
  // Pedra que serve nas duas pontas, esperando a escolha.
  const [choosing, setChoosing] = useState<number | null>(null);
  useEffect(() => setChoosing(null), [s.moves, s.round, canMove]);

  const play = (tile: number) => {
    const fits = dominoFits(tile, s.ends);
    const ambiguous = s.chain.length > 0 && fits.length === 2 && s.ends && s.ends[0] !== s.ends[1];
    if (ambiguous) setChoosing(choosing === tile ? null : tile);
    else sendGame(t.table, "move", { play: tile, ...(s.chain.length ? { end: fits.at(-1) } : {}) });
  };

  const last = s.last;
  const lastText = !last
    ? null
    : last.action === "play"
      ? S.dominoPlayed(nameOf(t, last.seat))
      : last.action === "draw"
        ? S.dominoDrew(nameOf(t, last.seat), last.drew ?? 1)
        : S.dominoPassed(nameOf(t, last.seat));
  const stuck = canMove && playable.length === 0;

  return (
    <div className="flex flex-col gap-2.5" data-domino>
      <Chain s={s} mark={choosing !== null} />
      <div className="flex min-h-5 flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-slate">
        <span aria-live="polite">{lastText}</span>
        {s.active.length > 0 && s.active.length < 4 && <span className="tabular-nums">{S.stock(s.stockCount)}</span>}
      </div>

      {seat >= 0 && t.phase === "playing" && s.active.includes(seat) && (
        <section aria-label={S.dominoHand} className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="label-caps">{S.dominoHand}</p>
            {canMove && s.chain.length === 0 && <p className="text-xs text-signal">{S.openWith}</p>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {hand.map((tile) => {
              const ok = playable.includes(tile);
              const [a, b] = DOMINO_TILES[tile] ?? [0, 0];
              return (
                <motion.button
                  key={tile}
                  type="button"
                  layout
                  disabled={!ok}
                  onClick={() => play(tile)}
                  aria-label={S.tile(a, b)}
                  aria-pressed={choosing === tile}
                  className={clsx(
                    "rounded-[7px] outline-none transition-[transform,opacity,box-shadow] focus-visible:ring-2 focus-visible:ring-signal",
                    ok ? "cursor-pointer hover:-translate-y-1" : "cursor-default",
                    !ok && canMove && "opacity-45",
                    choosing === tile ? "-translate-y-1.5 shadow-[0_0_0_3px_rgb(0_183_255)]" : ok && "shadow-[0_0_0_2px_rgb(0_183_255/0.55)]",
                  )}
                >
                  <TileArt tile={tile} w={30} h={58} />
                </motion.button>
              );
            })}
          </div>
          {choosing !== null && s.ends && (
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label={S.chooseEnd}>
              <span className="mr-auto text-xs text-offwhite/85">{S.chooseEnd}</span>
              {([0, 1] as const).map((end) => (
                <button
                  key={end}
                  type="button"
                  onClick={() => sendGame(t.table, "move", { play: choosing, end })}
                  className="rounded-lg bg-offwhite/8 px-3 py-2 text-xs font-semibold text-offwhite ring-1 ring-offwhite/15 transition-colors hover:bg-signal hover:text-space"
                >
                  {S.endChoice(s.ends![end])}
                </button>
              ))}
            </div>
          )}
          {stuck && (
            <div className="flex items-center justify-end gap-2">
              {s.stockCount > 0 ? (
                <button type="button" onClick={() => sendGame(t.table, "move", { draw: true })} className="rounded-lg bg-orange px-4 py-2 text-xs font-semibold text-offwhite transition-colors hover:bg-[#ff6d39]">
                  {S.buy}
                </button>
              ) : (
                <button type="button" onClick={() => sendGame(t.table, "move", { pass: true })} className="rounded-lg bg-orange px-4 py-2 text-xs font-semibold text-offwhite transition-colors hover:bg-[#ff6d39]">
                  {S.pass}
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {s.over && s.pips && (
        <ul className="flex flex-col gap-1.5 rounded-xl bg-offwhite/[0.035] p-2.5 ring-1 ring-offwhite/8" data-domino-reveal>
          {s.active.map((x) => (
            <li key={x} className="flex items-center gap-2">
              <span className="w-20 shrink-0 truncate text-xs text-offwhite/85">{nameOf(t, x)}</span>
              <span className="flex min-w-0 flex-1 flex-wrap gap-1">
                {(s.hands[x] ?? []).map((tile) => (
                  <TileArt key={tile} tile={tile} w={16} h={30} />
                ))}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-slate">{S.pips(s.pips?.[x] ?? 0)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A fileira de pedras em cobrinha, sobre o tampo de madeira. */
function Chain({ s, mark }: { s: DominoState; mark: boolean }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const { places, rows } = dominoSnake(s.chain, COLS);
  const cell = width > 0 ? width / (COLS + 1) : 0;
  // Altura justa para as fileiras (uma fileira de pedras + respiro); com uma fileira só, a cobrinha fica centralizada.
  const height = (Math.max(1, rows) * SNAKE_ROW - 0.3) * cell + cell * 1.2;
  const used = rows === 1 ? places.reduce((n, p) => n + p.w, 0) : COLS;
  const key = `${s.chain.map((l) => `${l.tile}:${l.a}`).join(",")}|${mark}|${width}`;
  return (
    <div
      ref={ref}
      className="relative w-full overflow-hidden rounded-xl shadow-[inset_0_2px_10px_rgb(0_0_0/0.45)] ring-1 ring-offwhite/10"
      style={{ background: `radial-gradient(120% 90% at 50% 40%, ${DOMINO_WOOD.mid} 0%, ${DOMINO_WOOD.top} 70%, ${DOMINO_WOOD.rim} 100%)`, minHeight: 84 }}
      role="img"
      aria-label={`${S.dominoTable}: ${s.chain.length ? `${S.tiles(s.chain.length)}, pontas ${s.ends?.[0]} e ${s.ends?.[1]}` : S.emptyChain}`}
    >
      {width > 0 && (
        <ArtCanvas
          w={width}
          h={Math.max(height, 84)}
          k={key}
          paint={(ctx) => {
            const ox = cell / 2 + ((COLS - used) / 2) * cell;
            const oy = cell * 0.6 + Math.max(0, (84 - height) / 2);
            places.forEach((p, i) => {
              const x = ox + p.x * cell;
              const y = oy + p.y * cell;
              const w = p.w * cell;
              const h = p.h * cell;
              ctx.fillStyle = "rgba(0,0,0,0.3)";
              ctx.fillRect(x + 2, y + 3, w - 2, h - 2);
              drawTile(ctx, p.first, p.second, x + 1, y + 1, w - 2, h - 2);
              if (mark && (i === 0 || i === places.length - 1)) {
                ctx.strokeStyle = "#00B7FF";
                ctx.lineWidth = 3;
                ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
              }
            });
          }}
        />
      )}
      {s.chain.length === 0 && <p className="absolute inset-0 grid place-items-center text-xs text-offwhite/60">{S.emptyChain}</p>}
    </div>
  );
}
