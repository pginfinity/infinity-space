import type { FocoPhase, FocoVoteOp } from "@infinity/world";

/**
 * Textos do pacote "foco" em pt-BR. Ficam no pacote (e não no pt-BR.json geral) para vários pacotes
 * evoluírem ao mesmo tempo sem conflito, como nos outros pacotes de atividades.
 */

const PHASE: Record<FocoPhase, string> = { focus: "Foco", short: "Pausa", long: "Pausa longa" };
const PROPOSE: Record<FocoVoteOp, string> = { pause: "pausar", resume: "retomar", restart: "reiniciar" };

export const T = {
  title: "Mesa de foco",
  phase: (p: FocoPhase) => PHASE[p],
  /** "Foco 2 de 4" / "Pausa" / "Pausa longa". */
  phaseLong: (p: FocoPhase, round: number) => (p === "focus" ? `Foco ${round} de 4` : PHASE[p]),
  paused: "Pausado",
  idle: "Sente-se para focar",
  people: (n: number) => (n === 1 ? "só você na mesa" : `${n} na mesa`),
  together: "Um relógio para a mesa toda",
  pause: "Pausar",
  resume: "Retomar",
  restart: "Reiniciar",
  leave: "Sair da mesa",
  leaveShort: "Sair",
  agreeHint: "Vale quando todos na mesa concordarem",
  /** "Proposta: pausar · 1 de 3 concordam". */
  vote: (op: FocoVoteOp, yes: number, total: number) => `Proposta: ${PROPOSE[op]} · ${yes} de ${total} ${yes === 1 ? "concorda" : "concordam"}`,
  agree: "Concordar",
  withdraw: "Desistir",
  youAgreed: "Você concordou. Falta o resto da mesa.",
  toast: {
    focus: "De volta ao foco.",
    short: "Pausa de 5 minutos. Levante, alongue, beba água.",
    long: "Pausa longa: 15 minutos. Bom trabalho!",
    paused: "A mesa pausou o relógio.",
    resumed: "O relógio da mesa voltou a andar.",
    restarted: "A mesa recomeçou do zero.",
  },
  command: "Mesa de foco (Pomodoro)",
  commandHint: "Sentar na mesa de foco e entrar no ciclo do grupo",
  full: "A mesa de foco está cheia agora.",
  seatLabel: "Sentar e focar",
};
