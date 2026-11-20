import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { clsx } from "clsx";
import { Maximize2, Minus, X } from "lucide-react";
import { create } from "zustand";
import { S } from "./strings.ts";

/**
 * Janela dos jogos de mesa e do arcade (xadrez, damas, lig 4, velha, dominó, truco, sinuca, hockey,
 * pingue-pongue): no meio da tela, ocupando a maior parte, com a barra de cima e a doca à vista.
 * No celular, a tela toda. Minimizar fecha a janela e deixa um botão para voltar; o lugar na mesa continua.
 */
export const GAME_WINDOW = clsx(
  "glass pointer-events-auto absolute z-30 flex flex-col overflow-hidden text-offwhite",
  "inset-0 pt-[env(safe-area-inset-top)]",
  // A largura fica com cada painel (depende do formato do tabuleiro).
  "sm:inset-x-0 sm:bottom-[84px] sm:top-16 sm:mx-auto sm:rounded-[var(--radius-panel)] sm:pt-0",
);

export const gameWindowMotion = {
  initial: { opacity: 0, scale: 0.98 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.98 },
  transition: { duration: 0.24, ease: [0.16, 1, 0.3, 1] },
} as const;

/**
 * Tabuleiro e lugares: no celular e em telas médias, um embaixo do outro (lugar de cima, tabuleiro,
 * lugar de baixo, rodapé); em telas largas, o tabuleiro à esquerda com a altura toda e o resto numa coluna.
 * `fill`: o tabuleiro (canvas) ocupa a altura que sobrar, em vez de ter altura própria.
 */
export function GameLayout({ top, board, bottom, side, fill }: { top: ReactNode; board: ReactNode; bottom: ReactNode; side: ReactNode; fill?: boolean }) {
  return (
    <div
      className={clsx(
        "grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_300px] lg:grid-rows-[auto_auto_minmax(0,1fr)] lg:gap-x-6",
        fill && "min-h-0 flex-1 grid-rows-[auto_minmax(200px,1fr)_auto_auto]",
      )}
    >
      <div className="lg:col-start-2 lg:row-start-1">{top}</div>
      <div className="flex min-h-0 flex-col justify-center lg:col-start-1 lg:row-span-3 lg:row-start-1">{board}</div>
      <div className="lg:col-start-2 lg:row-start-2">{bottom}</div>
      <div className="flex flex-col gap-2.5 lg:col-start-2 lg:row-start-3">{side}</div>
    </div>
  );
}

interface Minimized {
  title: string;
  restore: () => void;
}
const useMinimized = create<{ game: Minimized | null }>(() => ({ game: null }));
/** Há um jogo minimizado (com o botão de voltar à vista)? */
export const useMinimizedGame = () => useMinimized((s) => s.game !== null);

/** Minimizar e fechar, no canto da janela. Abrir a janela tira o botão de voltar. */
export function WindowButtons({ title, close, restore }: { title: string; close: () => void; restore: () => void }) {
  useEffect(() => useMinimized.setState({ game: null }), []);
  const btn = "rounded-lg p-2 text-slate transition-colors hover:bg-offwhite/8 hover:text-offwhite";
  return (
    <div className="-mr-1.5 flex shrink-0 items-center">
      <button
        type="button"
        onClick={() => {
          close();
          useMinimized.setState({ game: { title, restore } });
        }}
        className={btn}
        aria-label={S.minimize}
        title={S.minimize}
      >
        <Minus className="size-4" />
      </button>
      <button type="button" onClick={close} className={btn} aria-label={S.closeHint} title={S.closeHint}>
        <X className="size-4" />
      </button>
    </div>
  );
}

/** Jogo minimizado: um botão discreto no canto de cima para voltar (some ao reabrir ou ao dispensar). */
export function MinimizedGame() {
  const game = useMinimized((s) => s.game);
  return (
    <AnimatePresence>
      {game && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className="glass pointer-events-auto absolute left-3 top-16 flex items-center rounded-full text-sm"
        >
          <button type="button" onClick={game.restore} className="flex items-center gap-2 rounded-l-full py-1.5 pl-3 pr-2 transition-colors hover:text-signal">
            <Maximize2 className="size-3.5 text-signal" aria-hidden />
            <span className="font-medium">{S.restore(game.title)}</span>
          </button>
          <button type="button" onClick={() => useMinimized.setState({ game: null })} className="rounded-r-full py-1.5 pl-1 pr-2.5 text-slate transition-colors hover:text-offwhite" aria-label={S.close} title={S.close}>
            <X className="size-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
