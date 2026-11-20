import {
  CHAMADO_COOLDOWN_MS,
  CHAMADO_GAP,
  CHAMADO_ID,
  SEGUIR_ID,
  presencaRoomSpot,
  type ChamadoInvite,
  type SeguirAsk,
  type Zone,
} from "@infinity/world";
import { sendAct } from "../activities/registry.ts";
import { walkTo } from "../engine/movement.ts";
import { useApp } from "../state/store.ts";
import { toast } from "../ui/toasts.ts";
import { nearestSpot, type GuideItem } from "../ui/guide.ts";
import { self } from "../world/registry.ts";
import { world } from "../world/world.ts";
import { startApproach, stopControl } from "./controller.ts";
import { personCommandList, usePresence } from "./store.ts";
import { T } from "./strings.ts";

/** Ações de presença usadas pelo painel Pessoas, pela busca (Ctrl+K) e pelos cartões. */

export const nameOf = (id: string): string => useApp.getState().players[id]?.name ?? "Alguém";

// ---- chamar ---------------------------------------------------------------------------------

/** Quanto falta (ms) para poder chamar de novo (0 = pode). */
export function callWait(): number {
  return Math.max(0, usePresence.getState().callBlockedUntil - performance.now());
}

export function callPerson(id: string): void {
  const wait = callWait();
  if (wait > 0) {
    toast(T.call.wait(wait));
    return;
  }
  sendAct(CHAMADO_ID, "call", { to: id });
  usePresence.setState({ callBlockedUntil: performance.now() + CHAMADO_COOLDOWN_MS });
}

export function cancelCall(): void {
  sendAct(CHAMADO_ID, "cancel");
  usePresence.setState({ callOut: null });
}

export function acceptCall(inv: ChamadoInvite): void {
  sendAct(CHAMADO_ID, "accept", { from: inv.from });
  dropCallIn(inv.from);
}

/** "Chama aqui": quem chamou é que vem até você. */
export function callHere(inv: ChamadoInvite): void {
  sendAct(CHAMADO_ID, "here", { from: inv.from });
  dropCallIn(inv.from);
}

/** "Agora não", com um recado rápido opcional. */
export function declineCall(inv: ChamadoInvite, note?: string): void {
  sendAct(CHAMADO_ID, "decline", note ? { from: inv.from, note } : { from: inv.from });
  dropCallIn(inv.from);
}

/** "Responder no chat": avisa quem chamou e abre a conversa com ela. */
export function answerInChat(inv: ChamadoInvite): void {
  sendAct(CHAMADO_ID, "chat", { from: inv.from });
  dropCallIn(inv.from);
  personCommandList().find((c) => c.key === "mensagem")?.run(inv.from);
}

/** Em Foco ou Não perturbe: quem chamou fica sabendo, e aqui sobra só um lembrete para depois. */
export function quietCall(inv: ChamadoInvite): void {
  sendAct(CHAMADO_ID, "quiet", { from: inv.from });
  rememberCall(inv);
}

export function rememberCall(inv: { from: string; name: string }): void {
  usePresence.setState((s) => ({ missedCalls: [...s.missedCalls.filter((m) => m.from !== inv.from).slice(-2), { from: inv.from, name: inv.name }] }));
}

export function forgetCall(from: string): void {
  usePresence.setState((s) => ({ missedCalls: s.missedCalls.filter((m) => m.from !== from) }));
}

export function dropCallIn(from: string): void {
  usePresence.setState((s) => ({ callsIn: s.callsIn.filter((c) => c.from !== from) }));
}

/** Pede ao servidor o teleporte para perto de quem chamou (só vale depois de topar). */
export function requestTeleport(): void {
  const t = usePresence.getState().travel;
  if (!t || !t.canTeleport || t.warping) return;
  sendAct(CHAMADO_ID, "teleport", { from: t.from });
  usePresence.setState({ travel: { ...t, warping: true } });
  // Sem resposta (sem lugar livre, por exemplo): libera o botão de novo.
  window.setTimeout(() => {
    const cur = usePresence.getState().travel;
    if (cur && cur.from === t.from && cur.warping && cur.canTeleport) usePresence.setState({ travel: { ...cur, warping: false } });
  }, 2500);
}

export function stopTravel(): void {
  usePresence.setState({ travel: null });
  stopControl();
}

// ---- seguir ---------------------------------------------------------------------------------

export function askFollow(id: string): void {
  sendAct(SEGUIR_ID, "ask", { to: id });
}

export function cancelFollowAsk(): void {
  sendAct(SEGUIR_ID, "cancel");
  usePresence.setState({ followOut: null });
}

export function acceptFollow(ask: SeguirAsk): void {
  sendAct(SEGUIR_ID, "accept", { from: ask.from });
  dropFollowIn(ask.from);
}

export function declineFollow(ask: SeguirAsk): void {
  sendAct(SEGUIR_ID, "decline", { from: ask.from });
  dropFollowIn(ask.from);
}

export function dropFollowIn(from: string): void {
  usePresence.setState((s) => ({ followIn: s.followIn.filter((a) => a.from !== from) }));
}

/** Para de seguir (botão, Esc, movimento manual). */
export function stopFollowing(): void {
  if (!usePresence.getState().following) return;
  // Limpa antes de parar o controlador: o aviso de fim dele vê que já acabou e não repete o pedido.
  usePresence.setState({ following: null });
  sendAct(SEGUIR_ID, "stop", {});
  stopControl();
}

/** Quem é seguido dispensa uma pessoa (ou todas, sem `id`). */
export function dismissFollower(id?: string): void {
  const all = Object.keys(usePresence.getState().followers);
  for (const who of id ? [id] : all) sendAct(SEGUIR_ID, "stop", { who });
}

// ---- ir até ---------------------------------------------------------------------------------

/** Anda até ficar pertinho da pessoa (e acompanha se ela der uns passos), virando para ela. */
export function goToPerson(id: string): void {
  stopFollowing();
  startApproach(id, { gap: CHAMADO_GAP, maxMs: 60_000 });
}

export function goToRoom(zone: Zone): void {
  stopFollowing();
  const spot = presencaRoomSpot(world().nav, zone);
  if (spot) walkTo(spot);
}

export function goToPlace(item: GuideItem): void {
  stopFollowing();
  const spot = nearestSpot(item, { x: self.x, z: self.z });
  if (spot) walkTo(spot);
}
