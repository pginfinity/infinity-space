/**
 * Protocolo entre cliente e servidor do mundo. Mensagens codificadas em msgpack.
 * Poses vão compactadas em tuplas porque são as mensagens mais frequentes.
 */

export const PROTOCOL_VERSION = 2;

export type Lens = "2d" | "3d";
export type Status = "available" | "listening" | "focus" | "away";

export const ANIMS = ["idle", "walk", "run", "sit"] as const;
export type Anim = (typeof ANIMS)[number];

/** Emotes: gestos curtos que todos veem. */
export const EMOTES = ["wave", "dance", "clap", "cheer", "point", "think", "laugh", "heart"] as const;
export type Emote = (typeof EMOTES)[number];

/**
 * Aparência do avatar chibi. O mesmo conjunto desenha o avatar no 3D e no 2D isométrico.
 * Estilos são índices nas listas de apps/web/src/avatar/catalog.ts.
 */
export interface AvatarLook {
  skin: string;
  hair: number;
  hairColor: string;
  eyes: number;
  brows: number;
  mouth: number;
  /** 0 nada, 1 bigode, 2 barba curta, 3 barba cheia, 4 cavanhaque. */
  facial: number;
  /** 0 camiseta, 1 manga longa, 2 moletom, 3 blazer, 4 polo, 5 vestido, 6 regata, 7 jaqueta. */
  top: number;
  topColor: string;
  topColor2: string;
  /** 0 calça, 1 bermuda, 2 saia, 3 calça jogger. */
  bottom: number;
  bottomColor: string;
  /** 0 tênis, 1 bota, 2 sapato social. */
  shoes: number;
  shoesColor: string;
  /** Acessórios: ids da lista ACCESSORIES. */
  acc: number[];
  accColor: string;
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
  /** A janela compartilhada foi minimizada: quem assiste vê um aviso em vez de imagem congelada. */
  screenPaused?: boolean;
}

export type InfoPatch = Partial<Pick<PlayerInfo, "name" | "look" | "status" | "lens" | "mic" | "cam" | "screen" | "screenPaused">>;

/** [id, x, z, yaw, índice da animação] */
export type PoseTuple = [id: string, x: number, z: number, yaw: number, anim: number];

export type ClientMsg =
  /** `at`: onde a pessoa estava antes de uma reconexão; o servidor usa se o lugar for andável. */
  | { t: "hello"; v: number; name: string; look: AvatarLook; lens: Lens; at?: { x: number; z: number } }
  | { t: "pose"; x: number; z: number; yaw: number; anim: number }
  | { t: "info"; patch: InfoPatch }
  | { t: "emote"; e: Emote }
  /** Mensagem para um jogo: `table` é o gameId do objeto; `op` e `data` são definidos por cada jogo. */
  | { t: "game"; table: string; op: string; data?: unknown }
  /** Pede o token da sala de áudio e vídeo (LiveKit). */
  | { t: "rtc" }
  | { t: "ping"; at: number };

export type ServerMsg =
  | { t: "welcome"; you: string; map: { id: string; version: number }; players: PlayerInfo[]; poses: PoseTuple[]; serverTime: number; games: GameSnapshot[] }
  | { t: "join"; player: PlayerInfo; pose: PoseTuple }
  | { t: "leave"; id: string }
  | { t: "poses"; at: number; list: PoseTuple[] }
  | { t: "info"; id: string; patch: InfoPatch }
  | { t: "emote"; id: string; e: Emote }
  /** Estado atual de uma mesa de jogo (enviado a todos, para quem joga e para quem assiste). */
  | { t: "game"; game: GameSnapshot }
  /** Credenciais da sala de áudio e vídeo. */
  | { t: "rtc"; url: string; token: string }
  /** Quem pode ouvir você agora (decidido no servidor): só essas pessoas recebem sua voz, vídeo e tela. */
  | { t: "audience"; ids: string[] }
  | { t: "pong"; at: number; serverTime: number }
  /** O servidor recusou uma pose (lugar não andável ou velocidade impossível) e devolve a última válida. */
  | { t: "correct"; x: number; z: number }
  | { t: "error"; code: string; message: string };

/** Fotografia de uma mesa de jogo. `state` é definido por cada jogo (ver packages/world/src/games). */
export interface GameSnapshot {
  table: string;
  kind: string;
  /** Ids dos jogadores sentados, na ordem dos lugares (null = lugar vago). */
  seats: Array<string | null>;
  phase: "waiting" | "playing" | "finished";
  state: unknown;
}

export const DEFAULT_LOOK: AvatarLook = {
  skin: "#E8B48F",
  hair: 1,
  hairColor: "#2B1E16",
  eyes: 0,
  brows: 0,
  mouth: 0,
  facial: 0,
  top: 0,
  topColor: "#00B7FF",
  topColor2: "#F2F0EF",
  bottom: 0,
  bottomColor: "#1E2A44",
  shoes: 0,
  shoesColor: "#F2F0EF",
  acc: [],
  accColor: "#1A1A1A",
};

/** Paletas sugeridas no criador de avatar. */
export const SKIN_TONES = ["#FBE0CD", "#F1C7A5", "#E8B48F", "#D29A6E", "#B47A50", "#8E5B38", "#6A3F25", "#4A2A18"] as const;
export const HAIR_COLORS = ["#16110D", "#2B1E16", "#5A3A22", "#8B5A2B", "#C68A4A", "#E2C07A", "#F3E3B3", "#B8B8B8", "#E9E9E9", "#C0392B", "#E85D9A", "#7C5CFF", "#00B7FF", "#2BC48A"] as const;
export const CLOTH_COLORS = [
  "#00B7FF",
  "#EE5C29",
  "#46AFE3",
  "#0A2547",
  "#00112A",
  "#F2F0EF",
  "#ECE6DF",
  "#8A93A3",
  "#1A1A1A",
  "#2BC48A",
  "#F2B134",
  "#E85D9A",
  "#7C5CFF",
  "#C0392B",
  "#6B4A32",
  "#3D6B4F",
] as const;
