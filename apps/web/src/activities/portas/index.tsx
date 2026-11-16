import { PORTAS, PORTAS_ID, PORTAS_KIND, circleCanAsk, type DoorState, type PortasState } from "@infinity/world";
import { registerActivity, sendAct, useActs, type DynamicTarget } from "../registry.ts";
import { registerSynth, sfx } from "../../audio/sfx.ts";
import { setSight } from "../../media/rtc.ts";
import { self } from "../../world/registry.ts";
import { toast } from "../../ui/toasts.ts";
import { useApp } from "../../state/store.ts";
import { PortasOverlay } from "./Overlay.tsx";
import { PortasScene } from "./Scene.tsx";
import { doorOf, doors, enterWhenAdmitted, installPortas, myCircle, myId, nameOf, portas, startWhisper, stopWhisper, usePortasUi, zoneAt } from "./state.ts";
import { T } from "./strings.ts";

/**
 * Pacote "portas": portas das salas (aberta, fechada, não perturbe; bater e bilhete), roda fechada
 * nas áreas abertas e sussurro (segure B perto de alguém). A privacidade vale de verdade no servidor;
 * aqui ficam a interface, o visual nas duas lentes e o volume local com a mesma regra.
 */

installPortas();

/** O que o E faz na porta, por dentro: fecha, tranca, abre (nessa ordem). */
const NEXT: Record<DoorState, { state: DoorState; label: string }> = {
  open: { state: "closed", label: T.door.close },
  closed: { state: "locked", label: T.door.lock },
  locked: { state: "open", label: T.door.open },
};

function targets(): DynamicTarget[] {
  const out: DynamicTarget[] = [];
  const id = myId();
  const st = portas();
  if (!id || !st) return out;
  const zone = zoneAt(self);
  for (const d of doors()) {
    const s = st.doors[d.zoneId];
    if (!s) continue;
    if (zone?.id === d.zoneId) {
      const next = NEXT[s.state];
      out.push({ key: `porta-${d.zoneId}-dentro`, point: d.pos, radius: PORTAS.useRange, label: next.label, run: () => sendAct(PORTAS_ID, "porta", { zone: d.zoneId, state: next.state }) });
    } else if (s.state !== "open" && !s.admitted.includes(id)) {
      out.push({
        key: `porta-${d.zoneId}-fora-${s.state}`,
        point: d.pos,
        radius: PORTAS.knockRange,
        label: s.state === "locked" ? T.door.dnd : T.door.knock,
        run: () => sendAct(PORTAS_ID, "bater", { zone: d.zoneId }),
      });
    }
  }
  if (!myCircle(st)) {
    for (const c of st.circles) {
      if (!circleCanAsk(c, self, zone)) continue;
      const asked = c.asks.some((a) => a.id === id);
      out.push({
        key: `roda-${c.id}-${asked ? "pedido" : "pedir"}`,
        point: c.center,
        radius: c.radius + PORTAS.askRange,
        label: asked ? T.circle.asked : T.circle.ask,
        run: () => (asked ? toast(T.circle.askedToast) : sendAct(PORTAS_ID, "roda-pedir", { circle: c.id })),
      });
    }
  }
  return out;
}

const text = (d: unknown, k: string): string => {
  const v = d && typeof d === "object" ? (d as Record<string, unknown>)[k] : undefined;
  return typeof v === "string" ? v : "";
};

registerActivity({
  name: "portas",
  kinds: [PORTAS_KIND],
  targets,
  onEvent: (e) => {
    const d = e.data;
    const zone = text(d, "zone");
    const door = doorOf(zone);
    switch (e.ev) {
      // Durante o sussurro: quem continua vendo seu vídeo e sua tela.
      case "vista": {
        const ids = d && typeof d === "object" ? (d as { ids?: unknown }).ids : null;
        setSight(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : null);
        break;
      }
      case "bateu":
        sfx("porta-batida", { volume: 0.75 });
        break;
      case "batida":
        sfx("porta-batida", { volume: 0.6, ...(door ? { at: door.pos } : {}) });
        toast(T.door.knocked);
        break;
      case "nao-perturbe":
        toast(T.door.dndToast(text(d, "note")), 4500);
        break;
      case "aberta":
        toast(T.door.isOpen);
        break;
      case "entrar":
        toast(T.door.letIn(text(d, "by")));
        if (zone) enterWhenAdmitted(zone);
        break;
      case "agora-nao":
        toast(T.door.notNow(text(d, "by")), 4000);
        break;
      case "sem-resposta":
        toast(T.door.noAnswer);
        break;
      case "roda-fechada":
        sfx("roda-fecha", { volume: 0.5 });
        toast(T.circle.closedToast(text(d, "by")), 4500);
        break;
      case "roda-aberta":
        toast(T.circle.openedToast(text(d, "by") || undefined));
        break;
      case "roda-saiu":
        toast(T.circle.leftToast);
        break;
      case "roda-sozinho":
        toast(T.circle.alone);
        break;
      case "roda-pedido":
        sfx("porta-batida", { volume: 0.4 });
        break;
      case "roda-entrou":
        sfx("roda-fecha", { volume: 0.5 });
        toast(T.circle.joined(text(d, "by")));
        break;
      case "roda-recusou":
        toast(T.circle.refused(text(d, "by")), 4000);
        break;
      case "sussurro": {
        const from = text(d, "from");
        const on = d && typeof d === "object" && (d as { on?: unknown }).on === true;
        if (!from) break;
        usePortasUi.setState((s) => {
          const incoming = { ...s.incoming };
          if (on) incoming[from] = nameOf(from);
          else delete incoming[from];
          return { incoming };
        });
        break;
      }
    }
  },
  Overlay: PortasOverlay,
  Scene: PortasScene,
});

