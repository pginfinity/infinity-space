import { useId } from "react";
import type { AvatarLook } from "@infinity/world";

/** Retrato do avatar chibi (de frente), para listas e cabeçalhos. Segue o mesmo visual do 3D. */
export function AvatarFace({ look, size = 40, className }: { look: AvatarLook; size?: number; className?: string }) {
  const clip = useId();
  const h = look.hairColor;
  const hair = look.hair;
  const glasses = look.acc.find((a) => a <= 2);
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} aria-hidden>
      <defs>
        <clipPath id={clip}>
          <circle cx="50" cy="50" r="50" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect width="100" height="100" fill="#0A2547" />
        {/* Cabelo atrás (longo, tranças, chanel). */}
        {(hair === 5 || hair === 10) && <path d="M24 46 C22 80 30 92 32 96 L68 96 C70 92 78 80 76 46 Z" fill={h} />}
        {hair === 8 && <path d="M22 44 C20 70 26 76 30 76 L70 76 C74 76 80 70 78 44 Z" fill={h} />}
        {hair === 4 && <circle cx="50" cy="38" r="36" fill={h} />}
        {/* Corpo. */}
        <path d="M18 104 C20 82 32 74 50 74 C68 74 80 82 82 104 Z" fill={look.top === 3 || look.top === 7 ? look.topColor2 : look.topColor} />
        {(look.top === 3 || look.top === 7) && (
          <>
            <path d="M18 104 C20 82 32 74 46 74 L44 104 Z" fill={look.topColor} />
            <path d="M82 104 C80 82 68 74 54 74 L56 104 Z" fill={look.topColor} />
          </>
        )}
        {/* Cabeça. */}
        <ellipse cx="50" cy="47" rx="27" ry="26" fill={look.skin} />
        <circle cx="22.5" cy="49" r="4.5" fill={look.skin} />
        <circle cx="77.5" cy="49" r="4.5" fill={look.skin} />
        {/* Cabelo por cima. */}
        {hair !== 11 && hair !== 4 && (
          <path d={hair === 0 ? "M24 42 C24 26 36 19 50 19 C64 19 76 26 76 42 C70 34 60 31 50 31 C40 31 30 34 24 42 Z" : "M22.5 45 C21 26 35 17 50 17 C65 17 79 26 77.5 45 C72 34 62 30 50 30 C38 30 28 34 22.5 45 Z"} fill={h} />
        )}
        {hair === 2 && <ellipse cx="52" cy="20" rx="17" ry="9" fill={h} />}
        {hair === 3 && [22, 32, 42, 52, 62, 72, 78].map((x, i) => <circle key={x} cx={x} cy={i % 2 ? 24 : 30} r="8" fill={h} />)}
        {hair === 7 && <circle cx="50" cy="14" r="9" fill={h} />}
        {hair === 6 && <ellipse cx="78" cy="40" rx="6" ry="14" fill={h} />}
        {hair === 9 && <path d="M44 22 L50 6 L56 22 Z M46 30 L50 14 L54 30 Z" fill={h} />}
        {/* Rosto. */}
        <circle cx="41" cy="50" r="3.2" fill="#1B1714" />
        <circle cx="59" cy="50" r="3.2" fill="#1B1714" />
        <circle cx="40" cy="48.8" r="1" fill="#fff" />
        <circle cx="58" cy="48.8" r="1" fill="#fff" />
        <ellipse cx="34" cy="58" rx="4.5" ry="2.6" fill="#FF7882" opacity="0.35" />
        <ellipse cx="66" cy="58" rx="4.5" ry="2.6" fill="#FF7882" opacity="0.35" />
        {(look.facial === 2 || look.facial === 3) && <path d="M26 52 C28 72 40 78 50 78 C60 78 72 72 74 52 C70 64 62 68 50 68 C38 68 30 64 26 52 Z" fill={h} opacity={look.facial === 2 ? 0.6 : 1} />}
        {(look.facial === 1 || look.facial === 4) && <path d="M42 61 C46 58 54 58 58 61 C54 60 46 60 42 61 Z" fill={h} stroke={h} strokeWidth="2" />}
        <path d="M44 63 Q50 68 56 63" stroke="#1B1714" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        {glasses !== undefined && (
          <g fill={glasses === 2 ? "#15171C" : "none"} stroke={look.accColor} strokeWidth="2.2">
            <circle cx="41" cy="50" r="6.5" />
            <circle cx="59" cy="50" r="6.5" />
            <path d="M47.5 50 L52.5 50" />
          </g>
        )}
        {look.acc.includes(4) && <path d="M22 40 C22 24 36 16 50 16 C64 16 78 24 78 40 Z M50 36 L86 40 L84 44 L50 41 Z" fill={look.accColor} />}
        {look.acc.includes(5) && <path d="M21 42 C21 22 35 13 50 13 C65 13 79 22 79 42 Z" fill={look.accColor} />}
      </g>
    </svg>
  );
}
