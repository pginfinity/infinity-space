import type { Status } from "@infinity/world";

/**
 * Status automático por inatividade (regra pura). A pessoa escolhe depois de quantos minutos sem
 * mexer fica "Ausente" (ou desliga). Só troca Disponível → Ausente, e só desfaz o que ela mesma fez:
 * se a pessoa mudou o status na mão nesse meio-tempo, esquece o automático.
 * Nada disso sai do computador além do próprio status.
 */

/** Opções do painel (minutos; 0 = desligado). */
export const AWAY_CHOICES = [0, 5, 10, 15, 30] as const;

export type AwayDecision = "away" | "back" | "forget" | null;

export interface AwayInput {
  status: Status;
  /** O "Ausente" atual foi posto pelo automático. */
  auto: boolean;
  /** Tempo desde o último sinal de uso local (teclado, mouse, toque, foco). */
  idleMs: number;
  /** Limite escolhido, em ms (0 = desligado). */
  limitMs: number;
}

export function awayDecision({ status, auto, idleMs, limitMs }: AwayInput): AwayDecision {
  if (auto) {
    // A pessoa trocou o status na mão: o automático não mexe mais.
    if (status !== "away") return "forget";
    // Voltou a mexer, ou desligou o automático: volta para Disponível.
    return limitMs === 0 || idleMs < limitMs ? "back" : null;
  }
  return limitMs > 0 && status === "available" && idleMs >= limitMs ? "away" : null;
}

/** Normaliza a escolha salva (valores antigos ou estranhos viram "desligado"). */
export function awayChoice(v: unknown): (typeof AWAY_CHOICES)[number] {
  return (AWAY_CHOICES as readonly unknown[]).includes(v) ? (v as (typeof AWAY_CHOICES)[number]) : 0;
}
