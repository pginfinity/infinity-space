/**
 * O escritório fica aberto o dia todo: quantos quadros a cena desenha conforme o uso.
 * Na frente e em uso: todo quadro. Parado (ninguém andando, sem tela compartilhada, sem mexer no
 * mouse ou no teclado): ~15 por segundo. Outra janela em foco: ~8. Aba escondida: o navegador já para.
 */

/** Intervalo entre quadros com outra janela em foco (ms). */
export const BLUR_MS = 125;
/** Intervalo entre quadros parado (ms). */
export const IDLE_MS = 66;
/**
 * Sem mexer por este tempo, conta como parado. Maior que os 15 s que o perfWatch mede com a janela
 * em foco (e o foco conta como mexer): a medição do modo leve termina antes e não vê o freio.
 */
export const IDLE_AFTER_MS = 30_000;

/** Intervalo entre quadros desenhados (ms); 0 = todo quadro. */
export function frameInterval(s: { focused: boolean; idleFor: number; moving: boolean; sharing: boolean }): number {
  if (!s.focused) return BLUR_MS;
  return s.idleFor >= IDLE_AFTER_MS && !s.moving && !s.sharing ? IDLE_MS : 0;
}
