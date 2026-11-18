import type { Lens } from "@infinity/world";
import { useQuality } from "./quality.ts";
import { Sky } from "./sky/Sky.tsx";

/**
 * O lado de fora da estação: o céu real sobre São Paulo e a Terra lá embaixo (ver sky/Sky.tsx e astro/).
 * O 2D desenha em meia resolução e o modo leve do 3D economiza memória: os dois usam texturas menores.
 * No 2D a Terra fica um pouco mais escura, para compor com a pixel art. Sem lente (telescópio): resolução cheia.
 */
export function Space({ lens }: { lens?: Lens }) {
  const quality = useQuality((s) => s.mode);
  return <Sky tier={lens === "2d" || quality === "leve" ? "leve" : "cheia"} exposure={lens === "2d" ? 0.6 : 1} />;
}
