import { useEffect, useRef } from "react";
import { DOMINO_TILES } from "@infinity/world";
import { drawCard, drawCardBack, drawChecker, drawTile, drawTileBack } from "./tableArt.ts";

/**
 * Canvas nítido (respeita a densidade da tela) desenhado com as mesmas funções da textura do tampo.
 * `k` é a chave do desenho: muda quando o conteúdo muda.
 */
export function ArtCanvas({ w, h, k, paint, className, fluid }: { w: number; h: number; k: string; paint: (ctx: CanvasRenderingContext2D) => void; className?: string; fluid?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    c.width = Math.max(1, Math.round(w * dpr));
    c.height = Math.max(1, Math.round(h * dpr));
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    paint(ctx);
    // `paint` muda a cada render; o que importa é a chave e o tamanho.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k, w, h]);
  // `fluid`: ocupa o espaço do pai (o desenho é feito no tamanho w × h e escala junto).
  return <canvas ref={ref} style={fluid ? { width: "100%", height: "100%" } : { width: w, height: h }} className={className} aria-hidden />;
}

/** Carta de frente (ou o verso, com `card` null). */
export function CardArt({ card, w, h, className }: { card: number | null; w: number; h: number; className?: string }) {
  return <ArtCanvas w={w} h={h} k={`c${card ?? "x"}`} className={className} paint={(ctx) => (card === null ? drawCardBack(ctx, 1, 1, w - 2, h - 2) : drawCard(ctx, card, 1, 1, w - 2, h - 2))} />;
}

/** Pedra de dominó (id) em pé ou deitada; `null` = virada para baixo. */
export function TileArt({ tile, w, h, className }: { tile: number | null; w: number; h: number; className?: string }) {
  const t = tile === null ? null : DOMINO_TILES[tile];
  return (
    <ArtCanvas
      w={w}
      h={h}
      k={`t${tile ?? "x"}`}
      className={className}
      paint={(ctx) => (t ? drawTile(ctx, t[0], t[1], 1, 1, w - 2, h - 2) : drawTileBack(ctx, 1, 1, w - 2, h - 2))}
    />
  );
}

/** Peça de damas (código da casa). */
export function CheckerArt({ piece, size, className, fluid }: { piece: number; size: number; className?: string; fluid?: boolean }) {
  return <ArtCanvas w={size} h={size} k={`p${piece}`} className={className} fluid={fluid} paint={(ctx) => drawChecker(ctx, piece, size / 2, size / 2, size * 0.44)} />;
}
