import { morse, prettyMorse } from "./rules.ts";

/**
 * Textos do pacote easter em pt-BR. Citações curtas, traduzidas, e nomes de lugares fictícios só em texto.
 * Ficam no pacote (como nos outros) para não disputar o pt-BR.json com quem mexe ao mesmo tempo.
 */
export const T = {
  hal: {
    label: "Falar com o computador",
    line: "Desculpe, Dave. Receio que não posso fazer isso.",
  },
  book: {
    label: "Puxar o livro torto",
    line: "Fique.",
    morse: prettyMorse(morse("STAY")),
  },
  pills: {
    red: { label: "Tomar a pílula vermelha", line: "Bem-vindo ao deserto do real." },
    blue: { label: "Tomar a pílula azul", line: "Fim da história. Você acorda na sua mesa e acredita no que quiser." },
  },
  platform: {
    label: "Atravessar a parede",
    line: "Bonk! Hoje não, trouxa.",
    /** Placa da pilastra (desenhada no mundo). */
    signTop: "Plataforma",
    signNum: "9¾",
  },
  pen: {
    label: "Me venda esta caneta",
    lines: [
      "Escreve seu nome aqui para mim? Ah, você está sem caneta. Que coincidência.",
      "Ela assina contratos sozinha. Só falta você assinar este aqui.",
      "Última unidade em estoque. Na verdade, a única. Fechamos?",
      "Não é uma caneta. É o seu próximo “fechado” no CRM.",
      "Tinta azul, garantia vitalícia e zero reuniões de alinhamento.",
      "Já vem com o desconto que você ia pedir.",
      "Cliente satisfeito ou sua tinta de volta.",
      "Escreve até em reunião que podia ter sido um e-mail.",
    ],
  },
  barrel: {
    label: "Entrar no barril",
    line: "Foi sem querer querendo.",
  },
  ramen: {
    label: "Comer lámen",
    line: "Dattebayo! Energia para a sprint inteira.",
  },
  fridge: {
    line: "Tem gabagool aqui atrás.",
  },
  konami: {
    line: "+30 vidas",
  },
  marauder: {
    title: "Mapa do maroto",
    open: "Mapa revelado. Para esconder, escreva “malfeito feito”.",
    close: "Malfeito feito. O mapa voltou ao normal.",
    expired: "A tinta sumiu. O mapa voltou ao normal.",
  },
  orbi: {
    quotes: ["Ao infinito e além!", "Vida longa e próspera.", "Houston, temos um problema.", "Que a Força esteja com você.", "Eu voltarei."],
  },
  tv: {
    gigawatts: "1,21 gigawatts!",
  },
};
