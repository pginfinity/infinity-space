import { JUKEBOX_HEAR_RANGE, spatial, type Vec2 } from "@infinity/world";
import { world } from "../../world/world.ts";
import { self } from "../../world/registry.ts";
import TRACKS from "./tracks.json";

/**
 * Som da jukebox. Toca a faixa que está "tocando agora" a partir da hora de início, então todo mundo
 * perto ouve o mesmo trecho. O volume cai com a distância e o som fica abafado atrás de parede
 * (mesma regra dos efeitos com `at`); cada pessoa tem o próprio volume.
 *
 * Se o arquivo /music/<id>.mp3 existir, toca o arquivo. Senão, toca uma versão generativa da faixa
 * (lo-fi discreto, em WebAudio): as notas saem de um sorteio fixo por faixa e por compasso, então
 * todo mundo ouve exatamente a mesma música no mesmo instante.
 */

export interface TrackMeta {
  id: string;
  title: string;
  mood: string;
  seconds: number;
  bpm: number;
  key: string;
  style: string;
  file: string;
}

export const TRACK_LIST = TRACKS as TrackMeta[];
export const trackById = new Map(TRACK_LIST.map((t) => [t.id, t]));

// ---- volume local -------------------------------------------------------------------------

const VOL_KEY = "infinity-space:jukebox-volume";
let userVolume = (() => {
  try {
    const v = Number(localStorage.getItem(VOL_KEY));
    return Number.isFinite(v) && localStorage.getItem(VOL_KEY) !== null ? Math.min(1, Math.max(0, v)) : 0.7;
  } catch {
    return 0.7;
  }
})();
const volListeners = new Set<() => void>();

export function getVolume(): number {
  return userVolume;
}

export function setVolume(v: number): void {
  userVolume = Math.min(1, Math.max(0, v));
  try {
    localStorage.setItem(VOL_KEY, String(userVolume));
  } catch {
    /* sem armazenamento: vale só nesta sessão */
  }
  volListeners.forEach((f) => f());
}

export function onVolume(f: () => void): () => void {
  volListeners.add(f);
  return () => volListeners.delete(f);
}

// ---- utilidades musicais ------------------------------------------------------------------

const NOTE: Record<string, number> = { C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11 };
const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Acorde: grau (semitons a partir da tônica) e intervalos. */
type Chord = [root: number, intervals: number[]];
const MAJ7 = [0, 4, 7, 11];
const MIN7 = [0, 3, 7, 10];
const DOM7 = [0, 4, 7, 10];
const MAJ9 = [0, 4, 7, 11, 14];
const MIN9 = [0, 3, 7, 10, 14];

interface Style {
  prog: Chord[];
  /** Compassos por acorde. */
  bars: number;
  swing: number;
  drums: number;
  /** Escala da melodia (semitons). */
  scale: number[];
  melody: number;
  keys: "rhodes" | "pad" | "pluck" | "guitar";
  crackle: number;
  bright: number;
}

