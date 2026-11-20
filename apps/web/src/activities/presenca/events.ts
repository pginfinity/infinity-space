import {
  CHAMADO_GAP,
  PORTAS_ID,
  SEGUIR_ID,
  CHAMADO_WALK_MAX,
  chamadoPathLength,
  seguirGoal,
  type ChamadoAccepted,
  type ChamadoCalling,
  type ChamadoEnd,
  type ChamadoGo,
  type ChamadoInvite,
  type ChamadoTravel,
  type ChamadoWait,
  type ChamadoWarp,
  type PortasState,
  type SeguirAsk,
  type SeguirAsking,
  type SeguirEnd,
  type SeguirStart,
} from "@infinity/world";
import { actState, sendAct, type ActEvent } from "../registry.ts";
import { sfx } from "../../audio/sfx.ts";
import { avatarEffect, setAvatarEffect } from "../../avatar/effects.ts";
import { useApp } from "../../state/store.ts";
import { toast } from "../../ui/toasts.ts";
import { sampleRemote, self } from "../../world/registry.ts";
import { world } from "../../world/world.ts";
import { dropCallIn, dropFollowIn, nameOf, quietCall, rememberCall } from "../../presence/actions.ts";
import { setFace, startApproach, startDash, startFollow, stopControl, type ControlEnd } from "../../presence/controller.ts";
import { myStatus } from "../../presence/status.ts";
import { usePresence } from "../../presence/store.ts";
import { T } from "../../presence/strings.ts";
import { notifyDesktop } from "../../ui/DesktopNotify.tsx";

/** Acontecimentos do servidor: chamados e seguir. Atualizam a interface e o andar automático. */

const me = (): string | null => useApp.getState().selfId;

// ---- chamado ------------------------------------------------------------------------------

/** Em Foco, ou dentro de uma sala com Não perturbe: chamado não toma a tela, vira um lembrete para depois. */
export function callsQuiet(): boolean {
  if (myStatus() === "focus") return true;
  const zone = world().zones.zoneAt(self)?.id;
  return !!zone && actState<PortasState>(PORTAS_ID)?.doors[zone]?.state === "locked";
}

export function onCallEvent(e: ActEvent): void {
  const now = performance.now();
  switch (e.ev) {
    case "call": {
      const d = e.data as ChamadoInvite;
      if (callsQuiet()) {
        quietCall(d);
        break;
      }
      usePresence.setState((s) => ({ callsIn: [...s.callsIn.filter((c) => c.from !== d.from).slice(-2), { ...d, start: now }] }));
      sfx("presenca-chamado", { volume: 0.45 });
      notifyDesktop("chamado", T.call.incoming(d.name));
      break;
    }
    case "calling":
      usePresence.setState({ callOut: { ...(e.data as ChamadoCalling), start: now } });
      break;
    case "accepted": {
      const d = e.data as ChamadoAccepted;
      if (usePresence.getState().callOut?.to === d.by) usePresence.setState({ callOut: null });
      toast(T.call.accepted(d.name));
      break;
    }
    case "end": {
      const d = e.data as ChamadoEnd;
      if (d.to === me()) {
        const had = usePresence.getState().callsIn.find((c) => c.from === d.from);
        dropCallIn(d.from);
        if (had && d.reason === "cancel") toast(T.call.canceled(nameOf(d.from)));
        // Ninguém respondeu (longe do teclado): sobra o lembrete de quem chamou.
        if (had && d.reason === "expired") rememberCall(had);
      }
      if (d.from === me()) {
        const out = usePresence.getState().callOut;
        if (out?.to === d.to) {
          usePresence.setState({ callOut: null });
          const name = out.name;
          if (d.reason === "declined") toast(d.note ? T.call.declinedNote(name, d.note) : T.call.declined(name), d.note ? 7000 : undefined);
          else if (d.reason === "chat") toast(T.call.chatReply(name));
          else if (d.reason === "quiet") toast(T.call.quiet(name), 6000);
          else if (d.reason === "expired") toast(T.call.expired(name));
          else if (d.reason === "left") toast(T.call.left(name));
        }
      }
      break;
    }
    case "go": {
      const d = e.data as ChamadoGo;
      // "Chama aqui": quem você chamou pediu para você ir até lá.
      if (d.here) {
        if (usePresence.getState().callOut?.to === d.from) usePresence.setState({ callOut: null });
        toast(T.call.hereGo(d.name));
      }
      startTravel(d);
      break;
    }
    case "travel":
      onTravel(e.data as ChamadoTravel);
      break;
    case "warp":
      onWarp(e.data as ChamadoWarp);
      break;
    case "wait": {
      const d = e.data as ChamadoWait;
      usePresence.setState({ callBlockedUntil: now + d.ms });
      toast(T.call.wait(d.ms));
      break;
    }
  }
}

/** Topou o chamado: anda até perto de quem chamou; se o caminho for longo, oferece o teleporte. */
function startTravel(d: ChamadoGo): void {
  const { nav } = world();
  const goal = nav.nearestWalkable(seguirGoal(d.at, self, CHAMADO_GAP), 1.2) ?? d.at;
  const route = nav.findPath(self, goal);
  const meters = route ? chamadoPathLength(self, route) : Infinity;
  usePresence.setState({ travel: { from: d.from, name: d.name, meters, canTeleport: meters > CHAMADO_WALK_MAX, warping: false } });
  startApproach(d.from, { gap: CHAMADO_GAP, maxMs: 120_000, onEnd: (why) => travelEnded(d.from, why) });
}

