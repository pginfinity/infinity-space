import type { InteractAction, ObjectType } from "./types.ts";

/**
 * Tamanho padrão e comportamento de cada tipo de objeto.
 * w = largura (lateral), d = profundidade (eixo da frente), h = altura. Metros.
 * O modelo 3D de cada tipo é construído com a frente para +Z local, base em y = 0, centrado.
 */
export interface CatalogEntry {
  w: number;
  d: number;
  h: number;
  blocks: boolean;
  /** Ação ao apertar E perto do objeto. */
  action?: InteractAction;
  /** Altura do assento (para sentar). */
  seatHeight?: number;
  /** Texto do botão de interação. */
  label?: string;
  /** Objeto de parede: altura padrão do centro. */
  wallMounted?: number;
  /** Descrição para quem modela (estilo e detalhes esperados). */
  look: string;
}

export const CATALOG: Record<ObjectType, CatalogEntry> = {
  // trabalho
  desk: { w: 1.4, d: 0.7, h: 0.75, blocks: true, look: "Mesa de trabalho simples, tampo claro, um monitor, teclado, caneca." },
  "desk-dual": { w: 1.6, d: 0.75, h: 0.75, blocks: true, look: "Mesa de dev com dois monitores lado a lado, teclado mecânico, luminária, planta pequena." },
  "standing-desk": { w: 1.4, d: 0.7, h: 1.05, blocks: true, look: "Mesa alta de trabalhar em pé, pés metálicos finos, notebook aberto." },
  "exec-desk": { w: 1.9, d: 0.9, h: 0.76, blocks: true, look: "Mesa executiva em madeira escura, painel frontal, notebook, porta-lápis, troféu pequeno." },
  "curved-desk": { w: 2.6, d: 1.1, h: 0.76, blocks: true, look: "Mesa curva de sala de controle, três telas em arco, luzes azuis no tampo." },
  "workshop-table": { w: 2.4, d: 1.2, h: 0.9, blocks: true, look: "Mesa de oficina de design, tampo de madeira clara, papéis, tablet de desenho, protótipos." },
  // assentos
  "office-chair": { w: 0.6, d: 0.6, h: 1.0, blocks: false, action: "sit", seatHeight: 0.48, label: "Sentar", look: "Cadeira de escritório com rodinhas, encosto alto, braços." },
  "exec-chair": { w: 0.7, d: 0.7, h: 1.15, blocks: false, action: "sit", seatHeight: 0.5, label: "Sentar", look: "Cadeira executiva de couro, encosto alto acolchoado." },
  chair: { w: 0.5, d: 0.5, h: 0.85, blocks: false, action: "sit", seatHeight: 0.46, label: "Sentar", look: "Cadeira simples de reunião ou café, pés de madeira." },
  stool: { w: 0.42, d: 0.42, h: 0.75, blocks: false, action: "sit", seatHeight: 0.72, label: "Sentar", look: "Banqueta alta de bar, assento redondo, apoio para os pés." },
  bench: { w: 1.6, d: 0.45, h: 0.45, blocks: false, action: "sit", seatHeight: 0.45, label: "Sentar", look: "Banco comprido de madeira." },
  sofa: { w: 2.2, d: 0.9, h: 0.8, blocks: true, action: "sit", seatHeight: 0.42, label: "Sentar", look: "Sofá de três lugares, almofadas, braços arredondados." },
  armchair: { w: 0.95, d: 0.9, h: 0.85, blocks: true, action: "sit", seatHeight: 0.42, label: "Sentar", look: "Poltrona estofada de lounge." },
  beanbag: { w: 0.9, d: 0.9, h: 0.6, blocks: false, action: "sit", seatHeight: 0.28, label: "Sentar", look: "Pufe de saco, formato de gota amassada." },
  pouf: { w: 0.55, d: 0.55, h: 0.42, blocks: false, action: "sit", seatHeight: 0.42, label: "Sentar", look: "Pufe cilíndrico estofado." },
  "stage-seat": { w: 0.6, d: 0.6, h: 0.9, blocks: false, action: "sit", seatHeight: 0.46, label: "Sentar", look: "Poltrona de auditório com assento e encosto estofados." },
  // mesas
  "meeting-table": { w: 1.3, d: 3.2, h: 0.75, blocks: true, look: "Mesa de reunião retangular, tampo claro, caixa de tomadas no centro." },
  "round-table": { w: 1.4, d: 1.4, h: 0.75, blocks: true, look: "Mesa redonda de reunião, pé central." },
  "oval-table": { w: 1.6, d: 3.6, h: 0.75, blocks: true, look: "Mesa oval grande de diretoria, madeira escura brilhante." },
  "conference-table": { w: 1.8, d: 7.6, h: 0.76, blocks: true, look: "Mesa de conferência para 20 pessoas (Sala Eclipse): tampo claro de cantos arredondados, faixa escura no centro com o eclipse marchetado, filete de luz por baixo." },
  "high-table": { w: 1.8, d: 0.7, h: 1.05, blocks: true, look: "Mesa alta de bar/standing, tampo de madeira." },
  "coffee-table": { w: 1.2, d: 0.7, h: 0.42, blocks: true, look: "Mesa de centro baixa, revistas e caneca." },
  "bistro-table": { w: 0.75, d: 0.75, h: 0.75, blocks: true, look: "Mesinha redonda de café, pé central metálico." },
  // telas e paredes
  tv: { w: 1.7, d: 0.08, h: 0.96, blocks: false, action: "watch", label: "Assistir", wallMounted: 1.55, look: "TV de parede fina, moldura escura. A tela é um plano separado (vai receber vídeo)." },
  leaderboard: { w: 2.6, d: 0.1, h: 1.3, blocks: false, action: "watch", label: "Ver ranking", wallMounted: 1.7, look: "Painel de ranking de vendas, tela larga com barras coloridas." },
  whiteboard: { w: 2.0, d: 0.06, h: 1.1, blocks: false, wallMounted: 1.45, look: "Quadro branco de parede com rabiscos coloridos e post-its." },
  "kanban-board": { w: 2.8, d: 0.06, h: 1.3, blocks: false, wallMounted: 1.5, look: "Quadro kanban de parede com 4 colunas e muitos post-its coloridos." },
  moodboard: { w: 2.2, d: 0.05, h: 1.3, blocks: false, wallMounted: 1.5, look: "Painel de referências visuais, fotos e amostras de cor presas." },
  "neon-sign": { w: 1.6, d: 0.05, h: 0.6, blocks: false, wallMounted: 2.1, look: "Letreiro neon na parede. Usa o campo `text` e a cor `accent`, brilhante." },
  "art-frame": { w: 1.0, d: 0.04, h: 0.7, blocks: false, wallMounted: 1.55, look: "Quadro emoldurado de arte abstrata nas cores da marca." },
  directory: { w: 1.2, d: 0.25, h: 1.9, blocks: true, action: "use", label: "Ver mapa", look: "Totem de mapa do escritório, tela vertical com planta iluminada." },
  // tecnologia e estúdio
  "server-rack": { w: 0.7, d: 0.9, h: 2.0, blocks: true, look: "Rack de servidores preto, várias unidades, LEDs verdes e azuis piscando." },
  "holo-table": { w: 1.8, d: 1.8, h: 0.95, blocks: true, look: "Mesa holográfica redonda, base escura, holograma azul translúcido girando em cima." },
  "robot-arm": { w: 0.8, d: 0.8, h: 1.6, blocks: true, look: "Braço robótico industrial branco e laranja, articulado, numa base." },
  "big-button": { w: 0.6, d: 0.6, h: 1.0, blocks: true, action: "use", label: "Apertar", look: "Pedestal com um grande botão vermelho de 'deploy'." },
  "ring-light": { w: 0.6, d: 0.6, h: 1.8, blocks: true, look: "Ring light de estúdio num tripé, anel branco emissivo." },
  "camera-tripod": { w: 0.6, d: 0.6, h: 1.6, blocks: true, look: "Câmera de vídeo profissional num tripé." },
  backdrop: { w: 2.6, d: 0.3, h: 2.4, blocks: true, look: "Fundo infinito de estúdio (papel curvado) laranja da marca, com suportes." },
  // copa
  counter: { w: 3.0, d: 0.75, h: 1.05, blocks: true, look: "Balcão de recepção, frente com faixa de luz azul, tampo claro." },
  "kitchen-counter": { w: 3.0, d: 0.65, h: 0.92, blocks: true, look: "Bancada de cozinha com pia, armários embaixo, utensílios." },
  "coffee-machine": { w: 0.6, d: 0.5, h: 1.2, blocks: true, action: "use", label: "Pegar café", look: "Máquina de café espresso grande sobre um móvel." },
  fridge: { w: 0.75, d: 0.7, h: 1.9, blocks: true, look: "Geladeira de inox, duas portas." },
  "water-cooler": { w: 0.4, d: 0.4, h: 1.3, blocks: true, action: "use", label: "Beber água", look: "Bebedouro com galão azul em cima." },
  // decoração
  plant: { w: 0.6, d: 0.6, h: 1.3, blocks: true, look: "Planta média num vaso claro, folhagem arredondada." },
  "plant-tall": { w: 0.7, d: 0.7, h: 2.1, blocks: true, look: "Planta alta tipo costela-de-adão ou palmeira, vaso escuro." },
  "plant-small": { w: 0.35, d: 0.35, h: 0.45, blocks: false, look: "Vasinho de mesa ou chão com suculenta." },
  bookshelf: { w: 2.0, d: 0.4, h: 2.0, blocks: true, look: "Estante com livros coloridos, objetos decorativos." },
  "lamp-floor": { w: 0.45, d: 0.45, h: 1.7, blocks: false, look: "Luminária de chão com cúpula, luz quente." },
  rug: { w: 3.0, d: 2.0, h: 0.02, blocks: false, look: "Tapete retangular com padrão geométrico simples nas cores `color`/`accent`." },
  sculpture: { w: 2.2, d: 2.2, h: 3.6, blocks: true, look: "(Modelo próprio, feito à parte: a estrela da Infinity.)" },
  gong: { w: 1.0, d: 0.5, h: 1.8, blocks: true, action: "use", label: "Tocar o gongo", look: "Gongo dourado pendurado numa moldura de madeira." },
  // pacote escritorio
  "notice-board": { w: 2.0, d: 0.08, h: 1.25, blocks: false, action: "use", label: "Ver mural", wallMounted: 1.5, look: "Mural de cortiça com moldura de madeira e post-its coloridos (os recados reais vêm por cima, em textura)." },
  // auditório
  lectern: { w: 0.7, d: 0.5, h: 1.15, blocks: true, action: "use", label: "Ir ao púlpito", look: "Púlpito de palestra com microfone." },
  // jogos
  airhockey: { w: 1.1, d: 2.0, h: 0.8, blocks: true, action: "play", label: "Jogar hockey", look: "Mesa de air hockey, superfície branca com linhas, bordas coloridas, gols nas pontas." },
  pool: { w: 1.45, d: 2.6, h: 0.82, blocks: true, action: "play", label: "Jogar sinuca", look: "Mesa de sinuca, feltro azul navy da marca, bordas de madeira, bolas." },
  pingpong: { w: 1.5, d: 2.7, h: 0.76, blocks: true, action: "play", label: "Jogar pingue-pongue", look: "Mesa de pingue-pongue azul com rede no meio." },
  "chess-table": { w: 0.8, d: 0.8, h: 0.74, blocks: true, action: "play", label: "Jogar xadrez", look: "Mesinha com tabuleiro de xadrez e peças." },
  "connect4-table": { w: 0.9, d: 0.7, h: 0.74, blocks: true, action: "play", label: "Jogar Lig 4", look: "Mesinha com o tabuleiro vertical de ligar 4 (grade azul, fichas laranja e brancas)." },
  // jogos de mesa do café
  "checkers-table": { w: 0.8, d: 0.8, h: 0.74, blocks: true, action: "play", label: "Jogar damas", look: "Mesinha de madeira com tabuleiro de damas em tons de madeira clara e escura (as peças da partida aparecem ao vivo no tampo)." },
  "domino-table": { w: 0.9, d: 0.9, h: 0.74, blocks: true, action: "play", label: "Jogar dominó", look: "Mesa quadrada de boteco, tampo de madeira com borda escura, para quatro (a fileira de pedras aparece ao vivo no tampo)." },
  "cards-table": { w: 0.9, d: 0.9, h: 0.74, blocks: true, action: "play", label: "Jogar truco", look: "Mesa quadrada de carteado com feltro verde e borda de madeira, para quatro (vira, vaza e placar aparecem ao vivo no feltro)." },
  // pacote arcade
  "tictactoe-table": { w: 0.8, d: 0.8, h: 0.74, blocks: true, action: "play", label: "Jogar jogo da velha", look: "Mesinha quadrada com tampo de acrílico escuro e a grade do jogo da velha acesa (a partida aparece ao vivo no tampo)." },
  "arcade-board": { w: 2.2, d: 0.08, h: 1.2, blocks: false, action: "use", label: "Ver recordes", wallMounted: 1.75, look: "Placar de recordes dos fliperamas: moldura retrô com filete neon e tela larga (a textura com os rankings é desenhada à parte)." },
  "trash-bin": { w: 0.36, d: 0.36, h: 0.5, blocks: true, action: "use", label: "Arremessar bolinha", look: "Lixeira de escritório cilíndrica, aro claro, com papel amassado dentro." },
  arcade: { w: 0.8, d: 0.8, h: 1.8, blocks: true, action: "play", label: "Jogar fliperama", look: "Máquina de fliperama retrô, tela brilhante, controles, lateral com arte colorida." },
  jukebox: { w: 0.9, d: 0.6, h: 1.6, blocks: true, action: "use", label: "Escolher música", look: "Jukebox retrô com painel frontal laranja brilhante e arco de luz." },
  // jogos de grupo (pacote grupo)
  "stop-board": { w: 1.0, d: 0.66, h: 1.78, blocks: true, action: "use", label: "Jogar Stop", look: "Cavalete de quadro-negro do café: moldura de madeira, letreiro STOP em giz, roleta de letras no topo e bandeja com gizes." },
  "mission-console": { w: 0.9, d: 0.7, h: 1.3, blocks: true, action: "use", label: "Impostor na Estação", look: "Terminal de missões da estação: pedestal escuro com tampo inclinado, mapa holográfico da estação acima e faixa de luz azul." },
  // pacote vivo (estação viva)
  telescope: { w: 0.8, d: 0.8, h: 1.6, blocks: true, action: "use", label: "Olhar pelo telescópio", look: "Telescópio de latão e azul-marinho num tripé de madeira, apontado para a janela." },
  chalkboard: { w: 0.7, d: 0.5, h: 1.25, blocks: true, look: "Cavalete de quadro de giz (A-frame) da copa, moldura de madeira. O texto do dia é desenhado à parte." },
  "watering-station": { w: 0.9, d: 0.45, h: 1.1, blocks: true, action: "use", label: "Pegar o regador", look: "Banquinho de jardinagem com regadores, vasinhos de muda e uma plaquinha das plantas felizes." },
  // estruturas
  pod: { w: 2.2, d: 2.2, h: 2.4, blocks: false, look: "(Estrutura: cabine de foco, montada com paredes no mapa.)" },
  // pacote portas
  door: { w: 1.6, d: 0.08, h: 2.2, blocks: false, look: "(Porta de sala no vão da parede: folha e luz de estado desenhadas pela atividade \"portas\", nas duas lentes.)" },
  // pacote easter: homenagens discretas (arte original; sem personagens, logos, símbolos nem fontes das obras).
  // Os pequenos vão em cima de móveis: a altura vem de `elevation`.
  "lens-rack": { w: 0.7, d: 0.9, h: 2.0, blocks: true, look: "Rack de servidores igual aos outros, com um painel de alumínio escovado no alto e uma lente vermelha redonda acesa, respirando devagar (2001)." },
  "crooked-book": { w: 0.05, d: 0.2, h: 0.28, blocks: false, look: "Livro de capa dura cor de vinho, lombada com filetes dourados, puxado para fora da prateleira e torto (Interestelar). Vai na estante (elevation = altura da prateleira)." },
  "pill-dish": { w: 0.12, d: 0.12, h: 0.04, blocks: false, look: "Pirezinho de vidro com uma pílula brilhante: vermelha (variante 0) ou azul (variante 1) (Matrix). Vai em cima de uma mesa." },
  "brick-pillar": { w: 0.9, d: 0.14, h: 2.7, blocks: false, wallMounted: 1.35, look: "Pilastra de tijolos aparentes encostada na parede do corredor, com uma plaquinha esmaltada de plataforma; o “9¾” é desenhado à parte pelo pacote easter (Harry Potter)." },
  "fancy-pen": { w: 0.16, d: 0.09, h: 0.1, blocks: false, look: "Caneta-tinteiro preta com detalhes dourados num suporte de mármore escuro (O Lobo de Wall Street). Vai em cima de uma mesa." },
  barrel: { w: 0.62, d: 0.62, h: 0.86, blocks: true, look: "Barril de madeira com aros de metal e tampa solta, esquecido num canto (Chaves)." },
  "ramen-bowl": { w: 0.22, d: 0.22, h: 0.14, blocks: false, look: "Tigela funda de lámen: caldo, macarrão, ovo, cebolinha, alga e a fatia de narutomaki (branca com espiral rosa), hashis por cima (Naruto). Vai na bancada." },
  "duck-family": { w: 0.3, d: 0.2, h: 0.12, blocks: false, look: "Bandeja rasa com água e uma família de patinhos de borracha amarelos em fila: a mãe e três filhotes (Família Soprano). Vai em cima de uma mesa." },
};
