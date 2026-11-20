import { vivoDay, VIVO_TZ } from "../vivo/day.ts";
import { escClean } from "./common.ts";

/**
 * Painel do time no Átrio (a "TV do saguão"): metas da semana, aniversariantes, avisos do gestor
 * e o que subiu para produção (contado pelo Supremacy, por cliente, sem nome de pessoa).
 * Quem edita metas, avisos e a lista de aniversários é admin; todo mundo vê.
 * Da lista de aniversários, só os próximos 7 dias vão para todos (a lista inteira fica com o admin).
 */

export const PAINEL_ID = "painel";
export const PAINEL_KIND = "lobby-panel";
export const PAINEL_GOALS_MAX = 6;
export const PAINEL_GOAL_TEXT = 80;
export const PAINEL_NOTICES_MAX = 5;
export const PAINEL_NOTICE_TEXT = 200;
export const PAINEL_BIRTHDAYS_MAX = 300;
export const PAINEL_NAME_MAX = 40;
/** Dias à frente (contando hoje) que o painel mostra de aniversário. */
export const PAINEL_DAYS_AHEAD = 7;
/** Clientes no quadro do que subiu (os que mais subiram na semana). */
export const PAINEL_DEPLOYS_TOP = 8;
/** Distância máxima (m) do painel para editar. */
export const PAINEL_RANGE = 3.4;

export interface PainelNotice {
  id: string;
  text: string;
  at: number;
  /** Nome de quem publicou (como estava na hora). */
  by: string;
}
export interface PainelBirthday {
  name: string;
  day: number;
  month: number;
}
export interface PainelUpcoming extends PainelBirthday {
  today: boolean;
}
export interface PainelDeploy {
  client: string;
  deploys: number;
}
export interface PainelState {
  goals: string[];
  notices: PainelNotice[];
  /** Aniversários de hoje até daqui a 6 dias, na ordem do calendário. */
  birthdays: PainelUpcoming[];
  /** Deploys que foram ao ar nos últimos 7 dias, por cliente; null sem o Supremacy ligado. */
  deploys: PainelDeploy[] | null;
}

const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const leap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const dd = (n: number) => String(n).padStart(2, "0");

/** Metas, uma por linha (aceita "- " ou "• " no começo). */
export function painelParseGoals(text: unknown): string[] {
  if (typeof text !== "string") return [];
  return text
    .split(/\r?\n/)
    .map((l) => escClean(l.replace(/^\s*[-•*]\s*/, ""), PAINEL_GOAL_TEXT))
    .filter(Boolean)
    .slice(0, PAINEL_GOALS_MAX);
}

/** Aniversários, um por linha: "Ana 05/03" (também "Ana - 5/3", "Ana: 05/03"). Linha que não serve volta em `bad`. */
export function painelParseBirthdays(text: unknown): { list: PainelBirthday[]; bad: string[] } {
  const list: PainelBirthday[] = [];
  const bad: string[] = [];
  if (typeof text !== "string") return { list, bad };
  for (const raw of text.split(/\r?\n/)) {
    const line = escClean(raw, 80);
    if (!line) continue;
    const m = /^(.+?)[\s:–—-]+(\d{1,2})\/(\d{1,2})$/.exec(line);
    const day = Number(m?.[2]);
    const month = Number(m?.[3]);
    const name = escClean(m?.[1] ?? "", PAINEL_NAME_MAX);
    if (!m || !name || month < 1 || month > 12 || day < 1 || day > MONTH_DAYS[month - 1]!) bad.push(line);
    else if (list.length < PAINEL_BIRTHDAYS_MAX) list.push({ name, day, month });
  }
  return { list, bad };
}

export function painelPrintBirthdays(list: readonly PainelBirthday[]): string {
  return list.map((b) => `${b.name} ${dd(b.day)}/${dd(b.month)}`).join("\n");
}

/** Quem faz aniversário de hoje até daqui a 6 dias (no fuso do escritório). 29/02 comemora no 28/02 do ano que não é bissexto. */
export function painelUpcoming(list: readonly PainelBirthday[], now: number, tz: string = VIVO_TZ): PainelUpcoming[] {
  const [y, m, d] = vivoDay(now, tz).split("-").map(Number) as [number, number, number];
  const out: PainelUpcoming[] = [];
  for (let k = 0; k < PAINEL_DAYS_AHEAD; k++) {
    const t = new Date(Date.UTC(y, m - 1, d + k));
    const day = t.getUTCDate();
    const month = t.getUTCMonth() + 1;
    const feb28 = month === 2 && day === 28 && !leap(t.getUTCFullYear());
    const hits = list.filter((b) => b.month === month && (b.day === day || (feb28 && b.day === 29)));
    for (const b of [...hits].sort((a, c) => a.name.localeCompare(c.name, "pt-BR"))) out.push({ ...b, today: k === 0 });
  }
  return out;
}

/** Valida a resposta do Supremacy (`/api/deploys/por-cliente`), do que mais subiu para o que menos subiu. */
export function painelDeploys(data: unknown): PainelDeploy[] | null {
  const list = (data as { clientes?: unknown } | null)?.clientes;
  if (!Array.isArray(list)) return null;
  return list
    .map((c: { client?: unknown; deploys?: unknown }) => ({ client: escClean(c?.client, 40), deploys: typeof c?.deploys === "number" ? c.deploys : NaN }))
    .filter((c) => c.client && Number.isInteger(c.deploys) && c.deploys > 0)
    .sort((a, b) => b.deploys - a.deploys || a.client.localeCompare(b.client, "pt-BR"));
}

/**
 * Clientes que subiram desde a consulta anterior (para o confete). Sem consulta anterior, ninguém:
 * religar o servidor não comemora a semana inteira de novo. A janela de 7 dias que anda à
 * meia-noite só faz o número cair, então toda subida é deploy novo de verdade.
 */
export function painelDeployRise(prev: readonly PainelDeploy[] | null, next: readonly PainelDeploy[]): string[] {
  if (!prev) return [];
  const before = new Map(prev.map((p) => [p.client, p.deploys]));
  return next.filter((n) => n.deploys > (before.get(n.client) ?? 0)).map((n) => n.client);
}