function travelEnded(from: string, why: ControlEnd): void {
  const t = usePresence.getState().travel;
  if (!t || t.from !== from) return;
  // Pediu o teleporte: o controlador troca de modo e quem decide o fim é a travessia.
  if (t.warping && why === "replaced") return;
  usePresence.setState({ travel: null });
  if (why === "arrived") toast(T.call.arrived(t.name));
}

function onTravel(d: ChamadoTravel): void {
  const t = usePresence.getState().travel;
  const name = t?.name ?? nameOf(d.from);
  if (d.mode === "instant") {
    // A sala já mudou a posição (correção de pose): só para o andar e vira para quem chamou.
    usePresence.setState({ travel: null });
    stopControl();
    setFace(d.from, 1200);
    toast(T.call.arrived(name));
    return;
  }
  // A pessoa desistiu ("Parar") enquanto o destino vinha: fica onde está.
  if (!t || t.from !== d.from) return;
  usePresence.setState({ travel: { ...t, warping: true, canTeleport: false } });
  startDash(d.to, d.from, {
    onEnd: (why) => {
      if (usePresence.getState().travel?.from === d.from) usePresence.setState({ travel: null });
      if (why === "arrived") toast(T.call.arrived(name));
    },
  });
}

/** Efeito de teleporte (para todos): o avatar fica translúcido enquanto atravessa. */
function onWarp(d: ChamadoWarp): void {
  const p = d.id === me() ? self : sampleRemote(d.id);
  if (p) sfx("presenca-warp", { at: { x: p.x, z: p.z }, range: 16, volume: 0.5 });
  // Já era fantasma por outro motivo (um jogo): não mexe.
  if (avatarEffect(d.id)?.ghost) return;
  setAvatarEffect(d.id, { ghost: true });
  window.setTimeout(() => setAvatarEffect(d.id, null), Math.max(300, Math.min(10_000, d.ms)));
}

// ---- seguir -------------------------------------------------------------------------------

export function onFollowEvent(e: ActEvent): void {
  const now = performance.now();
  const id = me();
  switch (e.ev) {
    case "ask": {
      const d = e.data as SeguirAsk;
      usePresence.setState((s) => ({ followIn: [...s.followIn.filter((a) => a.from !== d.from).slice(-2), { ...d, start: now }] }));
      if (myStatus() !== "focus") sfx("presenca-seguir", { volume: 0.4 });
      break;
    }
    case "asking":
      usePresence.setState({ followOut: { ...(e.data as SeguirAsking), start: now } });
      break;
    case "start": {
      const d = e.data as SeguirStart;
      if (d.follower === id) {
        usePresence.setState({ followOut: null, following: { leader: d.leader, name: d.leaderName, waiting: false } });
        startFollow(d.leader, {
          onEnd: (why) => followEnded(d.leader, d.leaderName, why),
          onWait: (waiting) => {
            const f = usePresence.getState().following;
            if (f?.leader === d.leader) usePresence.setState({ following: { ...f, waiting } });
          },
        });
        toast(T.follow.started(d.leaderName), 4000);
      }
      if (d.leader === id) {
        usePresence.setState((s) => ({ followers: { ...s.followers, [d.follower]: d.followerName } }));
        sfx("presenca-seguir", { volume: 0.35 });
      }
      break;
    }
    case "end": {
      const d = e.data as SeguirEnd;
      if (d.follower === id) {
        const s = usePresence.getState();
        if (s.followOut?.to === d.leader) {
          usePresence.setState({ followOut: null });
          const name = s.followOut.name;
          if (d.reason === "declined") toast(T.follow.declined(name));
          else if (d.reason === "expired") toast(T.follow.expired(name));
          else if (d.reason === "left") toast(T.follow.left(name));
        }
        if (s.following?.leader === d.leader) {
          const name = s.following.name;
          usePresence.setState({ following: null });
          stopControl();
          if (d.reason === "left") toast(T.follow.left(name));
          else if (d.reason === "stopped" && d.by === d.leader) toast(T.follow.stoppedByLeader(name));
        }
      }
      if (d.leader === id) {
        dropFollowIn(d.follower);
        const name = usePresence.getState().followers[d.follower];
        if (name !== undefined) {
          usePresence.setState((s) => {
            const followers = { ...s.followers };
            delete followers[d.follower];
            return { followers };
          });
          if (d.reason === "stopped" && d.by === d.follower) toast(T.follow.stoppedFollower(name));
          if (d.reason === "left") toast(T.follow.left(name));
        }
      }
      break;
    }
  }
}

/** O andar automático acabou do lado de quem segue (movimento manual, sumiu...): avisa o servidor. */
function followEnded(leader: string, name: string, why: ControlEnd): void {
  const f = usePresence.getState().following;
  if (!f || f.leader !== leader) return;
  usePresence.setState({ following: null });
  sendAct(SEGUIR_ID, "stop", {});
  if (why === "manual" || why === "replaced") toast(T.follow.youStopped(name));
  else if (why === "lost") toast(T.follow.lost(name));
}

/**
 * Reconectou (id novo): o servidor já esqueceu os pedidos e o seguir da conexão antiga.
 * Limpa a interface e para o andar automático, sem avisar ninguém.
 */
export function resetOnReconnect(): void {
  useApp.subscribe((s, prev) => {
    if (s.selfId === prev.selfId) return;
    const cur = usePresence.getState();
    usePresence.setState({ callsIn: [], callOut: null, travel: null, followIn: [], followOut: null, following: null, followers: {}, paletteOpen: cur.paletteOpen });
    stopControl();
  });
}