const STYLES: Record<string, Style> = {
  lofi: { prog: [[2, MIN7], [7, DOM7], [0, MAJ7], [9, MIN7]], bars: 1, swing: 0.14, drums: 1, scale: [0, 2, 4, 7, 9], melody: 0.22, keys: "rhodes", crackle: 1, bright: 2600 },
  jazz: { prog: [[0, MAJ9], [9, MIN7], [2, MIN9], [7, DOM7]], bars: 1, swing: 0.2, drums: 0.8, scale: [0, 2, 4, 7, 9, 11], melody: 0.26, keys: "rhodes", crackle: 0.5, bright: 3200 },
  bossa: { prog: [[0, MAJ7], [2, MIN7], [4, MIN7], [9, DOM7]], bars: 1, swing: 0.04, drums: 0.6, scale: [0, 2, 4, 7, 9], melody: 0.2, keys: "guitar", crackle: 0.3, bright: 3600 },
  groove: { prog: [[0, MAJ7], [5, MAJ7], [9, MIN7], [7, DOM7]], bars: 1, swing: 0.08, drums: 1.1, scale: [0, 2, 4, 7, 9], melody: 0.28, keys: "pluck", crackle: 0.3, bright: 4200 },
  ambient: { prog: [[0, MAJ9], [5, MAJ7], [9, MIN9], [7, MAJ7]], bars: 2, swing: 0, drums: 0.15, scale: [0, 4, 7, 11, 14], melody: 0.14, keys: "pad", crackle: 0, bright: 2400 },
  dream: { prog: [[0, MAJ9], [9, MIN9], [5, MAJ7], [7, DOM7]], bars: 1, swing: 0.05, drums: 0.6, scale: [0, 2, 4, 7, 9, 11], melody: 0.3, keys: "pad", crackle: 0.2, bright: 3800 },
  neon: { prog: [[0, MIN7], [8, MAJ7], [3, MAJ7], [10, DOM7]], bars: 1, swing: 0, drums: 0.9, scale: [0, 3, 5, 7, 10], melody: 0.26, keys: "pluck", crackle: 0, bright: 3400 },
};

// ---- motor --------------------------------------------------------------------------------

/** O que tocar: faixa e hora de início (relógio do servidor), e de onde vem o som. */
export interface Playback {
  track: string;
  startAt: number;
}

