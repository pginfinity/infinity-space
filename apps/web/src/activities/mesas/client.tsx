import { useEffect, useRef } from "react";
import { MESAS_KIND, mesasDeskOf, mesasKey, mesasLabel, mesasOwner, type MesasPrivate } from "@infinity/world";
import type { ActivityClient, DynamicTarget } from "../registry.ts";
import { registerSynth, sfx } from "../../audio/sfx.ts";
import { seatedAt } from "../../engine/movement.ts";
import { serverNow } from "../../net/session.ts";
import { useApp } from "../../state/store.ts";
import { toast } from "../../ui/toasts.ts";
import { self } from "../../world/registry.ts";
import { act, deskByChair, deskById, mesasState, myKey, openCard, openPanel, pending, unread, useMesas } from "./state.ts";
import { goSit, selfNear } from "./shared.ts";
import { ArrivalChip, MesasPanels } from "./ui.tsx";
import { MesasScene } from "./scene.tsx";
import { T } from "./strings.ts";

/**
 * Pacote "mesas" no cliente: check-in nas mesas rotativas, mesas fixas, objetos pessoais e recados.
 *
 * Interação (E), sem tomar o "Sentar" das cadeiras (é do sistema):
 * - sentado na cadeira de uma mesa livre: "Fazer check-in nesta mesa";
 * - na sua mesa (sentado ou perto): "Minha mesa" (objetos, recados, liberar);
 * - na mesa de outra pessoa: "Recado para Ana".
 * O painel "Minha mesa" também abre pelo evento `infinity:mesas` (para a paleta de comandos).
 */

/** Distância do tampo para oferecer o recado / "Minha mesa" a quem está em pé. */
const NEAR_DESK = 1.25;

function targets(): DynamicTarget[] {
  const s = mesasState();
  const me = myKey();
  if (!s || !me || useApp.getState().conn !== "open") return [];
  const now = serverNow();
  const priv = useMesas.getState().priv;
  const mineLabel = () => {
    const n = priv ? unread(priv.inbox).length : 0;
    return n ? T.myDeskNotes(n) : T.myDesk;
  };
  // Sentado numa cadeira de mesa: a ação é sobre esta mesa (o ponto é o próprio assento).
  const seat = seatedAt();
  const seated = seat ? deskByChair(seat.objectId) : undefined;
  if (seated) {
    const owner = mesasOwner(s, seated.id, now);
    const base = { point: seated.seat, radius: 1.2 };
    if (!owner) return [{ ...base, key: `mesas:checkin:${seated.id}`, label: T.checkinHere, run: () => act.checkin(seated.id) }];
    if (mesasKey(owner.name) === me) return [{ ...base, key: `mesas:minha:${seated.id}`, label: mineLabel(), run: openPanel }];
    return [{ ...base, key: `mesas:recado:${seated.id}`, label: T.leaveNote(owner.name), run: () => openCard(seated.id) }];
  }
  // Em pé: só as mesas com dona, perto do tampo (concorre por distância com o "Sentar" da cadeira).
  const out: DynamicTarget[] = [];
  const ids = new Set([...Object.keys(s.checkins), ...Object.keys(s.fixed)]);
  for (const id of ids) {
    const d = deskById(id);
    if (!d || Math.abs(d.pos.x - self.x) > NEAR_DESK || Math.abs(d.pos.z - self.z) > NEAR_DESK) continue;
    const owner = mesasOwner(s, id, now);
    if (!owner) continue;
    const mine = mesasKey(owner.name) === me;
    out.push({
      key: `mesas:${mine ? "minha" : "recado"}:${id}`,
      point: d.pos,
      radius: NEAR_DESK,
      label: mine ? mineLabel() : T.leaveNote(owner.name),
      run: mine ? openPanel : () => openCard(id),
    });
  }
  return out;
}

