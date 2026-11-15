import type { FloorMaterial, ObjectType, Status } from "@infinity/world";

/** Cores das cenas (2D e 3D), derivadas da paleta da marca. */

export const SPACE = "#020B18";

export const STATUS_COLOR: Record<Status, string> = {
  available: "#2BC48A",
  listening: "#46AFE3",
  focus: "#F2B134",
  away: "#8A93A3",
};

/** Planta 2D: navy em camadas, paredes em off-white, vidro em Signal Blue. */
export const PLAN = {
  floor: {
    concrete: "#0E2140",
    carpet: "#11284A",
    wood: "#1A2442",
    stage: "#33221F",
    rug: "#163463",
  } satisfies Record<FloorMaterial, string>,
  zoneTint: {
    meeting: { color: "#00B7FF", alpha: 0.07 },
    office: { color: "#ECE6DF", alpha: 0.04 },
    focus: { color: "#8A93A3", alpha: 0.08 },
  },
  wall: "#E9E4DE",
  glass: "#5FD0FF",
  label: "#F2F0EF",
  labelSub: "#8A93A3",
  letter: "#F2F0EF",
} as const;

export interface ObjectStyle {
  fill: string;
  stroke?: string;
  alpha?: number;
  round?: number;
}

export const OBJECT_2D: Record<ObjectType, ObjectStyle> = {
  desk: { fill: "#1F3D66", stroke: "#3E6394", round: 0.06 },
  chair: { fill: "#2B4D7D", round: 0.12 },
  sofa: { fill: "#25476F", stroke: "#3E6394", round: 0.18 },
  armchair: { fill: "#25476F", stroke: "#3E6394", round: 0.18 },
  "coffee-table": { fill: "#1A355C", stroke: "#3E6394", round: 0.12 },
  "meeting-table": { fill: "#1F3D66", stroke: "#4B73A8", round: 0.25 },
  counter: { fill: "#1B3961", stroke: "#4B73A8", round: 0.08 },
  tv: { fill: "#00B7FF", round: 0.02 },
  plant: { fill: "#2BC48A", alpha: 0.55, round: 1 },
  sculpture: { fill: "#000000", alpha: 0 },
  "stage-seat": { fill: "#3A2A30", round: 0.1 },
  lectern: { fill: "#2B3F63", stroke: "#4B73A8", round: 0.06 },
  airhockey: { fill: "#DCE6F2", stroke: "#00B7FF", round: 0.2 },
  pool: { fill: "#0A2547", stroke: "#6B4A32", round: 0.12 },
  "chess-table": { fill: "#ECE6DF", stroke: "#3E6394", round: 0.05 },
  jukebox: { fill: "#EE5C29", stroke: "#FF8A5C", round: 0.15 },
  bookshelf: { fill: "#24395C", stroke: "#3E6394", round: 0.04 },
  beanbag: { fill: "#2E5A8C", round: 1 },
};
