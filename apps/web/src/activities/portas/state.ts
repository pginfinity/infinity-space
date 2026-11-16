import { create } from "zustand";
import {
  PORTAS_ID,
  PRIVACY,
  circleCandidates,
  doorBars,
  doorsOf,
  hearing,
  portasPrivacy,
  wallBetween,
  type CircleSnap,
  type DoorDef,
  type PortasPerson,
  type PortasState,
  type PrivacyRules,
  type Vec2,
} from "@infinity/world";
import { actState, sendAct, useActs } from "../registry.ts";
import { useApp } from "../../state/store.ts";
import { remoteIds, sampleRemote, self } from "../../world/registry.ts";
import { world } from "../../world/world.ts";
import { setPrivacyRules, setWhisper, useMedia } from "../../media/rtc.ts";
import { setMoveGuard, walkTo } from "../../engine/movement.ts";
import { toast } from "../../ui/toasts.ts";
import { T } from "./strings.ts";

/**
 * Estado do pacote "portas" no cliente: o que só esta pessoa sabe (sussurros, pedidos em andamento)
 * e as contas compartilhadas com o servidor (quem pode entrar, quem ouve quem).
 */

interface PortasUi {
  /** Seu sussurro agora (null = falando normalmente). */
  whisper: { to: string; name: string } | null;
  /** Quem está sussurrando para você (id → nome). */
  incoming: Record<string, string>;
}

export const usePortasUi = create<PortasUi>(() => ({ whisper: null, incoming: {} }));

export const myId = (): string | null => useApp.getState().selfId;
export const nameOf = (id: string): string => useApp.getState().players[id]?.name ?? "Alguém";
export const portas = (): PortasState | undefined => actState<PortasState>(PORTAS_ID);

let doorList: DoorDef[] | null = null;
/** As portas do mapa (fixas). */
export function doors(): DoorDef[] {
  doorList ??= doorsOf(world().map);
  return doorList;
}

export function doorOf(zoneId: string | undefined): DoorDef | undefined {
  return zoneId ? doors().find((d) => d.zoneId === zoneId) : undefined;
}

/** Zona onde um ponto está. */
export function zoneAt(p: Vec2) {
  return world().zones.zoneAt(p);
}

/** Você (pose atual) como pessoa para as contas da roda. */
export function meAsPerson(): PortasPerson | null {
  const id = myId();
  return id ? { id, pos: { x: self.x, z: self.z }, zone: zoneAt(self) } : null;
}

/** As outras pessoas, com a pose interpolada de agora. */
export function others(): PortasPerson[] {
  const out: PortasPerson[] = [];
  const now = performance.now();
  for (const id of remoteIds()) {
    const r = sampleRemote(id, now);
    if (r) out.push({ id, pos: { x: r.x, z: r.z }, zone: zoneAt(r) });
  }
  return out;
}

/** A roda em que você está. */
export function myCircle(state = portas()): CircleSnap | undefined {
  const id = myId();
  return id ? state?.circles.find((c) => c.members.includes(id)) : undefined;
}

/** Quem entraria na roda se você a fechasse agora (mesma conta do servidor). */
export function circleNow(): string[] {
  const me = meAsPerson();
  if (!me) return [];
  const taken = new Set((portas()?.circles ?? []).flatMap((c) => c.members));
  return circleCandidates(world().map.walls, me, others(), taken);
}

/**
 * A pessoa mais perto para sussurrar (até 1,5 m, sem parede, e que ouviria você normalmente:
 * nada de sussurrar para dentro de uma roda fechada ou de uma sala), ou null.
 */
export function whisperCandidate(): PortasPerson | null {
  const walls = world().map.walls;
  const me = meAsPerson();
  if (!me) return null;
  rebuildRules();
  const priv: PrivacyRules = { doors: rules.doors, circles: rules.circles };
  let best: PortasPerson | null = null;
  let bestD = Infinity;
  for (const p of others()) {
    const d = Math.hypot(p.pos.x - self.x, p.pos.z - self.z);
    if (d > PRIVACY.whisperRange || d >= bestD || wallBetween(walls, self, p.pos)) continue;
    if (hearing(walls, p, me, { privacy: priv }).mode !== "clear") continue;
    best = p;
    bestD = d;
  }
  return best;
}

