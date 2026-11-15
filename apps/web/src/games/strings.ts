import type { EndReason } from "@infinity/world";

/**
 * Textos dos jogos em pt-BR. Ficam aqui (e não no i18n geral) para não conflitar
 * com quem está editando o pt-BR.json ao mesmo tempo. Quando estabilizar, migram para lá.
 */

export const GAME_TITLE: Record<string, string> = {
  chess: "Xadrez",
  connect4: "Lig 4",
  tictactoe: "Jogo da velha",
};

/** Nome de cada lugar, por jogo. */
export const SEAT_NAME: Record<string, string[]> = {
  chess: ["Brancas", "Pretas"],
  connect4: ["Laranja", "Branco"],
  tictactoe: ["Xis", "Bola"],
};

export const S = {
  close: "Fechar",
  closeHint: "Fechar (Esc)",
  you: "você",
  waiting: "Aguardando jogadores",
  waitingOne: "Falta um jogador",
  playing: "Partida em andamento",
  finished: "Fim de jogo",
  sitAs: (seat: string) => `Sentar como ${seat}`,
  emptySeat: "Lugar vago",
  walking: "Indo até a mesa…",
  tooFar: "Chegue mais perto da mesa para sentar.",
  noPath: "Não achei caminho até a mesa.",
  busyElsewhere: "Termine sua outra partida antes.",
  stand: "Levantar",
  resign: "Desistir",
  resignConfirm: "Desistir mesmo?",
  resignYes: "Sim, desistir",
  cancel: "Cancelar",
  rematch: "Revanche",
  rematchWaiting: (name: string) => `Esperando ${name} aceitar…`,
  rematchOffer: (name: string) => `${name} quer revanche`,
  rematchAccept: "Aceitar revanche",
  rematchCancel: "Cancelar pedido",
  yourTurn: "Sua vez",
  turnOf: (name: string) => `Vez de ${name}`,
  check: "Xeque!",
  spectating: "Você está assistindo ao vivo",
  spectatingHint: "Sente num lugar vago para jogar.",
  waitingOpponent: "Esperando alguém sentar do outro lado.",
  waitingShort: "Aguardando…",
  turnShort: "Vez",
  winnerTag: "Venceu",
  waitingStart: "A partida começa quando os dois lugares estiverem ocupados.",
  youWon: "Você venceu!",
  youLost: "Você perdeu",
  won: (name: string) => `${name} venceu!`,
  draw: "Empate",
  lastGame: "Última partida",
  captured: "Capturadas",
  moves: (n: number) => (n === 1 ? "1 lance" : `${n} lances`),
  promoteTitle: "Promover peão",
  column: (n: number) => `Coluna ${n}`,
  cell: (n: number) => `Casa ${n}`,
  square: (sq: string) => `Casa ${sq}`,
  noTable: "Esta mesa não está disponível.",
};

/** Explicação curta do fim de jogo. `loser` é o nome de quem perdeu (desistência/abandono). */
export function endReasonText(reason: EndReason | null, loser: string | null): string {
  switch (reason) {
    case "line":
      return "Linha completa";
    case "checkmate":
      return "Xeque-mate";
    case "stalemate":
      return "Afogamento";
    case "repetition":
      return "Repetição de posição";
    case "fifty":
      return "Regra dos 50 lances";
    case "material":
      return "Material insuficiente";
    case "full":
      return "Tabuleiro cheio";
    case "resign":
      return loser ? `${loser} desistiu` : "Desistência";
    case "left":
      return loser ? `${loser} saiu da mesa` : "Abandono";
    default:
      return "";
  }
}

export const PIECE_NAME: Record<string, string> = {
  p: "Peão",
  n: "Cavalo",
  b: "Bispo",
  r: "Torre",
  q: "Dama",
  k: "Rei",
};