// ---- sussurro pela tecla B ----------------------------------------------------------------------

function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
}

window.addEventListener("keydown", (e) => {
  if (e.code !== "KeyB" || e.repeat || e.ctrlKey || e.metaKey || e.altKey || typing(e)) return;
  if (!myId()) return;
  startWhisper();
});
window.addEventListener("keyup", (e) => {
  if (e.code === "KeyB") stopWhisper();
});
// Soltou a tecla fora da janela: o sussurro acaba (a voz nunca fica presa para uma pessoa só sem você ver).
window.addEventListener("blur", stopWhisper);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopWhisper();
});

// Quem sussurrava para você (ou para quem você sussurrava) foi embora: some o aviso.
useApp.subscribe((s) => {
  const ui = usePortasUi.getState();
  const gone = Object.keys(ui.incoming).filter((id) => !s.players[id]);
  if (gone.length) {
    const incoming = { ...ui.incoming };
    for (const id of gone) delete incoming[id];
    usePortasUi.setState({ incoming });
  }
  // Nova conexão (id novo): sussurros antigos não valem mais.
  if (!s.selfId && (ui.whisper || Object.keys(ui.incoming).length)) {
    stopWhisper();
    usePortasUi.setState({ incoming: {} });
  }
});

// ---- sons: porta fechando e abrindo, para quem está perto ------------------------------------------

let lastDoors: PortasState["doors"] | null = null;
useActs.subscribe((s) => {
  const st = s.acts[PORTAS_ID]?.state as PortasState | undefined;
  const now = st?.doors ?? null;
  if (now && lastDoors && now !== lastDoors) {
    for (const [zone, door] of Object.entries(now)) {
      const before = lastDoors[zone]?.state;
      if (!before || before === door.state) continue;
      const def = doorOf(zone);
      if (!def) continue;
      if (before === "open") sfx("porta-fecha", { at: def.pos, range: 10, volume: 0.55 });
      else if (door.state === "open") sfx("porta-abre", { at: def.pos, range: 10, volume: 0.5 });
    }
  }
  lastDoors = now;
});

// ---- sons sintetizados de reserva (até existirem os arquivos gerados) ------------------------------

/** Três batidas de nó de dedo na madeira. */
registerSynth("porta-batida", (c, out) => {
  const t0 = c.currentTime;
  for (const [i, dt] of [0, 0.17, 0.34].entries()) {
    const t = t0 + dt;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(180 - i * 6, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.09);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.14);
    // Estalo curto do impacto.
    const n = c.createBufferSource();
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * 0.03), c.sampleRate);
    const ch = buf.getChannelData(0);
    for (let k = 0; k < ch.length; k++) ch[k] = (Math.random() * 2 - 1) * (1 - k / ch.length) ** 3;
    n.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1400;
    const ng = c.createGain();
    ng.gain.value = 0.35;
    n.connect(bp).connect(ng).connect(out);
    n.start(t);
  }
});

function thud(c: AudioContext, out: AudioNode, f0: number, f1: number, click: number): void {
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "triangle";
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + 0.18);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.7, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.3);
  // Clique da fechadura.
  const k = c.createOscillator();
  const kg = c.createGain();
  k.type = "square";
  k.frequency.value = click;
  kg.gain.setValueAtTime(0.0001, t + 0.12);
  kg.gain.exponentialRampToValueAtTime(0.12, t + 0.125);
  kg.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  k.connect(kg).connect(out);
  k.start(t + 0.12);
  k.stop(t + 0.18);
}

registerSynth("porta-fecha", (c, out) => thud(c, out, 140, 60, 2400));
registerSynth("porta-abre", (c, out) => thud(c, out, 90, 150, 1800));

/** Fechar a roda: dois toques suaves, como um "shh" musical. */
registerSynth("roda-fecha", (c, out) => {
  const t = c.currentTime;
  for (const [i, f] of [660, 880].entries()) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.value = f;
    const s = t + i * 0.12;
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(0.25, s + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, s + 0.45);
    o.connect(g).connect(out);
    o.start(s);
    o.stop(s + 0.5);
  }
});

// Gancho de inspeção para os testes de ponta a ponta (só em desenvolvimento).
if (import.meta.env.DEV) {
  Object.assign(window, { __portas: { state: portas, ui: usePortasUi, startWhisper, stopWhisper } });
}
