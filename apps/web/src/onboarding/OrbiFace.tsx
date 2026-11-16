import { useId } from "react";
import { clsx } from "clsx";

/**
 * Retrato do Orbi para a interface (o mesmo robô do mundo: casco branco, visor escuro, olhos
 * azul-sinal e a luz laranja na antena). Pisca e flutua; `happy` troca os olhos por arquinhos ^ ^.
 */
export function OrbiFace({ size = 48, happy = false, still = false, className }: { size?: number; happy?: boolean; still?: boolean; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={clsx(!still && "orbi-bob", className)} aria-hidden>
      <defs>
        <linearGradient id={`${id}-shell`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.62" stopColor="#F2F0EF" />
          <stop offset="1" stopColor="#CFCBC8" />
        </linearGradient>
      </defs>
      {/* antena */}
      <line x1="32" y1="15" x2="32" y2="6.5" stroke="#33445B" strokeWidth="2" strokeLinecap="round" />
      <circle cx="32" cy="5.5" r="5.5" fill="#EE5C29" className={clsx(!still && "orbi-pulse")} opacity="0.22" />
      <circle cx="32" cy="5.5" r="3" fill="#EE5C29" />
      {/* "orelhas" */}
      <rect x="5.5" y="30" width="6" height="11" rx="2.5" fill="#0A2547" />
      <rect x="52.5" y="30" width="6" height="11" rx="2.5" fill="#0A2547" />
      {/* casco */}
      <ellipse cx="32" cy="36" rx="21.5" ry="20.5" fill={`url(#${id}-shell)`} />
      {/* visor */}
      <rect x="16.5" y="24.5" width="31" height="21" rx="10.5" fill="#071A33" />
      <rect x="20" y="26.5" width="11" height="2.2" rx="1.1" fill="#FFFFFF" opacity="0.12" />
      {happy ? (
        <g stroke="#00B7FF" strokeWidth="2.8" strokeLinecap="round" fill="none">
          <path d="M22.5 37.5 q3.8 -5.6 7.6 0" />
          <path d="M33.9 37.5 q3.8 -5.6 7.6 0" />
        </g>
      ) : (
        <g className={clsx(!still && "orbi-blink")} fill="#00B7FF">
          <rect x="23.5" y="29.5" width="5.5" height="10.5" rx="2.75" />
          <rect x="35" y="29.5" width="5.5" height="10.5" rx="2.75" />
        </g>
      )}
    </svg>
  );
}
