import type { Status } from "@infinity/world";

/** Cores das cenas, derivadas da paleta da marca. */

export const SPACE = "#020B18";

export const STATUS_COLOR: Record<Status, string> = {
  available: "#2BC48A",
  listening: "#46AFE3",
  focus: "#F2B134",
  away: "#8A93A3",
};
