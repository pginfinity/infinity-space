import { motion } from "motion/react";
import { PIECE_ART, PIECE_COLORS } from "./pieces.ts";
import { CHECKER, DISC, TTT_COLOR } from "./palette.ts";
import { CardArt, TileArt } from "./Art.tsx";

/** Peça de xadrez em SVG (mesmo desenho da textura do mundo). */
export function PieceSvg({ type, color, className }: { type: keyof typeof PIECE_ART; color: "w" | "b"; className?: string }) {
  const art = PIECE_ART[type];
  const c = PIECE_COLORS[color];
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <g strokeLinejoin="round" strokeLinecap="round" strokeWidth={3.2}>
        {art.body.map((d, i) => (
          <path key={i} d={d} fill={c.fill} stroke={c.stroke} />
        ))}
        {art.detail?.map((d, i) => <path key={`d${i}`} d={d} fill="none" stroke={c.detail} />)}
      </g>
    </svg>
  );
}

/** Ficha do Lig 4 em SVG. */
export function DiscSvg({ seat, className }: { seat: number; className?: string }) {
  const c = DISC[seat === 1 ? 1 : 0];
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <circle cx="50" cy="50" r="46" fill={c.rim} />
      <circle cx="50" cy="50" r="40" fill={c.fill} />
      <circle cx="50" cy="50" r="28" fill="none" stroke={c.rim} strokeOpacity="0.45" strokeWidth="4" />
      <path d="M26 38 A28 28 0 0 1 44 22" fill="none" stroke={c.shine} strokeOpacity="0.7" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

/** X ou O do jogo da velha. */
export function MarkSvg({ seat, className, animate }: { seat: number; className?: string; animate?: boolean }) {
  const color = TTT_COLOR[seat === 1 ? 1 : 0];
  // Sempre controlado pelo motion (pathLength = 1); só a marca nova parte do zero e se desenha.
  const draw = (delay = 0) => ({
    initial: animate ? { pathLength: 0 } : false,
    animate: { pathLength: 1 },
    transition: { duration: 0.32, delay, ease: [0.16, 1, 0.3, 1] as const },
  });
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      {seat === 1 ? (
        <motion.circle cx="50" cy="50" r="30" fill="none" stroke={color} strokeWidth="11" strokeLinecap="round" {...draw()} />
      ) : (
        <g stroke={color} strokeWidth="11" strokeLinecap="round">
          <motion.path d="M24 24 L76 76" {...draw()} />
          <motion.path d="M76 24 L24 76" {...draw(0.12)} />
        </g>
      )}
    </svg>
  );
}

/** Peça de damas em SVG (mesmo desenho do canvas, sem a coroa). */
export function CheckerSvg({ seat, className }: { seat: number; className?: string }) {
  const c = CHECKER[seat === 1 ? 1 : 0];
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <circle cx="50" cy="55" r="42" fill="rgb(0 0 0 / 0.28)" />
      <circle cx="50" cy="50" r="42" fill={c.rim} />
      <circle cx="50" cy="48" r="37" fill={c.fill} />
      <circle cx="50" cy="48" r="25" fill="none" stroke={c.ring} strokeWidth="4.5" />
    </svg>
  );
}

/** Número do lugar (mesas de quatro). Lugares 1 e 3 de uma cor, 2 e 4 de outra: as duplas. */
export function SeatNumber({ seat, className }: { seat: number; className?: string }) {
  const team = seat % 2;
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <circle cx="50" cy="50" r="44" fill={team === 0 ? "#0A2547" : "#F2F0EF"} stroke={team === 0 ? "#00B7FF" : "#8A93A3"} strokeWidth="7" />
      <text x="50" y="52" textAnchor="middle" dominantBaseline="central" fontSize="50" fontWeight="700" fontFamily="Geist, system-ui, sans-serif" fill={team === 0 ? "#F2F0EF" : "#0A2547"}>
        {seat + 1}
      </text>
    </svg>
  );
}

/** Ícone do lugar na mesa (rei da cor, ficha, marca, peça ou número do lugar). */
export function SeatToken({ kind, seat, className }: { kind: string; seat: number; className?: string }) {
  if (kind === "chess") return <PieceSvg type="k" color={seat === 1 ? "b" : "w"} className={className} />;
  if (kind === "tictactoe") return <MarkSvg seat={seat} className={className} />;
  if (kind === "checkers") return <CheckerSvg seat={seat} className={className} />;
  if (kind === "domino" || kind === "truco") return <SeatNumber seat={seat} className={className} />;
  return <DiscSvg seat={seat} className={className} />;
}

/** Ícone do jogo (cabeçalho do painel): o lugar 0, ou uma pedra/carta nos jogos de quatro. */
export function GameIcon({ kind, className }: { kind: string; className?: string }) {
  // 6-6 (id 27) e o ás de espadas (naipe 1, valor 7).
  if (kind === "domino") return <span className={`grid place-items-center ${className ?? ""}`}><TileArt tile={27} w={16} h={30} /></span>;
  if (kind === "truco") return <span className={`grid place-items-center ${className ?? ""}`}><CardArt card={17} w={22} h={32} /></span>;
  return <SeatToken kind={kind} seat={0} className={className} />;
}
