import { FOCO_ID, focoSeatOf, focoSeats, type FocoState, type MapObject, type Status } from "@infinity/world";
import { actState, sendAct } from "../registry.ts";
import { onSeatChange, seatedAt, sitAt, standUp, walkTo } from "../../engine/movement.ts";
import { sendInfo } from "../../net/session.ts";
import { useApp } from "../../state/store.ts";
import { remoteIds, sampleRemote } from "../../world/registry.ts";
import { world } from "../../world/world.ts";
import { toast } from "../../ui/toasts.ts";
import { T } from "./strings.ts";

/**
 * Lado do cliente da mesa de foco: avisa o servidor quando a pessoa senta ou levanta de um lugar da
 * mesa (o sentar em si é o de qualquer cadeira, pelo motor de interação) e cuida do status "Foco"
 * automático. Nada fica guardado: nem aqui, nem no servidor.
 */

let chairs: MapObject[] | null = null;

/** Cadeiras da mesa de foco, na ordem dos lugares. */
export function focoChairs(): MapObject[] {
  return (chairs ??= focoSeats(world().map));
}

/** Lugar da mesa onde a pessoa está sentada agora (pelo movimento local), ou -1. */
export function mySeat(): number {
  const s = seatedAt();
  return s ? focoChairs().findIndex((o) => o.id === s.objectId) : -1;
}

/** Lugar da pessoa na mesa segundo o servidor, ou -1. */
export function mySeatOnServer(): number {
  const me = useApp.getState().selfId;
  const st = actState<FocoState>(FOCO_ID);
  return me && st ? focoSeatOf(st, me) : -1;
}

// ---- sentar e levantar ------------------------------------------------------------------------

let lastSent = 0;
let tries = 0;
let triedSeat = -1;

/** Deixa o servidor igual ao lugar local (sentou, trocou de lugar ou levantou). */
function reconcile(force = false): void {
  if (!useApp.getState().selfId) return;
  const local = mySeat();
  const server = mySeatOnServer();
  if (local === server) {
    tries = 0;
    return;
  }
  const now = performance.now();
  if (!force && now - lastSent < 1500) return;
  if (local >= 0) {
    if (local !== triedSeat) {
      triedSeat = local;
      tries = 0;
    }
    // O servidor recusou várias vezes (lugar tomado por alguém ao mesmo tempo): desiste deste lugar.
    if (++tries > 3) return;
    lastSent = now;
    sendAct(FOCO_ID, "sit", { seat: local });
  } else {
    lastSent = now;
    sendAct(FOCO_ID, "leave");
  }
}

/** Levanta da mesa (botão "Sair"). */
export function leaveTable(): void {
  if (mySeat() >= 0) standUp();
  sendAct(FOCO_ID, "leave");
  lastSent = performance.now();
}

/** Alguém (remoto) sentado neste ponto? */
function taken(p: { x: number; z: number }): boolean {
  const now = performance.now();
  for (const id of remoteIds()) {
    const r = sampleRemote(id, now);
    if (r && r.anim === "sit" && Math.hypot(r.x - p.x, r.z - p.z) < 0.35) return true;
  }
  return false;
}

/** Anda até um lugar livre da mesa e senta (busca, Ctrl+K). */
export function goToTable(): void {
  if (mySeat() >= 0) return;
  const st = actState<FocoState>(FOCO_ID);
  const free = focoChairs().find((o, i) => !st?.seats[i] && !taken(o.interact!.point));
  if (!free) {
    toast(T.full);
    return;
  }
  const it = free.interact!;
  walkTo(it.point, () => sitAt(it.point, it.yaw, free.id));
}

// ---- status "Foco" automático -----------------------------------------------------------------

/** Status de antes (só enquanto o "Foco" foi posto por aqui). */
let auto: { prev: Status; at: number } | null = null;
/** A pessoa trocou o status por conta própria nesta sentada: o automático não mexe mais até ela sair da mesa. */
let optedOut = false;

function currentStatus(): Status {
  const s = useApp.getState();
  return (s.selfId && s.players[s.selfId]?.status) || "available";
}

/**
 * Liga ou desliga o "Foco" automático. Só troca quem estava Disponível ou Ouvindo; ao desligar, volta
 * ao status de antes, se a pessoa não escolheu outro no meio do caminho.
 */
export function autoFocus(on: boolean): void {
  const cur = currentStatus();
  if (on) {
    if (auto || optedOut || (cur !== "available" && cur !== "listening")) return;
    auto = { prev: cur, at: performance.now() };
    sendInfo({ status: "focus" });
    return;
  }
  if (!auto) return;
  // O eco do servidor demora um pouco: logo depois de ligar, "ainda não é Foco" não quer dizer que a pessoa trocou.
  const echoed = performance.now() - auto.at > 3000;
  if (cur === "focus" || !echoed) sendInfo({ status: auto.prev });
  auto = null;
}

/** A pessoa trocou o status por conta própria: o automático para de mexer (até ela sair da mesa). */
function watchManual(): void {
  if (auto && performance.now() - auto.at > 3000 && currentStatus() !== "focus") {
    auto = null;
    optedOut = true;
  }
}

/** Saiu da mesa: devolve o status de antes e esquece a escolha desta sentada. */
export function leftTable(): void {
  autoFocus(false);
  optedOut = false;
}

let started = false;

/** Liga a sincronia do lugar (uma vez, ao carregar o pacote). */
export function startFocoTable(): void {
  if (started) return;
  started = true;
  onSeatChange(() => {
    tries = 0;
    triedSeat = -1;
    reconcile(true);
  });
  window.setInterval(() => {
    reconcile();
    watchManual();
    // Saiu da mesa por qualquer caminho (levantou, caiu a conexão): devolve o status.
    if ((auto || optedOut) && mySeatOnServer() < 0 && mySeat() < 0) leftTable();
  }, 700);
}

/** Dev/testes: o "Foco" atual foi posto pelo automático? */
export function autoFocusOn(): boolean {
  return !!auto;
}
