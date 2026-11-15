/**
 * Protocolo entre cliente e servidor do mundo. Mensagens codificadas em msgpack.
 * Poses vão compactadas em tuplas porque são as mensagens mais frequentes.
 */

export const PROTOCOL_VERSION = 1;

export type Lens = "2d" | "3d";
export type Status = "available" | "listening" | "focus" | "away";

export const ANIMS = ["idle", "walk", "run", "sit"] as const;
export type Anim = (typeof ANIMS)[number];

/** Aparência do avatar. O mesmo conjunto desenha o avatar no 3D e o token no 2D. */
export interface AvatarLook {
  /** Cor principal (roupa). */
  color: string;
  skin: string;
  hair: number;
  hairColor: string;
}

export interface PlayerInfo {
  id: string;
  name: string;
  look: AvatarLook;
  status: Status;
  lens: Lens;
  mic: boolean;
  cam: boolean;
  screen: boolean;
}

export type InfoPatch = Partial<Pick<PlayerInfo, "name" | "look" | "status" | "lens" | "mic" | "cam" | "screen">>;

/** [id, x, z, yaw, índice da animação] */
export type PoseTuple = [id: string, x: number, z: number, yaw: number, anim: number];

export type ClientMsg =
  /** `at`: onde a pessoa estava antes de uma reconexão; o servidor usa se o lugar for andável. */
  | { t: "hello"; v: number; name: string; look: AvatarLook; lens: Lens; at?: { x: number; z: number } }
  | { t: "pose"; x: number; z: number; yaw: number; anim: number }
  | { t: "info"; patch: InfoPatch }
  | { t: "ping"; at: number };

export type ServerMsg =
  | { t: "welcome"; you: string; map: { id: string; version: number }; players: PlayerInfo[]; poses: PoseTuple[]; serverTime: number }
  | { t: "join"; player: PlayerInfo; pose: PoseTuple }
  | { t: "leave"; id: string }
  | { t: "poses"; at: number; list: PoseTuple[] }
  | { t: "info"; id: string; patch: InfoPatch }
  | { t: "pong"; at: number; serverTime: number }
  /** O servidor recusou uma pose (lugar não andável ou velocidade impossível) e devolve a última válida. */
  | { t: "correct"; x: number; z: number }
  | { t: "error"; code: string; message: string };

export const DEFAULT_LOOK: AvatarLook = { color: "#00B7FF", skin: "#E8B48F", hair: 1, hairColor: "#2B1E16" };

/** Paleta de roupa sugerida no seletor (cores da marca e vizinhas). */
export const LOOK_COLORS = ["#00B7FF", "#EE5C29", "#46AFE3", "#F2F0EF", "#8A93A3", "#0A2547", "#7C5CFF", "#2BC48A", "#F2B134", "#E85D9A"] as const;
export const SKIN_TONES = ["#F6D7C3", "#E8B48F", "#C98E65", "#A86B45", "#7A4A2E", "#4E2F1F"] as const;
export const HAIR_COLORS = ["#2B1E16", "#5A3A22", "#A0652E", "#D9B26F", "#B8B8B8", "#E85D9A", "#00B7FF"] as const;
