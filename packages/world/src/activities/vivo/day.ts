/** Fuso do escritório: o "dia" dos contadores do time vira à meia-noite de Florianópolis. */
export const VIVO_TZ = "America/Sao_Paulo";

/** Dia do calendário ("AAAA-MM-DD") de um instante, no fuso do escritório. */
export function vivoDay(at: number, tz: string = VIVO_TZ): string {
  try {
    // sv-SE formata como AAAA-MM-DD.
    return new Intl.DateTimeFormat("sv-SE", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  } catch {
    const d = new Date(at);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
}

/** Número pseudoaleatório estável de 0 a 1 a partir de um texto (FNV-1a). */
export function vivoHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}
