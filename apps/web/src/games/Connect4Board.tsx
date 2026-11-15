import { useId, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { clsx } from "clsx";
import { C4_COLS, C4_EMPTY, C4_ROWS, c4DropRow, type C4Cell, type Connect4State } from "@infinity/world";
import { sendGame, type Table } from "./api.ts";
import { C4_FRAME, DISC } from "./palette.ts";
import { S } from "./strings.ts";

interface Props {
  t: Table<Connect4State>;
  seat: number;
  canMove: boolean;
}

const CELL = 100;
const PAD = 16;
const W = C4_COLS * CELL + PAD * 2;
const H = C4_ROWS * CELL + PAD * 2;
const R_HOLE = 39;

const cx = (col: number) => PAD + col * CELL + CELL / 2;
const cy = (row: number) => PAD + row * CELL + CELL / 2;

/** Grade do Lig 4: clique (ou toque) numa coluna solta a ficha, que cai com animação. */
export function Connect4Board({ t, seat, canMove }: Props) {
  const s = t.state;
  const uid = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);

  // Só anima a ficha que caiu com o painel aberto.
  const openedAt = useRef({ round: s.round, moves: s.moves });
  const animateLast = s.last !== null && (s.round !== openedAt.current.round || s.moves > openedAt.current.moves);

  const inLine = useMemo(() => new Set((s.line ?? []).map((c) => c.row * C4_COLS + c.col)), [s.line]);
  const winStroke = useMemo(() => strokeOf(s.line), [s.line]);
  const holes = useMemo(() => {
    let d = `M14 0 H${W - 14} Q${W} 0 ${W} 14 V${H - 14} Q${W} ${H} ${W - 14} ${H} H14 Q0 ${H} 0 ${H - 14} V14 Q0 0 14 0 Z`;
    for (let r = 0; r < C4_ROWS; r++) for (let c = 0; c < C4_COLS; c++) d += ` M${cx(c) - R_HOLE} ${cy(r)} a${R_HOLE} ${R_HOLE} 0 1 0 ${R_HOLE * 2} 0 a${R_HOLE} ${R_HOLE} 0 1 0 ${-R_HOLE * 2} 0 Z`;
    return d;
  }, []);

  const drop = (col: number) => {
    if (!canMove || c4DropRow(s, col) < 0) return;
    sendGame(t.table, "move", { col });
  };

  const ghostRow = hover !== null && canMove ? c4DropRow(s, hover) : -1;
  const mySeat = seat === 1 ? 1 : 0;

  return (
    <div className="relative w-full touch-manipulation select-none" onPointerLeave={() => setHover(null)}>
      {/* Fileira de cima (só para quem joga): a ficha "na mão", sobre a coluna escolhida. */}
      {seat >= 0 && t.phase === "playing" && (
      <div className="relative w-full" style={{ aspectRatio: `${W} / ${CELL * 0.92}` }} aria-hidden>
        {canMove && hover !== null && ghostRow >= 0 && (
          <motion.div
            className="absolute top-[8%] h-[84%]"
            style={{ width: `${(CELL * 0.8 * 100) / W}%` }}
            initial={false}
            animate={{ left: `${((cx(hover) - CELL * 0.4) * 100) / W}%` }}
            transition={{ type: "spring", stiffness: 700, damping: 40 }}
          >
            <svg viewBox="0 0 100 100" className="h-full w-full drop-shadow-[0_6px_10px_rgb(0_0_0/0.45)]">
              <Disc seat={mySeat} x={50} y={50} r={46} />
            </svg>
          </motion.div>
        )}
      </div>
      )}

      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full drop-shadow-[0_14px_30px_rgb(0_0_0/0.55)]" role="img" aria-label={`Lig 4, ${s.moves} fichas`}>
        <defs>
          <linearGradient id={`frame-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={C4_FRAME.top} />
            <stop offset="1" stopColor={C4_FRAME.bottom} />
          </linearGradient>
          <clipPath id={`clip-${uid}`}>
            <rect width={W} height={H} rx="14" />
          </clipPath>
        </defs>

        <g clipPath={`url(#clip-${uid})`}>
          {/* Fundo visto pelos furos. */}
          <rect width={W} height={H} fill={C4_FRAME.hole} />

          {/* Fichas: ficam atrás da grade, então a queda passa "por dentro" dela. */}
          {s.grid.map((who, i) => {
            if (who === C4_EMPTY) return null;
            const col = i % C4_COLS;
            const row = Math.floor(i / C4_COLS);
            const isLast = s.last?.col === col && s.last?.row === row;
            const falls = animateLast && isLast;
            const dim = s.over && s.line && !inLine.has(i);
            const fallH = cy(row) + CELL;
            return (
              <motion.g
                key={falls ? `f${s.round}-${s.moves}` : `d${i}`}
                initial={falls ? { y: -fallH } : false}
                animate={{ y: falls ? [-fallH, 0, -Math.min(36, fallH * 0.08), 0] : 0, opacity: dim ? 0.6 : 1 }}
                transition={{
                  y: falls ? { duration: 0.32 + row * 0.05, times: [0, 0.62, 0.8, 1], ease: ["easeIn", "easeOut", "easeIn"] } : { duration: 0 },
                  opacity: { duration: 0.5, delay: 0.25 },
                }}
              >
                <Disc seat={who} x={cx(col)} y={cy(row)} r={R_HOLE + 3} />
              </motion.g>
            );
          })}

          {/* Grade azul com os furos. */}
          <path d={holes} fill={`url(#frame-${uid})`} fillRule="evenodd" />
          {Array.from({ length: C4_ROWS * C4_COLS }, (_, i) => (
            <circle key={i} cx={cx(i % C4_COLS)} cy={cy(Math.floor(i / C4_COLS))} r={R_HOLE} fill="none" stroke={C4_FRAME.holeRim} strokeWidth="4" />
          ))}
          <rect x="1.5" y="1.5" width={W - 3} height={H - 3} rx="13" fill="none" stroke={C4_FRAME.edge} strokeOpacity="0.55" strokeWidth="3" />

          {/* Coluna sob o cursor. */}
          {canMove && hover !== null && ghostRow >= 0 && <rect x={PAD + hover * CELL} y={0} width={CELL} height={H} fill="#FFFFFF" opacity="0.07" />}

          {/* Traço ligando as fichas da linha vencedora. */}
          {s.over && winStroke && (
            <motion.line
              x1={cx(winStroke[0].col)}
              y1={cy(winStroke[0].row)}
              x2={cx(winStroke[1].col)}
              y2={cy(winStroke[1].row)}
              stroke="#F2F0EF"
              strokeWidth="12"
              strokeLinecap="round"
              strokeOpacity="0.9"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.5, delay: 0.55, ease: [0.16, 1, 0.3, 1] }}
            />
          )}

          {/* Linha vencedora: anel pulsando em volta das fichas. */}
          {s.over &&
            s.line?.map((c) => (
              <motion.circle
                key={`w${c.col}-${c.row}`}
                cx={cx(c.col)}
                cy={cy(c.row)}
                r={R_HOLE + 1}
                fill="none"
                stroke="#F2F0EF"
                strokeWidth="7"
                initial={{ opacity: 0, scale: 1.3 }}
                animate={{ opacity: [0, 1, 0.55, 1], scale: 1 }}
                transition={{ duration: 1.4, delay: 0.35, ease: "easeOut" }}
                style={{ transformOrigin: `${cx(c.col)}px ${cy(c.row)}px`, transformBox: "view-box" }}
              />
            ))}

          {/* Marca discreta na última ficha. */}
          {s.last && !s.over && <circle cx={cx(s.last.col)} cy={cy(s.last.row)} r="7" fill={s.grid[s.last.row * C4_COLS + s.last.col] === 1 ? "#0A2547" : "#F2F0EF"} opacity="0.85" />}
        </g>
      </svg>

      {/* Colunas clicáveis por cima de tudo (mouse, toque e teclado). */}
      <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `${(PAD * 100) / W}% repeat(${C4_COLS}, 1fr) ${(PAD * 100) / W}%` }}>
        <span />
        {Array.from({ length: C4_COLS }, (_, col) => {
          const full = c4DropRow(s, col) < 0;
          return (
            <button
              key={col}
              type="button"
              aria-label={S.column(col + 1)}
              disabled={!canMove || full}
              onPointerEnter={() => setHover(col)}
              onFocus={() => setHover(col)}
              onClick={() => drop(col)}
              className={clsx("h-full rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal", canMove && !full ? "cursor-pointer" : "cursor-default")}
            />
          );
        })}
        <span />
      </div>
    </div>
  );
}