class Engine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private lp: BiquadFilterNode | null = null;
  private music: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private wet: GainNode | null = null;
  private crackleGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer: number | undefined;
  private playback: Playback | null = null;
  private clock: () => number = Date.now;
  private at: Vec2 = { x: 0, z: 0 };
  /** Até onde (em passos de 1/16) já foi agendado. */
  private scheduled = -1;
  private fileOk = new Map<string, boolean>();
  private audio: HTMLAudioElement | null = null;
  private audioSrc: MediaElementAudioSourceNode | null = null;
  private audible = 0;
  private started = false;

  /** Começa a ouvir (chamado pela interface do pacote). */
  start(clock: () => number, at: Vec2): void {
    this.clock = clock;
    this.at = at;
    if (this.started) return;
    this.started = true;
    this.timer = window.setInterval(() => this.tick(), 60);
    const wake = () => void this.ctx?.resume();
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);
  }

  stop(): void {
    window.clearInterval(this.timer);
    this.started = false;
    this.audio?.pause();
    void this.ctx?.close();
    this.ctx = null;
    this.audio = null;
    this.audioSrc = null;
    this.scheduled = -1;
  }

  set(p: Playback | null): void {
    if (p?.track === this.playback?.track && p?.startAt === this.playback?.startAt) return;
    this.playback = p;
    this.scheduled = -1;
    if (this.audio) {
      this.audio.pause();
      this.audio = null;
    }
    if (p) void this.probe(p.track);
  }

  /** Quanto se ouve agora (0 a 1), para a interface. */
  get level(): number {
    return this.audible;
  }

  private ensure(): AudioContext {
    if (this.ctx) return this.ctx;
    const c = new AudioContext();
    this.ctx = c;
    this.master = c.createGain();
    this.master.gain.value = 0;
    this.lp = c.createBiquadFilter();
    this.lp.type = "lowpass";
    this.lp.frequency.value = 18000;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.ratio.value = 3;
    this.music = c.createGain();
    this.music.gain.value = 0.9;
    this.reverb = c.createConvolver();
    this.reverb.buffer = impulse(c, 2.2);
    this.wet = c.createGain();
    this.wet.gain.value = 0.22;
    this.music.connect(comp);
    this.music.connect(this.reverb).connect(this.wet).connect(comp);
    comp.connect(this.lp).connect(this.master).connect(c.destination);
    this.noise = noiseBuffer(c, false);
    // chiado de vinil, contínuo e bem baixinho (o volume segue o estilo da faixa)
    const crackle = c.createBufferSource();
    crackle.buffer = noiseBuffer(c, true);
    crackle.loop = true;
    const hp = c.createBiquadFilter();
    hp.type = "bandpass";
    hp.frequency.value = 3500;
    hp.Q.value = 0.6;
    this.crackleGain = c.createGain();
    this.crackleGain.gain.value = 0;
    crackle.connect(hp).connect(this.crackleGain).connect(this.music);
    crackle.start();
    return c;
  }

  /** Confere se o arquivo da faixa já existe (o Vite devolve HTML quando não existe). */
  private async probe(id: string): Promise<void> {
    if (this.fileOk.has(id)) return;
    const meta = trackById.get(id);
    if (!meta) return;
    try {
      const r = await fetch(meta.file, { method: "HEAD" });
      this.fileOk.set(id, r.ok && (r.headers.get("content-type") ?? "").includes("audio"));
    } catch {
      this.fileOk.set(id, false);
    }
  }

  private tick(): void {
    const p = this.playback;
    // volume pelo lugar de quem ouve
    const me = { x: self.x, z: self.z };
    const d = Math.hypot(this.at.x - me.x, this.at.z - me.z);
    let gain = 0;
    let muffled = false;
    if (p && d < JUKEBOX_HEAR_RANGE) {
      const h = spatial(world().map.walls, me, this.at);
      muffled = h.muffled;
      gain = Math.pow(Math.max(0, 1 - d / JUKEBOX_HEAR_RANGE), 1.3) * (muffled ? 0.45 : 1);
    }
    this.audible = gain;
    if (!p || gain <= 0.001) {
      if (this.ctx && this.master) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25);
      this.audio?.pause();
      this.scheduled = -1;
      return;
    }
    const c = this.ensure();
    if (c.state === "suspended") void c.resume();
    const meta = trackById.get(p.track);
    if (!meta) return;
    const pos = (this.clock() - p.startAt) / 1000;
    // entra e sai suave no começo e no fim da faixa
    const edge = Math.min(1, Math.max(0, pos / 2), Math.max(0, (meta.seconds - pos) / 2.5));
    this.master!.gain.setTargetAtTime(gain * userVolume * edge * 0.55, c.currentTime, 0.2);
    this.lp!.frequency.setTargetAtTime(muffled ? 750 : 16000, c.currentTime, 0.2);
    if (pos < 0 || pos > meta.seconds) return;
    if (this.fileOk.get(p.track)) this.playFile(meta, pos);
    else this.schedule(meta, pos);
  }

  private playFile(meta: TrackMeta, pos: number): void {
    const c = this.ctx!;
    if (!this.audio) {
      this.audio = new Audio(meta.file);
      this.audio.crossOrigin = "anonymous";
      this.audio.preload = "auto";
      this.audioSrc?.disconnect();
      this.audioSrc = c.createMediaElementSource(this.audio);
      this.audioSrc.connect(this.music!);
      this.audio.currentTime = pos;
      void this.audio.play().catch(() => undefined);
      return;
    }
    if (this.audio.paused) void this.audio.play().catch(() => undefined);
    // corrige a deriva para continuar no mesmo trecho que os outros
    if (Math.abs(this.audio.currentTime - pos) > 0.35) this.audio.currentTime = pos;
  }

  /** Agenda as notas dos próximos ~300 ms da versão generativa. */
  private schedule(meta: TrackMeta, pos: number): void {
    const c = this.ctx!;
    const style = STYLES[meta.style] ?? STYLES.lofi!;
    const step = 60 / meta.bpm / 4;
    const now = Math.floor(pos / step);
    if (this.scheduled < now - 1) this.scheduled = now - 1;
    const until = Math.floor((pos + 0.3) / step);
    const crackle = this.crackleGain!;
    crackle.gain.setTargetAtTime(0.012 * style.crackle, c.currentTime, 0.5);
    for (let n = this.scheduled + 1; n <= until; n++) {
      // swing nos contratempos de 1/16
      const swing = n % 2 === 1 ? style.swing * step : 0;
      const when = c.currentTime + (n * step + swing - pos);
      if (when < c.currentTime - 0.01) continue;
      this.playStep(meta, style, n, Math.max(c.currentTime, when), step);
    }
    this.scheduled = until;
  }

  private playStep(meta: TrackMeta, st: Style, n: number, t: number, step: number): void {
    const c = this.ctx!;
    const out = this.music!;
    const bar = Math.floor(n / 16);
    const s16 = n % 16;
    const key = 48 + (NOTE[meta.key] ?? 0);
    const chord = st.prog[Math.floor(bar / st.bars) % st.prog.length]!;
    const r = rng(hashStr(meta.id) ^ (bar * 7919) ^ (s16 * 104729));
    const rootMidi = key + chord[0];

    // acordes
    if (st.keys === "pad") {
      if (s16 === 0 && bar % st.bars === 0) for (const iv of chord[1]) pad(c, out, t, midiHz(rootMidi + 12 + iv), step * 16 * st.bars, 0.05);
    } else if (st.keys === "rhodes") {
      if (s16 === 0 || (s16 === 6 && r() < 0.8) || (s16 === 11 && r() < 0.3)) {
        const v = 0.05 + r() * 0.025;
        chord[1].forEach((iv, i) => rhodes(c, out, t + i * 0.012, midiHz(rootMidi + 12 + iv), s16 === 0 ? step * 7 : step * 4, v));
      }
    } else if (st.keys === "guitar") {
      // batida de bossa: acordes curtos sincopados
      if ([0, 3, 6, 10, 12].includes(s16)) chord[1].forEach((iv, i) => pluck(c, out, t + i * 0.018, midiHz(rootMidi + 12 + iv), step * 2.2, 0.035));
    } else if ([0, 3, 6, 8, 11, 14].includes(s16) && (s16 === 0 || r() < 0.75)) {
      chord[1].forEach((iv) => pluck(c, out, t, midiHz(rootMidi + 12 + iv), step * 1.8, 0.03));
    }

    // baixo
    if (s16 === 0 || (s16 === 8 && st.keys !== "pad") || (s16 === 14 && r() < 0.35)) {
      const note = s16 === 14 ? rootMidi - 12 + 7 : rootMidi - 12;
      bass(c, out, t, midiHz(note), step * (s16 === 0 ? 6 : 3), 0.16);
    }

    // bateria
    const dv = st.drums;
    if (dv > 0.2) {
      if (s16 === 0 || s16 === 10 || (s16 === 7 && r() < 0.25)) kick(c, out, t, 0.32 * dv);
      if (s16 === 4 || s16 === 12) snare(c, out, this.noise!, t, 0.12 * dv);
      if (s16 % 2 === 0) hat(c, out, this.noise!, t, (s16 % 4 === 0 ? 0.035 : 0.022) * dv * (0.7 + r() * 0.5));
    } else if (dv > 0 && s16 === 0 && bar % 2 === 0) kick(c, out, t, 0.12);

    // melodia: notas soltas da escala, poucas e com eco
    if (s16 % 2 === 0 && r() < st.melody * (s16 % 4 === 0 ? 1 : 0.6)) {
      const deg = st.scale[Math.floor(r() * st.scale.length)]!;
      const oct = r() < 0.3 ? 24 : 12;
      bell(c, out, t, midiHz(key + oct + deg), step * (2 + Math.floor(r() * 3)), 0.03);
    }
  }
}