// ---- regras de audição no cliente (mesmas do servidor) ------------------------------------------

let rules: PrivacyRules = {};
let rulesFor: { state: PortasState | undefined; incoming: Record<string, string>; me: string | null } | null = null;

function rebuildRules(): void {
  const state = portas();
  const incoming = usePortasUi.getState().incoming;
  const me = myId();
  if (rulesFor && rulesFor.state === state && rulesFor.incoming === incoming && rulesFor.me === me) return;
  rulesFor = { state, incoming, me };
  // Sussurros que chegam até você: a voz de quem sussurra só vale se você estiver perto (regra comum).
  const whispers = new Map<string, string>();
  if (me) for (const from of Object.keys(incoming)) whispers.set(from, me);
  rules = portasPrivacy(state, whispers);
}

/** A sua voz, sussurrando, chega a quem você escolheu? (perto, sem parede, mesma conversa) */
export function whisperReaches(to: string): boolean {
  const me = myId();
  const r = sampleRemote(to);
  if (!me || !r) return false;
  const priv = { ...rules, whispers: new Map([[me, to]]) };
  return hearing(world().map.walls, { id: to, pos: r, zone: zoneAt(r) }, { id: me, pos: { x: self.x, z: self.z }, zone: zoneAt(self) }, { privacy: priv }).mode !== "none";
}

// ---- sussurro ---------------------------------------------------------------------------------

/** Começa a sussurrar para a pessoa mais perto. Devolve false se não há ninguém perto. */
export function startWhisper(): boolean {
  if (usePortasUi.getState().whisper) return true;
  const p = whisperCandidate();
  if (!p) {
    toast(T.whisper.nobody);
    return false;
  }
  // Primeiro restringe a própria voz (na hora), depois avisa o servidor.
  setWhisper(p.id);
  sendAct(PORTAS_ID, "sussurro", { to: p.id });
  usePortasUi.setState({ whisper: { to: p.id, name: nameOf(p.id) } });
  if (!useMedia.getState().mic) toast(T.whisper.micOff);
  return true;
}

export function stopWhisper(): void {
  if (!usePortasUi.getState().whisper) return;
  usePortasUi.setState({ whisper: null });
  // A lista do servidor ainda é a do sussurro até ele processar o fim: soltar aqui não abre a voz antes.
  setWhisper(null);
  sendAct(PORTAS_ID, "sussurro-fim");
}

// ---- ligação com o resto do cliente -------------------------------------------------------------

/** Depois de "pode entrar": entra assim que o estado novo (com você admitido) chegar. */
let enterZone: { zone: string; until: number } | null = null;
export function enterWhenAdmitted(zone: string): void {
  enterZone = { zone, until: Date.now() + 5000 };
  tryEnter();
}

function tryEnter(): void {
  if (!enterZone) return;
  const id = myId();
  if (!id || Date.now() > enterZone.until) {
    enterZone = null;
    return;
  }
  if (doorBars(portas(), enterZone.zone, id)) return;
  const d = doorOf(enterZone.zone);
  enterZone = null;
  if (d) walkTo(d.inside);
}

let installed = false;

/** Liga as regras de audição, a trava de movimento nas portas fechadas e as reações ao estado. */
export function installPortas(): void {
  if (installed) return;
  installed = true;
  setPrivacyRules(() => {
    rebuildRules();
    return rules;
  });
  setMoveGuard({
    blocks: (p) => {
      const id = myId();
      return !!id && doorBars(portas(), zoneAt(p)?.id, id);
    },
    redirect: (target) => {
      const d = doorOf(zoneAt(target)?.id);
      if (!d) return null;
      toast(T.door.redirected);
      return d.outside;
    },
  });
  useActs.subscribe((s, prev) => {
    if (s.acts[PORTAS_ID] !== prev.acts[PORTAS_ID]) tryEnter();
  });
}
