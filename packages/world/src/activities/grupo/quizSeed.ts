import { grupoRng } from "./common.ts";
import type { QuizBank, QuizPack, QuizQuestion } from "./quiz.ts";

/**
 * Pacotes iniciais do Quiz Show. Perguntas de fatos verificáveis; a primeira alternativa de cada
 * linha é a certa (a posição é embaralhada ao montar o banco e de novo a cada partida).
 * "Cultura Infinity" começa vazio de propósito: quem conhece a empresa é o time.
 */

type Raw = readonly [text: string, correct: string, ...wrong: [string, string, string]];

const TECH: Raw[] = [
  ["O que significa a sigla “IA”?", "Inteligência Artificial", "Interface Avançada", "Integração Automática", "Informação Aplicada"],
  ["Qual linguagem de programação foi criada por Guido van Rossum?", "Python", "Java", "Ruby", "C#"],
  ["Em que ano o primeiro iPhone foi lançado?", "2007", "2005", "2009", "2010"],
  ["O que significa a sigla HTML?", "HyperText Markup Language", "High Transfer Machine Language", "Hyperlink Text Management Logic", "Home Tool Markup Language"],
  ["Quem propôs, em 1950, um teste para avaliar se uma máquina consegue se passar por humana numa conversa?", "Alan Turing", "Charles Babbage", "John von Neumann", "Ada Lovelace"],
  ["Quantos bits tem um byte?", "8", "4", "16", "10"],
  ["Qual empresa mantém o sistema operacional Android?", "Google", "Apple", "Microsoft", "Samsung"],
  ["O que é machine learning?", "Sistemas que aprendem padrões a partir de dados", "Manutenção preventiva de servidores", "Uma linguagem para programar robôs", "Montagem automatizada de computadores"],
  ["Qual destas linguagens é usada para estilizar páginas web?", "CSS", "SQL", "Python", "Bash"],
  ["Para que serve principalmente a linguagem SQL?", "Consultar e manipular bancos de dados", "Desenhar interfaces", "Compilar programas em C", "Criptografar arquivos"],
  ["Quem publicou o primeiro algoritmo pensado para a Máquina Analítica de Charles Babbage?", "Ada Lovelace", "Grace Hopper", "Alan Turing", "Margaret Hamilton"],
  ["O que significa a sigla GPU?", "Graphics Processing Unit", "General Processing Unit", "Graphic Power Utility", "Global Processing Unit"],
  ["Qual sistema de controle de versão Linus Torvalds criou em 2005?", "Git", "Subversion", "Mercurial", "CVS"],
  ["Qual protocolo acessa páginas web com criptografia?", "HTTPS", "FTP", "SMTP", "HTTP"],
  ["Qual arquitetura de rede neural foi apresentada no artigo “Attention Is All You Need” (2017)?", "Transformer", "Perceptron", "Rede convolucional", "LSTM"],
  ["Em IA generativa, o que é um prompt?", "A instrução dada ao modelo", "O servidor que roda o modelo", "Um tipo de placa de vídeo", "O arquivo de pesos do modelo"],
  ["Qual destes sistemas operacionais tem código aberto?", "Linux", "Windows", "macOS", "iOS"],
  ["Qual computador da IBM venceu o campeão mundial de xadrez Garry Kasparov em 1997?", "Deep Blue", "Watson", "Big Blue", "HAL 9000"],
  ["Quantos valores diferentes cabem em 1 byte?", "256", "255", "128", "1024"],
  ["O que é uma API?", "Uma interface para sistemas conversarem entre si", "Um tipo de vírus", "Um processador gráfico", "Um banco de dados"],
  ["Qual programa da DeepMind venceu o campeão Lee Sedol no jogo Go, em 2016?", "AlphaGo", "AlphaZero", "Deep Blue", "Watson"],
];

const GERAIS: Raw[] = [
  ["Qual é o maior planeta do Sistema Solar?", "Júpiter", "Saturno", "Netuno", "Terra"],
  ["Qual é o oceano mais extenso do planeta?", "Pacífico", "Atlântico", "Índico", "Ártico"],
  ["Quem pintou a Mona Lisa?", "Leonardo da Vinci", "Michelangelo", "Rafael", "Van Gogh"],
  ["Qual é o símbolo químico do ouro?", "Au", "Ag", "Ou", "Go"],
  ["Quantos ossos tem o corpo humano adulto?", "206", "186", "256", "300"],
  ["Qual planeta é conhecido como Planeta Vermelho?", "Marte", "Vênus", "Mercúrio", "Júpiter"],
  ["Em que país ficam as pirâmides de Gizé?", "Egito", "México", "Peru", "Sudão"],
  ["Qual é, aproximadamente, a velocidade da luz no vácuo?", "300 mil km/s", "30 mil km/s", "3 milhões de km/s", "3 mil km/s"],
  ["Quem escreveu “Dom Quixote”?", "Miguel de Cervantes", "William Shakespeare", "Luís de Camões", "Dante Alighieri"],
  ["Qual é o maior órgão do corpo humano?", "A pele", "O fígado", "O cérebro", "O intestino"],
  ["Que gás as plantas absorvem do ar para fazer fotossíntese?", "Gás carbônico", "Oxigênio", "Nitrogênio", "Hélio"],
  ["Quantos lados tem um hexágono?", "6", "5", "7", "8"],
  ["Qual é a capital da Austrália?", "Canberra", "Sydney", "Melbourne", "Perth"],
  ["Em que ano o ser humano pisou na Lua pela primeira vez?", "1969", "1965", "1972", "1959"],
  ["Qual gás é o mais abundante na atmosfera da Terra?", "Nitrogênio", "Oxigênio", "Gás carbônico", "Argônio"],
  ["Qual é a montanha mais alta do mundo acima do nível do mar?", "Everest", "K2", "Aconcágua", "Kilimanjaro"],
  ["Quantos jogadores de cada time ficam em campo numa partida de futebol?", "11", "10", "12", "9"],
  ["Qual instrumento mede a pressão atmosférica?", "Barômetro", "Termômetro", "Higrômetro", "Anemômetro"],
  ["Qual língua tem mais falantes nativos no mundo?", "Mandarim", "Inglês", "Espanhol", "Hindi"],
  ["Quem formulou a teoria da relatividade?", "Albert Einstein", "Isaac Newton", "Galileu Galilei", "Nikola Tesla"],
  ["Qual é o menor país do mundo em área?", "Vaticano", "Mônaco", "San Marino", "Liechtenstein"],
];