// ---- instrumentos (curtos e suaves) --------------------------------------------------------

function env(c: AudioContext, t: number, attack: number, dur: number, peak: number): GainNode {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  return g;
}

function rhodes(c: AudioContext, out: AudioNode, t: number, f: number, dur: number, v: number): void {
  const g = env(c, t, 0.01, dur + 0.6, v);
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(2400, t);
  lp.frequency.exponentialRampToValueAtTime(900, t + dur);
  for (const [type, mul, det, amp] of [
    ["sine", 1, 0, 1],
    ["triangle", 1, 6, 0.35],
    ["sine", 2, -4, 0.18],
  ] as const) {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = f * mul;
    o.detune.value = det;
    const a = c.createGain();
    a.gain.value = amp;
    o.connect(a).connect(lp);
    o.start(t);
    o.stop(t + dur + 0.7);
  }
  lp.connect(g).connect(out);
}

function pad(c: AudioContext, out: AudioNode, t: number, f: number, dur: number, v: number): void {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + Math.min(1.5, dur * 0.3));
  g.gain.setValueAtTime(v, t + dur * 0.75);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.2);
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 1400;
  for (const det of [-7, 7]) {
    const o = c.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = f;
    o.detune.value = det;
    o.connect(lp);
    o.start(t);
    o.stop(t + dur + 1.3);
  }
  lp.connect(g).connect(out);
}