function onEvent(e: { ev: string; data: unknown }): void {
  if (e.ev === "privado") {
    useMesas.setState({ priv: e.data as MesasPrivate });
    return;
  }
  if (e.ev === "ok") {
    const d = e.data as { op: string; desk?: string };
    const desk = deskById(d.desk);
    if (d.op === "checkin" && desk) {
      toast(T.checkedIn(mesasLabel(desk)), 4200);
      sfx("mesa-checkin", { volume: 0.45 });
      // Atalho da última mesa: anda até lá e senta.
      if (pending.go === desk.id) goSit(desk);
      pending.go = null;
    } else if (d.op === "checkout") toast(T.checkedOut);
    else if (d.op === "recado") {
      const s = mesasState();
      const owner = s && desk ? mesasOwner(s, desk.id, serverNow()) : null;
      toast(T.noteLeft(owner?.name ?? "a pessoa"));
      sfx("mesa-recado", { volume: 0.4 });
      window.dispatchEvent(new Event("mesas:recado-ok"));
    } else if (d.op === "fixar") toast(T.fixedSaved);
    return;
  }
  if (e.ev === "recusa") {
    const r = e.data as { code: string; name?: string; ms?: number };
    pending.go = null;
    toast(T.refuse(r.code, r.name, r.ms), 4200);
  }
}

/** Camada de UI: painéis, atalho da última mesa, cartão de recados ao chegar e ganchos. */
function Overlay() {
  // Chegou à própria mesa com recado novo: o cartão aparece (uma vez por recado).
  const shownFor = useRef("");
  useEffect(() => {
    const id = window.setInterval(() => {
      const ui = useMesas.getState();
      if (!ui.priv || ui.panel || ui.card || ui.welcome) return;
      const fresh = unread(ui.priv.inbox);
      if (!fresh.length) return;
      const s = mesasState();
      const me = myKey();
      const mine = s && me ? deskById(mesasDeskOf(s, me, serverNow())) : undefined;
      if (!mine) return;
      const sig = fresh.map((n) => n.id).join(",");
      if (sig === shownFor.current) return;
      if (selfNear(mine.seat, 1.6) || selfNear(mine.pos, 1.6)) {
        shownFor.current = sig;
        useMesas.setState({ welcome: true });
      }
    }, 600);
    return () => window.clearInterval(id);
  }, []);

  // Paleta de comandos / outros pacotes: window.dispatchEvent(new Event("infinity:mesas")).
  useEffect(() => {
    const open = () => openPanel();
    window.addEventListener("infinity:mesas", open);
    return () => window.removeEventListener("infinity:mesas", open);
  }, []);

  // Desenvolvimento: ?admin=1 libera as ações de admin nesta conexão (o servidor só aceita sem login).
  const priv = useMesas((u) => u.priv);
  useEffect(() => {
    if (!import.meta.env.DEV || !priv || priv.admin) return;
    if (new URLSearchParams(location.search).get("admin") === "1") act.devAdmin(true);
  }, [priv]);

  // Saiu do mundo: fecha tudo.
  const phase = useApp((s) => s.phase);
  useEffect(() => {
    if (phase !== "world") useMesas.setState({ panel: false, card: null, welcome: false, priv: null });
  }, [phase]);

  return (
    <>
      <MesasPanels />
      <ArrivalChip />
    </>
  );
}

export const mesasClient: ActivityClient = {
  name: "mesas/mesas",
  kinds: [MESAS_KIND],
  targets,
  onEvent,
  Overlay,
  Scene: MesasScene,
};


// ---- sons de reserva (enquanto os arquivos do sounds.json não existem) ----------------------

function tone(c: AudioContext, out: AudioNode, freq: number, delay: number, dur: number, gain: number, type: OscillatorType = "sine"): void {
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** Check-in: duas batidinhas de madeira e um sininho curto. */
registerSynth("mesa-checkin", (c, out) => {
  tone(c, out, 320, 0, 0.07, 0.25, "triangle");
  tone(c, out, 420, 0.08, 0.07, 0.22, "triangle");
  tone(c, out, 1320, 0.16, 0.35, 0.12);
});

/** Recado: papel dobrado (ruído curto filtrado). */
registerSynth("mesa-recado", (c, out) => {
  const t = c.currentTime;
  const len = Math.floor(c.sampleRate * 0.18);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.setValueAtTime(3200, t);
  f.Q.value = 0.8;
  const g = c.createGain();
  g.gain.value = 0.3;
  src.connect(f).connect(g).connect(out);
  src.start(t);
});
