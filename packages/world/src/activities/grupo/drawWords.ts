/**
 * Palavras do Desenhe e adivinhe, em pt-BR, por dificuldade.
 * Fácil: objetos e bichos do dia a dia. Médio: coisas compostas ou menos óbvias.
 * Difícil: cenas, conceitos e expressões que ainda dá para desenhar (com criatividade).
 */

export const DRAW_WORDS_EASY: readonly string[] = [
  "casa", "sol", "lua", "estrela", "árvore", "flor", "gato", "cachorro", "peixe", "pássaro",
  "carro", "bicicleta", "avião", "barco", "trem", "bola", "livro", "chave", "copo", "garrafa",
  "cadeira", "mesa", "cama", "porta", "janela", "relógio", "óculos", "chapéu", "sapato", "camiseta",
  "meia", "guarda-chuva", "nuvem", "chuva", "montanha", "praia", "ilha", "maçã", "banana", "uva",
  "morango", "abacaxi", "melancia", "pera", "cenoura", "milho", "ovo", "pizza", "bolo", "sorvete",
  "pão", "queijo", "xícara", "garfo", "faca", "colher", "prato", "panela", "cobra", "aranha",
  "borboleta", "abelha", "formiga", "tartaruga", "coelho", "porco", "vaca", "cavalo", "galinha", "pato",
  "sapo", "elefante", "girafa", "leão", "macaco", "urso", "baleia", "tubarão", "polvo", "caracol",
  "coração", "olho", "nariz", "boca", "mão", "pé", "dente", "orelha", "telefone", "celular",
  "computador", "televisão", "lâmpada", "vela", "balão", "presente", "pipa", "foguete", "robô", "coroa",
  "espada", "escada", "ponte", "castelo", "barraca", "lápis", "tesoura", "régua", "mochila", "envelope",
  "bandeira", "âncora", "violão", "tambor", "fantasma", "boneco de neve", "cogumelo", "cacto", "folha", "fogo",
  "raio", "arco", "sino", "cerca", "pente",
];

export const DRAW_WORDS_MEDIUM: readonly string[] = [
  "astronauta", "bombeiro", "dentista", "palhaço", "pirata", "sereia", "dragão", "unicórnio", "dinossauro", "vulcão",
  "arco-íris", "cachoeira", "deserto", "farol", "moinho", "roda-gigante", "montanha-russa", "carrossel", "escorregador", "balanço",
  "piscina", "chuveiro", "banheira", "escova de dente", "secador", "geladeira", "fogão", "micro-ondas", "liquidificador", "aspirador",
  "ventilador", "controle remoto", "fone de ouvido", "teclado", "mouse", "impressora", "câmera", "telescópio", "microscópio", "lupa",
  "ímã", "bússola", "mapa", "globo", "ampulheta", "calendário", "cofre", "cadeado", "martelo", "chave de fenda",
  "serrote", "parafuso", "regador", "carrinho de mão", "trator", "helicóptero", "submarino", "paraquedas", "skate", "patins",
  "prancha de surfe", "raquete", "troféu", "medalha", "apito", "semáforo", "caixa de correio", "ônibus", "ambulância", "moto",
  "caminhão", "pinguim", "coruja", "morcego", "canguru", "zebra", "camelo", "jacaré", "flamingo", "lagosta",
  "caranguejo", "cavalo-marinho", "estrela-do-mar", "água-viva", "minhoca", "joaninha", "mosquito", "esquilo", "pavão", "papagaio",
  "tucano", "sanduíche", "hambúrguer", "cachorro-quente", "pipoca", "brigadeiro", "pastel", "coxinha", "espaguete", "picolé",
  "pirulito", "ovo frito", "iglu", "pirâmide", "cabana", "ninho", "teia de aranha", "esqueleto", "múmia", "vampiro",
  "bruxa", "mágico", "varinha", "cartola", "chaleira", "guarda-roupa", "abajur", "tapete", "travesseiro", "cabide",
];

export const DRAW_WORDS_HARD: readonly string[] = [
  "eclipse", "gravidade", "eletricidade", "wi-fi", "reunião", "home office", "prazo", "café da manhã", "pôr do sol", "aniversário",
  "casamento", "formatura", "mudança", "engarrafamento", "tempestade", "terremoto", "tsunami", "aurora boreal", "buraco negro", "constelação",
  "satélite", "estação espacial", "código de barras", "impressão digital", "senha", "algoritmo", "inteligência artificial", "realidade virtual", "videogame", "selfie",
  "emoji", "hashtag", "pódio", "maratona", "cabo de guerra", "esconde-esconde", "amarelinha", "pular corda", "malabarista", "equilibrista",
  "sonâmbulo", "pesadelo", "gravata-borboleta", "arco e flecha", "carrinho de supermercado", "fila", "elevador", "escada rolante", "crachá", "planilha",
  "gráfico", "apresentação", "videochamada", "bateria fraca", "carregador", "tomada", "ideia", "furacão", "iceberg", "oásis",
  "miragem", "eco", "sombra", "reflexo", "labirinto", "quebra-cabeça", "dominó", "boliche", "karaokê", "fogueira",
  "acampamento", "passaporte", "despertador", "soneca", "academia", "meditação", "piquenique", "mergulho", "paraquedista", "telhado",
];

export type DrawLevel = "facil" | "medio" | "dificil";

export const DRAW_WORDS: Record<DrawLevel, readonly string[]> = {
  facil: DRAW_WORDS_EASY,
  medio: DRAW_WORDS_MEDIUM,
  dificil: DRAW_WORDS_HARD,
};
