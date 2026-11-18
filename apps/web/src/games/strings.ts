import type { EndReason } from "@infinity/world";

/**
 * Textos dos jogos em pt-BR. Ficam aqui (e não no i18n geral) para não conflitar
 * com quem está editando o pt-BR.json ao mesmo tempo. Quando estabilizar, migram para lá.
 */

export const GAME_TITLE: Record<string, string> = {
  chess: "Xadrez",
  connect4: "Lig 4",
  tictactoe: "Jogo da velha",
  checkers: "Damas",
  domino: "Dominó",
  truco: "Truco",
};

/** Nome de cada lugar, por jogo. */
export const SEAT_NAME: Record<string, string[]> = {
  chess: ["Brancas", "Pretas"],
  connect4: ["Laranja", "Branco"],
  tictactoe: ["Xis", "Bola"],
  checkers: ["Claras", "Escuras"],
  domino: ["Lugar 1", "Lugar 2", "Lugar 3", "Lugar 4"],
  truco: ["Lugar 1", "Lugar 2", "Lugar 3", "Lugar 4"],
};

/** Quantas pessoas cada jogo de mesa de vários lugares aceita (texto de ajuda). */
export const PLAYERS_HINT: Record<string, string> = {
  domino: "De 2 a 4 pessoas. Com 4, em duplas: lugares 1 e 3 contra 2 e 4.",
  truco: "2 pessoas (mano a mano) ou 4, em duplas: lugares 1 e 3 contra 2 e 4.",
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
  drawTicTacToe: "Deu velha!",
  lastMove: "Último lance",
  captured: "Capturadas",
  moves: (n: number) => (n === 1 ? "1 lance" : `${n} lances`),
  promoteTitle: "Promover peão",
  column: (n: number) => `Coluna ${n}`,
  cell: (n: number) => `Casa ${n}`,
  square: (sq: string) => `Casa ${sq}`,
  noTable: "Esta mesa não está disponível.",
  gameFallback: "Jogo",
  seatFallback: (seat: number) => `Lugar ${seat + 1}`,
  chessBoard: "Tabuleiro de xadrez",
  c4Board: (n: number) => `Grade do Lig 4, ${n === 1 ? "1 ficha" : `${n} fichas`}`,
  tttBoard: "Jogo da velha",
  white: "branco",
  black: "preto",

  // mesas de vários lugares
  sitShort: "Sentar",
  sitAt: (seat: string) => `Sentar no ${seat.toLowerCase()}`,
  start: "Começar partida",
  startNeed: (n: string) => `Falta gente: ${n}`,
  waitingStartMulti: "Quem estiver sentado começa a partida.",
  team: (n: number) => `Dupla ${n + 1}`,
  teamWon: "Sua dupla venceu!",
  teamLost: "Sua dupla perdeu",
  wonMany: (names: string) => `${names} venceram!`,
  rematchWaitingMany: (n: number) => (n === 1 ? "Esperando 1 pessoa aceitar…" : `Esperando ${n} pessoas aceitarem…`),
  rematchOfferMany: (names: string) => `${names} quer revanche`,
  and: (list: string[]) => (list.length <= 1 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} e ${list.at(-1)}`),

  // damas
  checkersBoard: "Tabuleiro de damas",
  mustCapture: "Captura obrigatória: tome o máximo de peças.",
  man: "pedra",
  king: "dama",
  lightPiece: "clara",
  darkPiece: "escura",

  // dominó
  dominoTable: "Mesa do dominó",
  dominoHand: "Sua mão",
  tile: (a: number, b: number) => `Pedra ${a} e ${b}`,
  tiles: (n: number) => (n === 1 ? "1 pedra" : `${n} pedras`),
  stock: (n: number) => (n === 1 ? "Monte: 1 pedra" : `Monte: ${n} pedras`),
  buy: "Comprar",
  pass: "Passar",
  endChoice: (n: number) => `Na ponta do ${n}`,
  chooseEnd: "Em qual ponta?",
  openWith: "Comece com a maior bucha",
  emptyChain: "Mesa vazia",
  dominoPlayed: (name: string) => `${name} jogou`,
  dominoDrew: (name: string, n: number) => `${name} comprou ${n === 1 ? "1 pedra" : `${n} pedras`}`,
  dominoPassed: (name: string) => `${name} passou`,
  pips: (n: number) => (n === 1 ? "1 ponto" : `${n} pontos`),

  // truco
  trucoTable: "Mesa do truco",
  trucoHand: "Suas cartas",
  card: (rank: string, suit: string) => `${rank} de ${suit}`,
  hiddenCard: "Carta virada",
  raiseName: (to: number) => (to <= 3 ? "Truco!" : to === 6 ? "Seis!" : to === 9 ? "Nove!" : "Doze!"),
  accept: "Aceitar",
  run: "Correr",
  asked: (name: string, to: number) => `${name} pediu ${to <= 3 ? "truco" : to === 6 ? "seis" : to === 9 ? "nove" : "doze"}!`,
  waitingAnswer: "Esperando a resposta…",
  playCard: "Sua vez: escolha uma carta.",
  us: "Nós",
  them: "Eles",
  stake: (n: number) => (n === 1 ? "Vale 1" : `Vale ${n}`),
  vira: "Vira",
  manilha: (rank: string) => `Manilha: ${rank}`,
  handNo: (n: number) => `Mão ${n}`,
  eleven: "Mão de onze",
  elevenAsk: "Sua dupla tem 11. Jogar esta mão valendo 3?",
  elevenOther: "A outra dupla tem 11 e está decidindo se joga.",
  elevenPlay: "Jogar valendo 3",
  iron: "Mão de ferro: todos jogam às cegas.",
  partnerCards: "Cartas do parceiro",
  tricks: "Vazas",
  points: (n: number) => (n === 1 ? "1 ponto" : `${n} pontos`),
  handUs: (pts: string) => `Nós marcamos ${pts}`,
  handThem: (pts: string) => `Eles marcaram ${pts}`,
  handBy: (names: string, plural: boolean, pts: string) => `${names} ${plural ? "marcaram" : "marcou"} ${pts}`,
  weRan: "nós corremos",
  theyRan: "eles correram",
  ranBy: (names: string, plural: boolean) => `${names} ${plural ? "correram" : "correu"}`,
  cards: (n: number) => (n === 1 ? "1 carta" : `${n} cartas`),
  handTie: "Mão empatada: ninguém marcou.",
  cover: "Jogar coberta",
  coverHint: "A carta vai virada para baixo e não vale nada. Atalho: Shift + clique na carta.",
  coverShortcut: "Shift + clique: jogar coberta",
  coverPick: "Escolha a carta que vai coberta.",
  coverThis: (card: string) => `Cobrir ${card}`,
  coveredCard: "carta coberta",
  coveredOwn: (card: string) => `${card}, coberta`,
  coveredTag: "Coberta",
  onTable: "Na mesa",

  // damas: finais especiais
  endgameLeft: (n: number) => (n === 1 ? "Empate em 1 lance" : `Empate em ${n} lances`),
  endgameOf: (strong: string) => `${strong} contra 1 dama`,
  endgameHint: (each: number) => `Final especial: empate depois de ${each} lances de cada lado sem vitória.`,
  endgameReason: (what: string, each: number) => `${what}: ${each} lances de cada lado sem vitória`,
  pieces: (kings: number, men: number) =>
    [kings ? (kings === 1 ? "1 dama" : `${kings} damas`) : "", men ? (men === 1 ? "1 pedra" : `${men} pedras`) : ""].filter(Boolean).join(" e "),
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
    case "nomoves":
      return "Sem lances possíveis";
    case "kings":
      return "20 lances seguidos só de damas";
    case "endgame":
      return "Final sem vitória no limite de lances";
    case "domino":
      return "Bateu: jogou a última pedra";
    case "locked":
      return "Jogo trancado: menos pontos na mão";
    case "score":
      return "Chegou a 12 pontos";
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
