import { create } from "zustand";
import { DEFAULT_LOOK, type AvatarLook, type GameSnapshot, type InfoPatch, type Lens, type PlayerInfo } from "@infinity/world";

export type Phase = "entry" | "world";
export type ConnState = "idle" | "connecting" | "open" | "reconnecting" | "error";

export interface Profile {
  name: string;
  look: AvatarLook;
}

interface AppState {
  phase: Phase;
  profile: Profile;
  lens: Lens;
  conn: ConnState;
  error: string | null;
  selfId: string | null;
  players: Record<string, PlayerInfo>;
  zoneName: string;
  peopleOpen: boolean;
  /** Estado de todas as mesas de jogo, por gameId. */
  games: Record<string, GameSnapshot>;
  /** Mesa de jogo aberta na tela (painel do jogo), se houver. */
  activeGame: string | null;
  /** Estúdio do avatar aberto por cima do escritório (Editar avatar, sem sair). */
  avatarEdit: boolean;

  setProfile(p: Partial<Profile>): void;
  editAvatar(open: boolean): void;
  setGames(list: GameSnapshot[]): void;
  setGame(g: GameSnapshot): void;
  openGame(table: string | null): void;
  setLens(l: Lens): void;
  enter(): void;
  leave(): void;
  setConn(c: ConnState, error?: string | null): void;
  welcome(selfId: string, players: PlayerInfo[]): void;
  addPlayer(p: PlayerInfo): void;
  removePlayer(id: string): void;
  patchPlayer(id: string, patch: InfoPatch): void;
  setZoneName(name: string): void;
  togglePeople(open?: boolean): void;
}

const STORAGE_KEY = "infinity-space:profile:v2";

interface Saved {
  profile: Profile;
  lens: Lens;
}

function load(): Saved | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Saved;
    // Visual salvo em versões antigas: completa com o padrão.
    return { ...s, profile: { ...s.profile, look: { ...DEFAULT_LOOK, ...s.profile.look } } };
  } catch {
    return null;
  }
}

function save(s: Saved): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* armazenamento indisponível: segue sem lembrar */
  }
}

/** Celular e tablet abrem no 2D por padrão. */
function defaultLens(): Lens {
  const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  return coarse ? "2d" : "3d";
}

const saved = load();

/** Atalho de desenvolvimento e testes: ?nome=Ana&lente=3d entra direto. */
const devEntry = (() => {
  if (!import.meta.env.DEV) return null;
  const q = new URLSearchParams(location.search);
  const name = q.get("nome");
  if (!name) return null;
  const lente = q.get("lente");
  const lens: Lens | null = lente === "2d" || lente === "3d" ? lente : null;
  return { name, lens };
})();

export const useApp = create<AppState>((set, get) => ({
  phase: devEntry ? "world" : "entry",
  profile: devEntry ? { name: devEntry.name, look: saved?.profile.look ?? DEFAULT_LOOK } : (saved?.profile ?? { name: "", look: DEFAULT_LOOK }),
  lens: devEntry?.lens ?? saved?.lens ?? defaultLens(),
  conn: "idle",
  error: null,
  selfId: null,
  players: {},
  zoneName: "",
  peopleOpen: false,
  games: {},
  activeGame: null,
  avatarEdit: false,

  editAvatar: (avatarEdit) => set({ avatarEdit }),
  setGames: (list) => set({ games: Object.fromEntries(list.map((g) => [g.table, g])) }),
  setGame: (g) => set((s) => ({ games: { ...s.games, [g.table]: g } })),
  openGame: (activeGame) => set({ activeGame }),
  setProfile: (p) => set((s) => ({ profile: { ...s.profile, ...p, look: { ...s.profile.look, ...p.look } } })),
  setLens: (lens) => {
    set({ lens });
    // Na tela de criação o nome ainda não foi confirmado: guardar agora faria a próxima visita pular a criação.
    save({ profile: get().phase === "world" ? get().profile : (load()?.profile ?? { name: "", look: get().profile.look }), lens });
  },
  enter: () => {
    const { profile, lens } = get();
    save({ profile, lens });
    set({ phase: "world" });
  },
  leave: () => set({ phase: "entry", conn: "idle", selfId: null, players: {}, peopleOpen: false, games: {}, activeGame: null, avatarEdit: false }),
  setConn: (conn, error = null) => set({ conn, error }),
  welcome: (selfId, players) => set({ selfId, players: Object.fromEntries(players.map((p) => [p.id, p])) }),
  addPlayer: (p) => set((s) => ({ players: { ...s.players, [p.id]: p } })),
  removePlayer: (id) =>
    set((s) => {
      const players = { ...s.players };
      delete players[id];
      return { players };
    }),
  patchPlayer: (id, patch) =>
    set((s) => {
      const cur = s.players[id];
      return cur ? { players: { ...s.players, [id]: { ...cur, ...patch } } } : {};
    }),
  setZoneName: (zoneName) => {
    if (get().zoneName !== zoneName) set({ zoneName });
  },
  togglePeople: (open) => set((s) => ({ peopleOpen: open ?? !s.peopleOpen })),
}));
