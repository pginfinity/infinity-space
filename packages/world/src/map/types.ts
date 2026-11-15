import type { Vec2 } from "../geometry.ts";

/** Estilo de piso: vira textura (pixel art no 2D, material no 3D) e, depois, som de passos. */
export type FloorStyle =
  | "carpet-navy"
  | "carpet-graphite"
  | "carpet-warm"
  | "wood-light"
  | "wood-warm"
  | "tile-white"
  | "tile-dark"
  | "concrete"
  | "neon-grid"
  | "marble"
  | "stage"
  /** Faixa de sinalização no chão dos corredores. */
  | "line";

/** Uma área de piso andável. A união das áreas forma a estação; fora delas é o espaço. */
export interface FloorArea {
  id: string;
  polygon: Vec2[];
  style: FloorStyle;
  /** Altura do piso no 3D (palco = 0.35). */
  elevation?: number;
}

export type WallKind = "solid" | "glass" | "window";

export interface Wall {
  a: Vec2;
  b: Vec2;
  kind: WallKind;
  /** Altura no 3D, em metros. */
  height: number;
  /**
   * Cor de cada face, para cada sala ter a sua: [esquerda, direita] em relação ao sentido a → b
   * (esquerda = normal (d.z, -d.x)). Numa parede horizontal (a → b para o leste), esquerda = face norte.
   */
  colors?: [string, string];
}

/**
 * Zonas de áudio. A menor zona que contém o ponto vence.
 * - open: espacial (volume cai com a distância). Átrio, corredores e áreas abertas.
 * - meeting / office / focus: sala fechada; quem está dentro ouve todos dentro, ninguém de fora ouve.
 * - auditorium: espacial por dentro, isolado de fora; quem está no palco é ouvido por todo o auditório.
 * - stage: o palco, parte do grupo do auditório.
 */
export type ZoneKind = "open" | "meeting" | "office" | "focus" | "auditorium" | "stage";

/** Identidade visual de uma sala. */
export interface RoomTheme {
  /** Cor de destaque da sala (placa da porta, caminho no chão, detalhes). */
  accent: string;
  /** Ícone curto da placa (lucide ou emoji-livre: texto curto). */
  icon: string;
}

export interface Zone {
  id: string;
  name: string;
  kind: ZoneKind;
  polygon: Vec2[];
  /** Zonas do mesmo grupo podem se ouvir. Áreas abertas compartilham o grupo "open". */
  group: string;
  /** Área da empresa dona da sala (Dev, Comercial...). */
  team?: string;
  /** Paredes de vidro: quem está fora vê quem está dentro. */
  glass?: boolean;
  capacity?: number;
  theme?: RoomTheme;
  /** Sala aparece no minimapa e na busca. */
  listed?: boolean;
}

/**
 * Catálogo de objetos. Cada tipo tem um modelo 3D estilizado (apps/web/src/scene/furniture)
 * e tamanho padrão em CATALOG (catalog.ts).
 */
export type ObjectType =
  // trabalho
  | "desk"
  | "desk-dual"
  | "standing-desk"
  | "exec-desk"
  | "curved-desk"
  | "workshop-table"
  // assentos
  | "office-chair"
  | "exec-chair"
  | "chair"
  | "stool"
  | "bench"
  | "sofa"
  | "armchair"
  | "beanbag"
  | "pouf"
  | "stage-seat"
  // mesas
  | "meeting-table"
  | "round-table"
  | "oval-table"
  | "high-table"
  | "coffee-table"
  | "bistro-table"
  // telas e paredes
  | "tv"
  | "leaderboard"
  | "whiteboard"
  | "kanban-board"
  | "moodboard"
  | "neon-sign"
  | "art-frame"
  | "directory"
  // tecnologia e estúdio
  | "server-rack"
  | "holo-table"
  | "robot-arm"
  | "big-button"
  | "ring-light"
  | "camera-tripod"
  | "backdrop"
  // copa
  | "counter"
  | "kitchen-counter"
  | "coffee-machine"
  | "fridge"
  | "water-cooler"
  // decoração
  | "plant"
  | "plant-tall"
  | "plant-small"
  | "bookshelf"
  | "lamp-floor"
  | "rug"
  | "sculpture"
  | "gong"
  // auditório
  | "lectern"
  // jogos
  | "airhockey"
  | "pool"
  | "pingpong"
  | "chess-table"
  | "connect4-table"
  | "arcade"
  | "jukebox"
  // estruturas
  | "pod";

export type InteractAction = "sit" | "play" | "watch" | "use";

export interface MapObject {
  id: string;
  type: ObjectType;
  pos: Vec2;
  /** Para onde a frente do objeto aponta (yaw). */
  rot: number;
  /** Largura (lateral), profundidade (frontal) e altura, em metros. */
  size: { w: number; d: number; h: number };
  /** Bloqueia a passagem. */
  blocks: boolean;
  /** Cor principal e de detalhe (variação por sala). */
  color?: string;
  accent?: string;
  /** Variação do modelo (0, 1, 2...). */
  variant?: number;
  /** Ponto de interação (sentar, jogar, assistir, usar). */
  interact?: {
    point: Vec2;
    yaw: number;
    radius: number;
    action: InteractAction;
    /** Altura do assento, para a pose de sentado. */
    seatHeight?: number;
    /** Texto do botão ("Sentar", "Jogar xadrez"...). */
    label?: string;
    /** Lugares extras do mesmo móvel (sofá de 3 lugares, banco comprido). */
    more?: Vec2[];
  };
  /** Cadeira de mesa de jogo: em que lugar da partida ela senta (0, 1...). */
  gameSeat?: number;
  /** Mesa de trabalho associada (para cadeiras de mesa). */
  deskId?: string;
  /** TV: onde compartilhamentos de tela aparecem. */
  screenId?: string;
  /** Mesa de jogo: identificador da partida (ver packages/world/src/games). */
  gameId?: string;
  /** Altura de montagem (objetos de parede). */
  elevation?: number;
  /** Texto de placas e letreiros. */
  text?: string;
  zoneId?: string;
  label?: string;
}

export interface Desk {
  id: string;
  zoneId?: string;
  /** Onde a pessoa senta. */
  seat: Vec2;
  seatYaw: number;
  objectId: string;
}

/** Placa de sala: aparece em cima da porta no 3D e como etiqueta no 2D. */
export interface Sign {
  zoneId: string;
  text: string;
  pos: Vec2;
  /** Para onde a placa olha. */
  yaw: number;
  accent: string;
}

export interface MapLabel {
  text: string;
  sub?: string;
  pos: Vec2;
  kind: "room" | "corridor";
}

export interface MapDef {
  id: string;
  version: number;
  name: string;
  floors: FloorArea[];
  walls: Wall[];
  zones: Zone[];
  objects: MapObject[];
  desks: Desk[];
  signs: Sign[];
  labels: MapLabel[];
  spawns: Vec2[];
}
