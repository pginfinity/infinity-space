/** Cores e formas das alternativas (A, B, C, D): forma + letra, nunca só cor. */
export const OPTION_STYLE = [
  { color: "#00B7FF", shape: "tri" },
  { color: "#9B8CFF", shape: "dia" },
  { color: "#F2B134", shape: "cir" },
  { color: "#E85D9A", shape: "sq" },
] as const;

export function OptionGlyph({ i, className }: { i: number; className?: string }) {
  const s = OPTION_STYLE[i]!;
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden>
      {s.shape === "tri" && <path d="M10 3 L18 17 H2 Z" fill={s.color} />}
      {s.shape === "dia" && <path d="M10 2 L18 10 L10 18 L2 10 Z" fill={s.color} />}
      {s.shape === "cir" && <circle cx="10" cy="10" r="7.5" fill={s.color} />}
      {s.shape === "sq" && <rect x="3" y="3" width="14" height="14" rx="2" fill={s.color} />}
    </svg>
  );
}
