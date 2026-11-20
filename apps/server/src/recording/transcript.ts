/**
 * Transcrição da gravação no formato do Meet, para o Portal de Reuniões ler do Drive como lê as
 * do Meet e mandar ao gestor de projetos (ata, aviso no grupo e tarefas na Gestão):
 * - nome do Doc "<título> - AAAA/MM/DD HH:MM GMT-03:00 - Transcrição";
 * - texto com a linha "Transcrição", marcas de tempo ("00:01:00") e uma fala por linha ("Nome: fala").
 * As frases vêm do navegador de cada pessoa (só a própria fala; ver apps/web/src/activities/reuniao/transcricao.ts).
 */

export interface Line {
  /** Milissegundos desde o começo da gravação. */
  at: number;
  name: string;
  text: string;
}

const MAX_TEXT = 500;
/** Teto de frases por gravação (4 h de conversa cabem com folga). */
export const MAX_LINES = 10_000;

/** Frase que chegou do navegador: texto limpo, ou null se não for texto. */
export function cleanLine(data: unknown): string | null {
  const t = (data as { text?: unknown } | null)?.text;
  if (typeof t !== "string") return null;
  return t.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT) || null;
}

/** "2026/11/20 14:05 GMT-03:00", como o Meet põe no nome dos arquivos (o portal acha a reunião por ele). */
export function meetStamp(at: number, timeZone: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "longOffset" })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  );
  // Em UTC o Intl escreve só "GMT"; o portal leria isso como -03:00.
  const tz = p.timeZoneName === "GMT" ? "GMT+00:00" : p.timeZoneName;
  return `${p.year}/${p.month}/${p.day} ${p.hour}:${p.minute} ${tz}`;
}

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, "0")).join(":");
};

/** Texto do Doc: cabeçalho, participantes e as falas, com uma marca de tempo a cada minuto de conversa. */
export function transcriptText(title: string, participants: readonly string[], lines: readonly Line[]): string {
  const out = [title, `Participantes: ${participants.join(", ")}`, "", "Transcrição"];
  let mark = -Infinity;
  for (const l of lines) {
    if (l.at - mark >= 60_000) {
      mark = l.at;
      out.push(clock(l.at));
    }
    // "Nome: fala" é como o portal separa quem falou; dois-pontos no nome confundiriam a leitura.
    out.push(`${l.name.replace(/:/g, " ")}: ${l.text}`);
  }
  return `${out.join("\n")}\n`;
}
