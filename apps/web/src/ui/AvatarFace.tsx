import { useId } from "react";
import type { AvatarLook } from "@infinity/world";

/** Retrato do avatar (de frente), para listas e cabeçalhos. Segue o boneco 3D: cabeça quadrada, cabelo em bloco. */
export function AvatarFace({ look, size = 40, className }: { look: AvatarLook; size?: number; className?: string }) {
  const clip = useId();
  const h = look.hairColor;
  // mesmo índice do criador (avatar/build.ts); fora da lista vale o "Curto", como no 3D
  const hair = look.hair >= 0 && look.hair <= 11 ? look.hair : 1;
  // boné e gorro vão por cima de um cabelo curto (o 3D troca o cabelo pelo do pacote feito para ir por baixo)
  const hat = look.acc.includes(4) ? 4 : look.acc.includes(5) ? 5 : null;
  const glasses = look.acc.find((a) => a <= 2);
  const inner = look.top === 3 || look.top === 7;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} aria-hidden>
      <defs>
        <clipPath id={clip}>
          <circle cx="50" cy="50" r="50" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect width="100" height="100" fill="#0A2547" />
        {/* Cabelo atrás da cabeça (black power, longo, rabo de cavalo, tranças). */}
        {hat === null && hair === 4 && <rect x="11" y="6" width="78" height="58" rx="12" fill={h} />}
        {hat === null && hair === 5 && <rect x="17" y="30" width="66" height="70" rx="8" fill={h} />}
        {hat === null && hair === 6 && <rect x="74" y="36" width="14" height="38" rx="5" fill={h} />}
        {hat === null &&
          hair === 10 &&
          [12, 79].map((x) => (
            <g key={x}>
              <rect x={x} y="44" width="9" height="13" rx="2" fill={h} />
              <rect x={x + 0.5} y="57" width="8" height="13" rx="2" fill={h} />
              <rect x={x + 1} y="70" width="7" height="12" rx="2" fill={h} />
              <rect x={x + 1.5} y="82" width="6" height="5" rx="1" fill={look.accColor} />
            </g>
          ))}
        {/* Corpo. */}
        <rect x="16" y="82" width="68" height="30" rx="10" fill={inner ? look.topColor2 : look.topColor} />
        {inner && <path d="M16 112 L16 92 Q16 82 26 82 L44 82 L50 100 L56 82 L74 82 Q84 82 84 92 L84 112 Z" fill={look.topColor} />}
        {/* Cabeça e orelhas. */}
        <rect x="15" y="50" width="8" height="13" rx="2" fill={look.skin} />
        <rect x="77" y="50" width="8" height="13" rx="2" fill={look.skin} />
        <rect x="21" y="22" width="58" height="60" rx="9" fill={look.skin} />
        {/* Cabelo por cima. */}
        {hat === null && <Hair style={hair} color={h} />}
        {hat !== null && (
          <>
            <rect x="20" y="36" width="6" height="12" fill={h} />
            <rect x="74" y="36" width="6" height="12" fill={h} />
          </>
        )}
        {/* Rosto. */}
        {(look.facial === 2 || look.facial === 3) && (
          <path d="M21 60 L21 73 Q21 82 30 82 L70 82 Q79 82 79 73 L79 60 L71 62 L71 70 Q71 75 65 75 L35 75 Q29 75 29 70 L29 62 Z" fill={h} opacity={look.facial === 2 ? 0.6 : 1} />
        )}
        <rect x="37.5" y="54" width="5" height="6" rx="2" fill="#1B1714" />
        <rect x="57.5" y="54" width="5" height="6" rx="2" fill="#1B1714" />
        <ellipse cx="32" cy="66" rx="4.5" ry="2.6" fill="#FF7882" opacity="0.35" />
        <ellipse cx="68" cy="66" rx="4.5" ry="2.6" fill="#FF7882" opacity="0.35" />
        {look.facial !== 0 && <rect x="41" y="64" width="18" height="4" rx="2" fill={h} />}
        {look.facial === 4 && <rect x="46" y="72" width="8" height="6" rx="2" fill={h} />}
        <path d="M45 69.5 Q50 73.5 55 69.5" stroke="#1B1714" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        {glasses !== undefined && (
          <g fill={glasses === 2 ? "#15171C" : "none"} stroke={glasses === 2 ? "#15171C" : look.accColor} strokeWidth="2.2">
            {glasses === 0 ? (
              <>
                <circle cx="40" cy="57" r="6.5" />
                <circle cx="60" cy="57" r="6.5" />
              </>
            ) : (
              <>
                <rect x="32.5" y="51.5" width="15" height="11" rx="2" />
                <rect x="52.5" y="51.5" width="15" height="11" rx="2" />
              </>
            )}
            <path d="M47 57 L53 57" fill="none" />
          </g>
        )}
        {look.acc.includes(6) && (
          <>
            <circle cx="19" cy="66" r="2.6" fill={look.accColor} />
            <circle cx="81" cy="66" r="2.6" fill={look.accColor} />
          </>
        )}
        {/* Chapéus e fone por cima de tudo. */}
        {hat === 4 && (
          <>
            <rect x="19" y="13" width="62" height="27" rx="9" fill={look.accColor} />
            <rect x="17" y="34" width="66" height="7" rx="2" fill={look.accColor} />
            <rect x="17" y="34" width="66" height="7" rx="2" fill="#000" opacity="0.18" />
          </>
        )}
        {hat === 5 && (
          <>
            <rect x="18" y="10" width="64" height="32" rx="11" fill={look.accColor} />
            <rect x="17" y="33" width="66" height="10" rx="3" fill={look.accColor} />
            <rect x="17" y="33" width="66" height="10" rx="3" fill="#000" opacity="0.15" />
          </>
        )}
        {look.acc.includes(3) && (
          <g fill={look.accColor}>
            <path d="M17 52 L17 34 Q17 12 50 12 Q83 12 83 34 L83 52" fill="none" stroke={look.accColor} strokeWidth="4" />
            <rect x="11" y="46" width="11" height="18" rx="3" />
            <rect x="78" y="46" width="11" height="18" rx="3" />
          </g>
        )}
      </g>
    </svg>
  );
}

/** Cabelo de cada opção do criador, na ordem de HAIR_STYLES (avatar/catalog.ts). */
function Hair({ style, color }: { style: number; color: string }) {
  if (style === 11) return null;
  // moicano: só a faixa do meio
  if (style === 9) return <rect x="42" y="8" width="16" height="30" rx="3" fill={color} />;
  return (
    <g fill={color}>
      {/* base: topo da cabeça e costeletas */}
      <rect x="19" y="18" width="62" height="18" rx="8" />
      <rect x="19" y="28" width="7" height={style === 5 ? 44 : 18} />
      <rect x="74" y="28" width="7" height={style === 5 ? 44 : 18} />
      {style === 0 && <path d="M24 22 L28 8 L35 20 L42 5 L49 20 L56 6 L63 20 L70 8 L76 22 Z" />}
      {style === 2 && <rect x="30" y="9" width="40" height="18" rx="6" />}
      {style === 4 && <rect x="13" y="6" width="74" height="31" rx="10" />}
      {style === 3 && <path d="M19 30 L19 46 Q30 38 54 34 L81 34 L81 30 Z" />}
      {style === 7 && <rect x="39" y="4" width="22" height="18" rx="6" />}
      {style === 8 && <rect x="19" y="30" width="62" height="6" rx="1" fill="#E25B4B" />}
    </g>
  );
}
