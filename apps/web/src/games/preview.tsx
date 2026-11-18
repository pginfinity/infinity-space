import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "../styles.css";
import { DEFAULT_LOOK, type MapDef, type MapObject, type PlayerInfo } from "@infinity/world";
// A prévia roda as regras do servidor de verdade, no navegador, no lugar da conexão.
import { GamesManager } from "../../../server/src/games/manager.ts";
import { useApp } from "../state/store.ts";
import { setGameTransport } from "./api.ts";
import { GamesLayer } from "./GamesLayer.tsx";
import { boardCanvas } from "./boardTextures.ts";

/**
 * Prévia de desenvolvimento dos jogos, sem servidor e sem lente:
 * http://localhost:5173/src/games/preview.html  (?eu=bruno, ?mesa=xadrez-1)
 * Também é usada para conferir o visual com screenshots enquanto a planta não tem mesas.
 */

// Todas as mesas no mesmo ponto: na prévia todo mundo está "perto" de todas.
const mesa = (id: string, type: string): MapObject => ({ id, type: type as MapObject["type"], pos: { x: 0, z: 0 }, rot: 0, size: { w: 0.8, d: 0.8, h: 0.74 }, blocks: true, gameId: id });

const MAP: MapDef = {
  id: "previa",
  version: 1,
  name: "Prévia",
  floors: [],
  walls: [],
  zones: [],
  objects: [
    mesa("xadrez-1", "chess-table"),
    mesa("lig4-1", "connect4-table"),
    mesa("velha-1", "tictactoe-table"),
    mesa("damas-1", "checkers-table"),
    mesa("domino-1", "domino-table"),
    mesa("truco-1", "cards-table"),
  ],
  desks: [],
  signs: [],
  labels: [],
  spawns: [{ x: 0, z: 0 }],
};

const person = (id: string, name: string, status: PlayerInfo["status"]): PlayerInfo => ({ id, name, look: DEFAULT_LOOK, status, lens: "2d", mic: false, cam: false, screen: false });
const PEOPLE = [person("ana", "Ana Ribeiro", "available"), person("bruno", "Bruno", "focus"), person("carla", "Carla", "listening"), person("duda", "Duda", "available")];

const q = new URLSearchParams(location.search);
let me = q.get("eu") ?? "ana";

const manager = new GamesManager(MAP, {
  broadcast: (msg) => {
    if (msg.t === "game") useApp.getState().setGame(msg.game);
  },
  // Dominó e truco: a prévia mostra a visão de quem está escolhido na barra (cada um vê só a própria mão).
  broadcastEach: (msgFor) => {
    const msg = msgFor(me);
    if (msg.t === "game") useApp.getState().setGame(msg.game);
  },
  playerName: (id) => PEOPLE.find((p) => p.id === id)?.name,
  playerPos: () => ({ x: 0.5, z: 0.5 }),
});

useApp.setState({ phase: "world", conn: "open", selfId: me, players: Object.fromEntries(PEOPLE.map((p) => [p.id, p])) });
useApp.getState().setGames(manager.snapshots(me));
useApp.getState().openGame(q.get("mesa") ?? "lig4-1");
setGameTransport((table, op, data) => manager.handle(me, table, op, data));

/** Ganchos para scripts de screenshot. */
Object.assign(window, {
  __preview: {
    manager,
    store: useApp,
    as(id: string) {
      me = id;
      useApp.setState({ selfId: id });
      useApp.getState().setGames(manager.snapshots(id));
    },
    act(id: string, table: string, op: string, data?: unknown) {
      manager.handle(id, table, op, data);
    },
    canvas: boardCanvas,
  },
});

function Toolbar() {
  const selfId = useApp((s) => s.selfId);
  const active = useApp((s) => s.activeGame);
  const [tex, setTex] = useState(false);
  return (
    <div className="glass absolute right-3 top-3 z-40 flex flex-wrap items-center gap-1.5 rounded-xl p-1.5 text-xs">
      {PEOPLE.map((p) => (
        <button key={p.id} type="button" onClick={() => (window as unknown as { __preview: { as(id: string): void } }).__preview.as(p.id)} className={`rounded-lg px-2.5 py-1.5 ${selfId === p.id ? "bg-signal text-space" : "text-offwhite/80 hover:bg-offwhite/10"}`}>
          {p.name.split(" ")[0]}
        </button>
      ))}
      <span className="mx-1 h-5 w-px bg-offwhite/15" />
      {MAP.objects.map((o) => (
        <button key={o.id} type="button" onClick={() => useApp.getState().openGame(o.gameId!)} className={`rounded-lg px-2.5 py-1.5 ${active === o.gameId ? "bg-offwhite/15" : "text-offwhite/80 hover:bg-offwhite/10"}`}>
          {o.gameId}
        </button>
      ))}
      <span className="mx-1 h-5 w-px bg-offwhite/15" />
      <button type="button" onClick={() => setTex((v) => !v)} className="rounded-lg px-2.5 py-1.5 text-offwhite/80 hover:bg-offwhite/10">
        textura
      </button>
      {tex && active && <TexturePreview table={active} />}
    </div>
  );
}

/** Mostra o canvas da textura do tampo, para conferir o desenho. */
function TexturePreview({ table }: { table: string }) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!host) return;
    const c = boardCanvas(table);
    c.style.width = "256px";
    c.style.height = "256px";
    c.style.borderRadius = "12px";
    host.replaceChildren(c);
  }, [host, table]);
  return <div ref={setHost} className="absolute right-0 top-12" data-texture-preview />;
}

function Preview() {
  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: "radial-gradient(1200px 700px at 70% 40%, #0d2d55 0%, #00112A 55%, #020B18 100%)" }}>
      {/* Um "chão" de mentira para o vidro ter o que desfocar. */}
      <div className="absolute inset-0 opacity-40" style={{ backgroundImage: "linear-gradient(#1b3a66 1px, transparent 1px), linear-gradient(90deg, #1b3a66 1px, transparent 1px)", backgroundSize: "48px 48px" }} />
      <div className="absolute left-[58%] top-[42%] size-24 rounded-full bg-orange/70 blur-2xl" />
      <div className="absolute left-[20%] top-[70%] size-32 rounded-full bg-signal/40 blur-3xl" />
      <GamesLayer />
      <Toolbar />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Preview />);
