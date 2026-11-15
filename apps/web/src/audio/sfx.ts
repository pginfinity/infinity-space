import { spatial, type Vec2 } from "@infinity/world";
import { world } from "../world/world.ts";
import { self } from "../world/registry.ts";
import { useMediaSettings } from "../media/settings.ts";

/**
 * Efeitos sonoros. `sfx("gong")` toca `/sfx/gong.mp3` (gerado pelos scripts locais de áudio a partir
 * dos `sounds.json` de cada pacote). Enquanto o arquivo não existe, toca um som sintetizado de reserva.
 *
 * Com `at`, o som vem do lugar: some com a distância e fica abafado atrás de paredes,
 * com a mesma regra da voz.
 */

let ctx: AudioContext | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();
const synths = new Map<string, (c: AudioContext, out: AudioNode) => void>();

type SinkContext = AudioContext & { setSinkId?: (id: string) => Promise<void> };

function context(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    applySink(useMediaSettings.getState().speakerId);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Os efeitos saem pelo mesmo alto-falante escolhido para as vozes. */
function applySink(id: string | null): void {
  const c = ctx as SinkContext | null;
  if (c?.setSinkId) void c.setSinkId(id ?? "").catch(() => undefined);
}
useMediaSettings.subscribe((s, prev) => {
  if (s.speakerId !== prev.speakerId) applySink(s.speakerId);
});

function load(name: string): Promise<AudioBuffer | null> {
  let p = buffers.get(name);
  if (!p) {
    p = fetch(`/sfx/${name}.mp3`)
      .then((r) => (r.ok && (r.headers.get("content-type") ?? "").includes("audio") ? r.arrayBuffer() : null))
      .then((b) => (b ? context().decodeAudioData(b) : null))
      .catch(() => null);
    buffers.set(name, p);
  }
  return p;
}

export interface SfxOptions {
  /** 0..1 (padrão 0.7). */
  volume?: number;
  /** De onde o som sai (metros). Sem isso, toca "na cabeça" de quem ouve. */
  at?: Vec2;
  /** Alcance em metros quando há `at` (padrão 14). */
  range?: number;
}

export function sfx(name: string, opts: SfxOptions = {}): void {
  let gain = opts.volume ?? 0.7;
  let muffled = false;
  if (opts.at) {
    const range = opts.range ?? 14;
    const me = { x: self.x, z: self.z };
    const d = Math.hypot(opts.at.x - me.x, opts.at.z - me.z);
    if (d > range) return;
    const h = spatial(world().map.walls, me, opts.at);
    muffled = h.muffled;
    gain *= Math.max(0, 1 - d / range) * (muffled ? 0.5 : 1);
    if (gain < 0.01) return;
  }
  const c = context();
  const out = c.createGain();
  out.gain.value = gain;
  let node: AudioNode = out;
  if (muffled) {
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    out.connect(lp);
    node = lp;
  }
  node.connect(c.destination);
  void load(name).then((buf) => {
    if (buf) {
      const src = c.createBufferSource();
      src.buffer = buf;
      src.connect(out);
      src.start();
    } else {
      (synths.get(name) ?? blip)(c, out);
    }
  });
}

/** Registra um som sintetizado de reserva (usado enquanto não há arquivo gerado). */
export function registerSynth(name: string, fn: (c: AudioContext, out: AudioNode) => void): void {
  synths.set(name, fn);
}

/** Reserva genérica: um "plim" curto. */
function blip(c: AudioContext, out: AudioNode): void {
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(880, t);
  o.frequency.exponentialRampToValueAtTime(1320, t + 0.08);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.4, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.3);
}
