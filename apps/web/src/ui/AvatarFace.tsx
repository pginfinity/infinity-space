import { useId } from "react";
import type { AvatarLook } from "@infinity/world";

/** Retrato do avatar (de frente), usado na prévia da entrada e na lista de pessoas. */
export function AvatarFace({ look, size = 40, className }: { look: AvatarLook; size?: number; className?: string }) {
  const clip = useId();
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} aria-hidden>
      <defs>
        <clipPath id={clip}>
          <circle cx="50" cy="50" r="50" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect width="100" height="100" fill="#0A2547" />
        <path d="M14 104 C16 78 30 68 50 68 C70 68 84 78 86 104 Z" fill={look.color} />
        {look.hair === 3 && <path d="M28 52 C26 74 34 82 34 82 L66 82 C66 82 74 74 72 52 Z" fill={look.hairColor} />}
        <circle cx="50" cy="46" r="21" fill={look.skin} />
        {look.hair >= 1 && <path d="M28.5 45 C28 28 38 21 50 21 C62 21 72 28 71.5 45 C66 36 58 33 50 33 C42 33 34 36 28.5 45 Z" fill={look.hairColor} />}
        {look.hair === 2 && <circle cx="50" cy="20" r="9" fill={look.hairColor} />}
        <circle cx="42.5" cy="48" r="2.4" fill="#141414" />
        <circle cx="57.5" cy="48" r="2.4" fill="#141414" />
      </g>
    </svg>
  );
}