/** Pontas do traço da linha vencedora, se as casas estiverem todas numa reta (duas linhas cruzadas: sem traço). */
function strokeOf(line: C4Cell[] | null): [C4Cell, C4Cell] | null {
  if (!line || line.length < 2) return null;
  const sorted = [...line].sort((a, b) => a.col - b.col || a.row - b.row);
  const a = sorted[0]!;
  const b = sorted[sorted.length - 1]!;
  const dc = Math.sign(b.col - a.col);
  const dr = Math.sign(b.row - a.row);
  const steps = Math.max(Math.abs(b.col - a.col), Math.abs(b.row - a.row));
  if (steps + 1 !== line.length) return null;
  for (let k = 0; k <= steps; k++) if (!line.some((c) => c.col === a.col + dc * k && c.row === a.row + dr * k)) return null;
  return [a, b];
}

/** Ficha desenhada dentro de um SVG. */
function Disc({ seat, x, y, r }: { seat: number; x: number; y: number; r: number }) {
  const c = DISC[seat === 1 ? 1 : 0];
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={c.rim} />
      <circle cx={x} cy={y} r={r * 0.87} fill={c.fill} />
      <circle cx={x} cy={y} r={r * 0.6} fill="none" stroke={c.rim} strokeOpacity="0.45" strokeWidth={r * 0.09} />
      <path d={`M${x - r * 0.52} ${y - r * 0.26} A${r * 0.6} ${r * 0.6} 0 0 1 ${x - r * 0.14} ${y - r * 0.58}`} fill="none" stroke={c.shine} strokeOpacity="0.75" strokeWidth={r * 0.11} strokeLinecap="round" />
    </g>
  );
}