const BRASIL: Raw[] = [
  ["Em que ano Brasília foi inaugurada?", "1960", "1950", "1964", "1955"],
  ["Qual é o maior estado brasileiro em área?", "Amazonas", "Pará", "Mato Grosso", "Minas Gerais"],
  ["Quantos estados tem o Brasil, sem contar o Distrito Federal?", "26", "27", "25", "24"],
  ["Qual é a capital de Santa Catarina?", "Florianópolis", "Joinville", "Blumenau", "Curitiba"],
  ["Quem escreveu “Dom Casmurro”?", "Machado de Assis", "José de Alencar", "Jorge Amado", "Graciliano Ramos"],
  ["Em que ano foi proclamada a Independência do Brasil?", "1822", "1808", "1889", "1831"],
  ["Em que ano foi proclamada a República no Brasil?", "1889", "1822", "1891", "1930"],
  ["Em que ano o Brasil ganhou sua primeira Copa do Mundo de futebol masculino?", "1958", "1950", "1962", "1970"],
  ["Qual rio brasileiro é o maior do mundo em volume de água?", "Amazonas", "São Francisco", "Paraná", "Tocantins"],
  ["Qual bioma ocupa a maior parte do território brasileiro?", "Amazônia", "Cerrado", "Mata Atlântica", "Caatinga"],
  ["Quem foi o primeiro presidente do Brasil?", "Deodoro da Fonseca", "Floriano Peixoto", "Getúlio Vargas", "Prudente de Morais"],
  ["Qual é a moeda oficial do Brasil desde 1994?", "Real", "Cruzeiro", "Cruzado", "Cruzeiro Real"],
  ["Qual cidade foi capital do Brasil logo antes de Brasília?", "Rio de Janeiro", "Salvador", "São Paulo", "Belo Horizonte"],
  ["Qual foi a primeira capital do Brasil?", "Salvador", "Rio de Janeiro", "Recife", "São Vicente"],
  ["Em que estado ficam os Lençóis Maranhenses?", "Maranhão", "Piauí", "Ceará", "Bahia"],
  ["Que ave foi declarada símbolo nacional do Brasil por decreto, em 2002?", "Sabiá-laranjeira", "Arara-azul", "Tucano", "Bem-te-vi"],
  ["Quem compôs “Aquarela do Brasil”, de 1939?", "Ary Barroso", "Tom Jobim", "Noel Rosa", "Pixinguinha"],
  ["Qual é o ponto mais alto do Brasil?", "Pico da Neblina", "Pico da Bandeira", "Monte Roraima", "Pico das Agulhas Negras"],
  ["Qual cidade é conhecida como “Ilha da Magia”?", "Florianópolis", "Ilhabela", "São Luís", "Vitória"],
  ["Quantas estrelas tem a bandeira do Brasil?", "27", "26", "21", "25"],
  ["Quem escreveu “A Hora da Estrela”?", "Clarice Lispector", "Cecília Meireles", "Rachel de Queiroz", "Cora Coralina"],
];

function pack(id: string, title: string, list: readonly Raw[], seed: number): QuizPack {
  const rand = grupoRng(seed);
  const questions: QuizQuestion[] = list.map(([text, right, ...wrong], i) => {
    const correct = Math.floor(rand() * 4);
    const options = [...wrong] as string[];
    options.splice(correct, 0, right);
    return { id: `${id}-${String(i + 1).padStart(2, "0")}`, text, options: options as QuizQuestion["options"], correct };
  });
  return { id, title, questions };
}

/** Banco inicial (usado quando ainda não há nada salvo no servidor). */
export function quizSeedBank(): QuizBank {
  return {
    version: 1,
    packs: [
      pack("tecnologia-ia", "Tecnologia e IA", TECH, 11),
      pack("conhecimentos-gerais", "Conhecimentos gerais", GERAIS, 23),
      pack("brasil", "Brasil", BRASIL, 37),
      { id: "cultura-infinity", title: "Cultura Infinity", questions: [] },
    ],
  };
}
