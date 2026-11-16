import { PaletteButton } from "./Palette.tsx";
import { PipButton } from "./PipView.tsx";

const BASE = "grid size-10 place-items-center rounded-xl transition-colors";
const IDLE = `${BASE} text-offwhite/80 hover:bg-offwhite/8 hover:text-offwhite`;
const ACTIVE = `${BASE} bg-offwhite/12 text-offwhite`;

/** Botões da presença na doca: busca e comandos (Ctrl+K) e janela flutuante (quando há vídeo). */
export function PresenceDock() {
  return (
    <>
      <PaletteButton className={IDLE} />
      <PipButton className={IDLE} activeClassName={ACTIVE} />
    </>
  );
}
