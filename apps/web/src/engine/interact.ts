import { create } from "zustand";
import { ANIMS, wallBetween, type InteractAction, type MapObject, type Vec2 } from "@infinity/world";
import { world } from "../world/world.ts";
import { remoteIds, sampleRemote, self } from "../world/registry.ts";
import { useApp } from "../state/store.ts";
import { seatedAt, sitAt, walkTo } from "./movement.ts";
import { doEmote } from "./emotes.ts";
import { toast } from "../ui/toasts.ts";
import { openGame, useGamesUi } from "../games/api.ts";
import { activityClients, clientForObject, type DynamicTarget } from "../activities/registry.ts";

/**
 * Interação com o mundo: acha o objeto mais próximo que dá para usar, mostra o botão
 * ("E · Sentar", "E · Jogar xadrez") e executa a ação ao apertar E ou clicar no botão.
 */

export interface InteractTarget {
  /** Objeto do mapa (ausente em alvos dinâmicos das atividades: robô, pessoa, avião no chão). */
  object?: MapObject;
  point: Vec2;
  action: InteractAction | "dynamic";
  /** Ação de um alvo dinâmico. */
  run?: () => void;
  label: string;
  /** Muda quando o alvo muda (para a UI animar). */
  key: string;
}

interface InteractState {
  target: InteractTarget | null;
}

export const useInteract = create<InteractState>(() => ({ target: null }));

interface Candidate {
  object: MapObject;
  point: Vec2;
}

let candidates: Candidate[] | null = null;
function all(): Candidate[] {
  if (!candidates) {
    candidates = [];
    for (const o of world().map.objects) {
      const it = o.interact;
      if (!it) continue;
      for (const p of [it.point, ...(it.more ?? [])]) candidates.push({ object: o, point: p });
    }
  }
  return candidates;
}

const SIT = ANIMS.indexOf("sit");
void SIT;

/** Alguém já está sentado aqui? */
function occupied(p: Vec2): boolean {
  const now = performance.now();
  for (const id of remoteIds()) {
    const r = sampleRemote(id, now);
    if (r && r.anim === "sit" && Math.hypot(r.x - p.x, r.z - p.z) < 0.35) return true;
  }
  return false;
}

function labelFor(o: MapObject): string {
  if (o.gameId && o.interact?.action === "sit") return "Sentar e jogar";
  const custom = o.interact?.action !== "sit" ? clientForObject(o.type)?.label?.(o) : undefined;
  if (custom) return custom;
  return o.interact?.label ?? "Usar";
}

function scan(): void {
  if (useApp.getState().conn !== "open") return;
  const seat = seatedAt();
  const walls = world().map.walls;
  let best: Candidate | null = null;
  let bestD = Infinity;
  for (const c of all()) {
    const it = c.object.interact!;
    const d = Math.hypot(c.point.x - self.x, c.point.z - self.z);
    if (d > it.radius || d >= bestD) continue;
    // Nada de interagir através de parede (a TV da sala ao lado, por exemplo).
    if (wallBetween(walls, self, c.point)) continue;
    if (it.action === "sit" && (seat?.objectId === c.object.id || occupied(c.point))) continue;
    best = c;
    bestD = d;
  }
  // Alvos dinâmicos das atividades (ganham de objetos quando estão mais perto).
  let dyn: DynamicTarget | null = null;
  for (const client of activityClients()) {
    if (!client.targets) continue;
    let list: DynamicTarget[] = [];
    try {
      list = client.targets();
    } catch (e) {
      console.error(`[atividades] ${client.name} falhou em targets():`, e);
    }
    for (const t of list) {
      const d = Math.hypot(t.point.x - self.x, t.point.z - self.z);
      if (d > t.radius || d >= bestD || wallBetween(walls, self, t.point)) continue;
      dyn = t;
      bestD = d;
    }
  }
  const cur = useInteract.getState().target;
  if (dyn) {
    const key = `dyn:${dyn.key}`;
    if (cur?.key === key && cur.label === dyn.label) return;
    useInteract.setState({ target: { point: dyn.point, action: "dynamic", run: dyn.run, label: dyn.label, key } });
    return;
  }
  if (!best) {
    if (cur) useInteract.setState({ target: null });
    return;
  }
  const key = `${best.object.id}:${best.point.x}:${best.point.z}`;
  const label = labelFor(best.object);
  if (cur?.key === key && cur.label === label) return;
  useInteract.setState({ target: { object: best.object, point: best.point, action: best.object.interact!.action, label, key } });
}

/** Executa a ação do alvo atual. */
export function activate(target = useInteract.getState().target): void {
  if (!target) return;
  if (target.action === "dynamic" || !target.object) {
    target.run?.();
    return;
  }
  const o = target.object;
  const it = o.interact!;
  // Uma atividade registrada para este tipo de objeto assume a interação (menos sentar).
  const client = target.action !== "sit" ? clientForObject(o.type) : undefined;
  if (client?.use) {
    client.use(o);
    return;
  }
  switch (target.action) {
    case "sit": {
      const yaw = it.point === target.point ? it.yaw : it.yaw;
      const sit = () => {
        sitAt(target.point, yaw, o.id);
        if (o.gameId) {
          openGame(o.gameId);
          if (o.gameSeat !== undefined) useGamesUi.getState().requestSeat(o.gameId, o.gameSeat);
        }
      };
      if (Math.hypot(target.point.x - self.x, target.point.z - self.z) < 0.45) sit();
      else walkTo(target.point, sit);
      break;
    }
    case "play":
      if (o.gameId && useApp.getState().games[o.gameId]) openGame(o.gameId);
      else toast(`${o.label ?? it.label ?? "Este jogo"} chega numa próxima atualização.`);
      break;
    case "watch":
      toast(o.type === "leaderboard" ? "O ranking de vendas aparece aqui quando a integração for ligada." : "Ninguém está compartilhando a tela aqui agora.");
      break;
    case "use":
      use(o);
      break;
  }
}

function use(o: MapObject): void {
  switch (o.type) {
    case "big-button":
      doEmote("cheer");
      toast("Deploy disparado. Boa sorte em produção!");
      break;
    case "coffee-machine":
      toast("Café servido. ☕");
      break;
    case "water-cooler":
      toast("Água fresquinha. Hidrate-se!");
      break;
    case "directory":
      window.dispatchEvent(new Event("infinity:map"));
      break;
    case "jukebox":
      toast("A jukebox com as trilhas do time chega em breve.");
      break;
    case "lectern":
      walkTo(o.interact!.point, () => {
        sitAt(o.interact!.point, o.interact!.yaw, o.id);
        toast("Você está no palco: todo o auditório te ouve.");
      });
      break;
    default:
      toast("Nada acontece... por enquanto.");
  }
}

let timer: number | undefined;

function onKey(e: KeyboardEvent): void {
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
  if (e.code === "KeyE" || e.code === "KeyF") activate();
}

export function startInteract(): void {
  window.clearInterval(timer);
  timer = window.setInterval(scan, 100);
  window.addEventListener("keydown", onKey);
}

export function stopInteract(): void {
  window.clearInterval(timer);
  window.removeEventListener("keydown", onKey);
  useInteract.setState({ target: null });
}