function pluck(c: AudioContext, out: AudioNode, t: number, f: number, dur: number, v: number): void {
  const g = env(c, t, 0.004, dur + 0.25, v);
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(3200, t);
  lp.frequency.exponentialRampToValueAtTime(600, t + dur);
  const o = c.createOscillator();
  o.type = "triangle";
  o.frequency.value = f;
  o.connect(lp).connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.3);
}

function bass(c: AudioContext, out: AudioNode, t: number, f: number, dur: number, v: number): void {
  const g = env(c, t, 0.015, dur, v);
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 420;
  const o = c.createOscillator();
  o.type = "triangle";
  o.frequency.value = f;
  o.connect(lp).connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function bell(c: AudioContext, out: AudioNode, t: number, f: number, dur: number, v: number): void {
  const g = env(c, t, 0.006, dur + 0.8, v);
  const o = c.createOscillator();
  o.type = "sine";
  o.frequency.value = f;
  const o2 = c.createOscillator();
  o2.type = "sine";
  o2.frequency.value = f * 3.01;
  const g2 = c.createGain();
  g2.gain.value = 0.18;
  o.connect(g);
  o2.connect(g2).connect(g);
  g.connect(out);
  o.start(t);
  o2.start(t);
  o.stop(t + dur + 0.9);
  o2.stop(t + dur + 0.9);
}

function kick(c: AudioContext, out: AudioNode, t: number, v: number): void {
  const o = c.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(110, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
  const g = env(c, t, 0.004, 0.28, v);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.3);
}

function snare(c: AudioContext, out: AudioNode, noise: AudioBuffer, t: number, v: number): void {
  const src = c.createBufferSource();
  src.buffer = noise;
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1800;
  bp.Q.value = 0.8;
  const g = env(c, t, 0.003, 0.18, v);
  src.connect(bp).connect(g).connect(out);
  src.start(t, Math.random() * 1.5);
  src.stop(t + 0.2);
  const o = c.createOscillator();
  o.type = "triangle";
  o.frequency.setValueAtTime(190, t);
  o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
  const og = env(c, t, 0.002, 0.1, v * 0.5);
  o.connect(og).connect(out);
  o.start(t);
  o.stop(t + 0.12);
}

function hat(c: AudioContext, out: AudioNode, noise: AudioBuffer, t: number, v: number): void {
  const src = c.createBufferSource();
  src.buffer = noise;
  const hp = c.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 7000;
  const g = env(c, t, 0.002, 0.05, v);
  src.connect(hp).connect(g).connect(out);
  src.start(t, Math.random() * 1.5);
  src.stop(t + 0.06);
}

/** Ruído branco; com `vinyl`, ganha estalinhos raros (o chiado do disco). */
function noiseBuffer(c: AudioContext, vinyl: boolean): AudioBuffer {
  const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (vinyl ? 0.6 : 1) + (vinyl && Math.random() < 0.0006 ? (Math.random() * 2 - 1) * 6 : 0);
  return b;
}

/** Reverberação simples: ruído que decai (sala pequena e macia). */
function impulse(c: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(c.sampleRate * seconds);
  const b = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  return b;
}

export const music = new Engine();
