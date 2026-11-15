import type { Vec2 } from "../geometry.ts";

/** Material de piso: muda a cor no 2D, o material no 3D e (depois) o som dos passos. */
export type FloorMaterial = "carpet" | "wood" | "concrete" | "stage" | "rug";

/** Uma área de piso andável. A união das áreas forma o escritório; fora delas é o espaço. */
export interface FloorArea {
  id: string;
  polygon: Vec2[];
  material: FloorMaterial;
  /** Altura do piso no 3D (palco = 0.3). */
  elevation?: number;
}

export type WallKind = "solid" | "glass";

export interface Wall {
  a: Vec2;
  b: Vec2;
  kind: WallKind;
  /** Altura no 3D, em metros. */
  height: number;
}

/**
 * Zonas de áudio. A menor zona que contém o ponto vence.
 * - open: espacial (volume cai com a distância), compartilhado por átrio, corredores e áreas abertas das alas.
 * - meeting / office / focus: sala fechada; quem está dentro ouve todos dentro, ninguém de fora ouve.
 * - auditorium: espacial por dentro, isolado de fora; quem está no palco é ouvido por todo o auditório.
 * - stage: o palco, parte do grupo do auditório.
 */
export type ZoneKind = "open" | "meeting" | "office" | "focus" | "auditorium" | "stage";

export interface Zone {
  id: string;
  name: string;
  kind: ZoneKind;
  polygon: Vec2[];
  /** Zonas do mesmo grupo podem se ouvir. Áreas abertas compartilham o grupo "open". */
  group: string;
  /** Ala a que a zona pertence, se houver. */
  wingId?: string;
  /** Paredes de vidro: quem está fora vê quem está dentro. */
  glass?: boolean;
  capacity?: number;
}

export type ObjectType =
  | "desk"
  | "chair"
  | "sofa"
  | "armchair"
  | "coffee-table"
  | "meeting-table"
  | "counter"
  | "tv"
  | "plant"
  | "sculpture"
  | "stage-seat"
  | "lectern"
  | "airhockey"
  | "pool"
  | "chess-table"
  | "jukebox"
  | "bookshelf"
  | "beanbag";

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
  /** Ponto e raio de interação (sentar, jogar, assistir). */
  interact?: { point: Vec2; yaw: number; radius: number; action: "sit" | "play" | "watch" | "use" };
  /** Mesa de trabalho associada (para cadeiras de mesa). */
  deskId?: string;
  /** TV: identificador da tela onde compartilhamentos aparecem. */
  screenId?: string;
  /** Altura de montagem (TVs na parede). */
  elevation?: number;
  zoneId?: string;
  label?: string;
}

/** Uma ala do Círculo de Evolução. */
export interface Wing {
  id: string;
  index: number;
  /** Etapa do método (Examinar, Visualizar...). */
  step: string;
  /** Inicial da etapa, usada como marca no piso. */
  letter: string;
  /** Área da empresa que ocupa a ala. */
  team: string;
  /** Ângulo do eixo da ala (yaw). */
  yaw: number;
}

export interface Desk {
  id: string;
  wingId?: string;
  /** Onde a pessoa senta. */
  seat: Vec2;
  seatYaw: number;
  objectId: string;
}

export interface MapLabel {
  text: string;
  sub?: string;
  pos: Vec2;
  kind: "wing" | "room" | "hub";
  yaw?: number;
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
  wings: Wing[];
  labels: MapLabel[];
  spawns: Vec2[];
}
