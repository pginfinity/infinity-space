import type { LucideIcon } from "lucide-react";
import { Bell, Bot, Camera, Coffee, Crown, Disc3, Droplets, Gamepad2, Grid3x3, Mic, Music, PenTool, Rocket, Rows3, Search, StickyNote, Telescope, Trash2, Trophy } from "lucide-react";
import type { MapObject, ObjectType, Vec2 } from "@infinity/world";
import { world } from "../world/world.ts";

/**
 * Guia da estação: o que dá para fazer e onde. Aparece no mapa ampliado, com marcadores
 * e "ir até lá". Cada entrada aponta para tipos de objeto do mapa; com vários iguais, vai ao mais perto.
 */

export type GuideGroup = "Jogos" | "Escritório" | "Estação";

interface GuideDef {
  key: string;
  label: string;
  hint: string;
  group: GuideGroup;
  icon: LucideIcon;
  types: ObjectType[];
}

const DEFS: GuideDef[] = [
  { key: "quiz", label: "Quiz Show", hint: "Suba ao púlpito e apresente", group: "Jogos", icon: Mic, types: ["lectern"] },
  { key: "desenho", label: "Desenhe e adivinhe", hint: "Nos quadros brancos", group: "Jogos", icon: PenTool, types: ["whiteboard"] },
  { key: "stop", label: "Stop", hint: "Adedonha no cavalete da copa", group: "Jogos", icon: Rows3, types: ["stop-board"] },
  { key: "impostor", label: "Impostor na Estação", hint: "Terminal de missões", group: "Jogos", icon: Search, types: ["mission-console"] },
  { key: "hockey", label: "Hockey de mesa", hint: "Para dois, em tempo real", group: "Jogos", icon: Gamepad2, types: ["airhockey"] },
  { key: "pingue", label: "Pingue-pongue", hint: "Para dois, em tempo real", group: "Jogos", icon: Gamepad2, types: ["pingpong"] },
  { key: "sinuca", label: "Sinuca", hint: "Bola 8, para dois", group: "Jogos", icon: Disc3, types: ["pool"] },
  { key: "fliper", label: "Fliperamas", hint: "Três jogos com ranking", group: "Jogos", icon: Trophy, types: ["arcade"] },
  { key: "tabuleiro", label: "Xadrez, Lig 4 e velha", hint: "Mesas de jogo do Arcade", group: "Jogos", icon: Crown, types: ["chess-table", "connect4-table", "tictactoe-table"] },
  { key: "cafe-jogos", label: "Damas, dominó e truco", hint: "Mesas de jogo do café", group: "Jogos", icon: Crown, types: ["checkers-table", "domino-table", "cards-table"] },
  { key: "bolinha", label: "Bolinha de papel", hint: "Acerte a lixeira de longe", group: "Jogos", icon: Trash2, types: ["trash-bin"] },
  { key: "gongo", label: "Gongo", hint: "Comemore uma venda", group: "Escritório", icon: Bell, types: ["gong"] },
  { key: "deploy", label: "Botão de deploy", hint: "Lança um foguete", group: "Escritório", icon: Rocket, types: ["big-button"] },
  { key: "mural", label: "Mural de recados", hint: "Post-its para o time", group: "Escritório", icon: StickyNote, types: ["notice-board"] },
  { key: "cabine", label: "Cabine de fotos", hint: "Foto da turma", group: "Escritório", icon: Camera, types: ["camera-tripod"] },
  { key: "copa", label: "Copa", hint: "Café, chá, suco e pipoca", group: "Estação", icon: Coffee, types: ["coffee-machine"] },
  { key: "plantas", label: "Estação de rega", hint: "As plantas precisam de você", group: "Estação", icon: Droplets, types: ["watering-station"] },
  { key: "jukebox", label: "Jukebox", hint: "Música para quem está perto", group: "Estação", icon: Music, types: ["jukebox"] },
  { key: "telescopio", label: "Telescópio", hint: "A Terra, daqui da estação", group: "Estação", icon: Telescope, types: ["telescope"] },
  { key: "recordes", label: "Recordes do Arcade", hint: "Quem manda nos fliperamas", group: "Estação", icon: Grid3x3, types: ["arcade-board"] },
  { key: "orbi", label: "Orbi", hint: "O robô passeia pelo Átrio, copa e Arcade", group: "Estação", icon: Bot, types: [] },
];

export interface GuideItem {
  key: string;
  label: string;
  hint: string;
  group: GuideGroup;
  icon: LucideIcon;
  /** Onde ficam (ponto de chegada de cada exemplar). */
  spots: Vec2[];
  /** Nome da sala do primeiro exemplar. */
  room: string;
}

let items: GuideItem[] | null = null;

/** Entradas do guia que existem neste mapa. */
export function guideItems(): GuideItem[] {
  if (items) return items;
  const { map, zones } = world();
  const out: GuideItem[] = [];
  for (const d of DEFS) {
    const objs = map.objects.filter((o) => d.types.includes(o.type));
    if (d.types.length && !objs.length) continue;
    const spots = objs.map(spotOf);
    const first = objs[0];
    const room = first ? (zones.zoneAt(first.interact?.point ?? first.pos)?.name ?? "") : "Átrio";
    out.push({ key: d.key, label: d.label, hint: d.hint, group: d.group, icon: d.icon, spots, room });
  }
  items = out;
  return out;
}

function spotOf(o: MapObject): Vec2 {
  return o.interact?.point ?? o.pos;
}

/** O exemplar mais perto de `from`. */
export function nearestSpot(item: GuideItem, from: Vec2): Vec2 | null {
  let best: Vec2 | null = null;
  let bestD = Infinity;
  for (const s of item.spots) {
    const d = Math.hypot(s.x - from.x, s.z - from.z);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}
