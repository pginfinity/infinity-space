import { registerSynth } from "../../audio/sfx.ts";

/**
 * Sons do pacote arcade sintetizados (reserva até os arquivos de `sounds.json` serem gerados).
 * Os dos fliperamas são 8 bits de propósito: ondas quadradas e ruído, como uma máquina antiga.
 */

interface Tone {
  type?: OscillatorType;
  f0: number;
  f1?: number;
  at?: number;
  dur: number;
  gain?: number;
  attack?: number;
}

export function tone(c: AudioContext, out: AudioNode, o: Tone): void {
  const t = c.currentTime + (o.at ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.f0, t);
  if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
  const peak = o.gain ?? 0.3;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + (o.attack ?? 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + o.dur + 0.05);
}

let noiseBuf: AudioBuffer | null = null;
export function noise(c: AudioContext, out: AudioNode, o: { freq: number; q?: number; dur: number; gain?: number; at?: number; type?: BiquadFilterType }): void {
  if (!noiseBuf || noiseBuf.sampleRate !== c.sampleRate) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = c.currentTime + (o.at ?? 0);
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = o.type ?? "bandpass";
  f.frequency.value = o.freq;
  f.Q.value = o.q ?? 1.2;
  const g = c.createGain();
  g.gain.setValueAtTime(o.gain ?? 0.4, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(f).connect(g).connect(out);
  src.start(t);
  src.stop(t + o.dur + 0.05);
}

const notes = (c: AudioContext, out: AudioNode, freqs: number[], step: number, type: OscillatorType, gain: number, dur = step * 1.6) =>
  freqs.forEach((f, i) => tone(c, out, { type, f0: f, at: i * step, dur, gain }));

// ---- mesas de tempo real
registerSynth("arcade-hockey-hit", (c, out) => {
  noise(c, out, { freq: 2400, q: 2, dur: 0.06, gain: 0.55 });
  tone(c, out, { f0: 950, f1: 600, dur: 0.07, gain: 0.25 });
});
registerSynth("arcade-hockey-wall", (c, out) => {
  noise(c, out, { freq: 1300, q: 1.5, dur: 0.05, gain: 0.35 });
  tone(c, out, { f0: 420, f1: 300, dur: 0.05, gain: 0.15 });
});
registerSynth("arcade-hockey-goal", (c, out) => {
  noise(c, out, { freq: 300, q: 0.8, dur: 0.18, gain: 0.5 });
  tone(c, out, { type: "square", f0: 220, dur: 0.55, gain: 0.08, at: 0.08 });
  tone(c, out, { type: "square", f0: 277, dur: 0.55, gain: 0.07, at: 0.08 });
});
registerSynth("arcade-pong-hit", (c, out) => {
  tone(c, out, { f0: 1500, f1: 820, dur: 0.06, gain: 0.35 });
  noise(c, out, { freq: 3500, q: 3, dur: 0.025, gain: 0.25 });
});
registerSynth("arcade-pong-bounce", (c, out) => tone(c, out, { f0: 2300, f1: 1900, dur: 0.035, gain: 0.25 }));
registerSynth("arcade-duel-point", (c, out) => notes(c, out, [660, 990], 0.09, "triangle", 0.22));
registerSynth("arcade-duel-count", (c, out) => tone(c, out, { type: "square", f0: 880, dur: 0.11, gain: 0.07 }));
registerSynth("arcade-duel-go", (c, out) => tone(c, out, { type: "square", f0: 1320, dur: 0.28, gain: 0.08 }));
registerSynth("arcade-duel-win", (c, out) => notes(c, out, [523, 659, 784, 1047], 0.1, "triangle", 0.22, 0.32));
registerSynth("arcade-duel-lose", (c, out) => notes(c, out, [392, 311], 0.16, "triangle", 0.16, 0.3));

// ---- fliperamas (8 bits)
registerSynth("cab-shoot", (c, out) => tone(c, out, { type: "square", f0: 1400, f1: 500, dur: 0.07, gain: 0.08 }));
registerSynth("cab-pop", (c, out) => noise(c, out, { freq: 2600, q: 1, dur: 0.08, gain: 0.3 }));
registerSynth("cab-explode", (c, out) => {
  noise(c, out, { freq: 700, q: 0.6, dur: 0.28, gain: 0.45, type: "lowpass" });
  tone(c, out, { type: "square", f0: 180, f1: 60, dur: 0.22, gain: 0.07 });
});
registerSynth("cab-hit", (c, out) => tone(c, out, { type: "square", f0: 300, f1: 220, dur: 0.06, gain: 0.08 }));
registerSynth("cab-coin", (c, out) => notes(c, out, [988, 1319], 0.05, "square", 0.06, 0.07));
registerSynth("cab-power", (c, out) => notes(c, out, [523, 659, 784, 1047], 0.045, "square", 0.06, 0.06));
registerSynth("cab-shield", (c, out) => tone(c, out, { type: "triangle", f0: 900, f1: 300, dur: 0.25, gain: 0.2 }));
registerSynth("cab-death", (c, out) => {
  tone(c, out, { type: "square", f0: 440, f1: 70, dur: 0.6, gain: 0.08 });
  noise(c, out, { freq: 400, q: 0.5, dur: 0.4, gain: 0.25, type: "lowpass" });
});
registerSynth("cab-level", (c, out) => notes(c, out, [392, 523, 659, 784], 0.08, "square", 0.06, 0.1));
registerSynth("cab-eat", (c, out) => tone(c, out, { type: "square", f0: 660, f1: 990, dur: 0.06, gain: 0.07 }));
registerSynth("cab-bounce", (c, out) => tone(c, out, { type: "square", f0: 520, dur: 0.04, gain: 0.06 }));
registerSynth("cab-wall", (c, out) => tone(c, out, { type: "square", f0: 260, dur: 0.03, gain: 0.05 }));
registerSynth("cab-brick", (c, out) => tone(c, out, { type: "square", f0: 880, f1: 1100, dur: 0.05, gain: 0.06 }));
registerSynth("cab-metal", (c, out) => tone(c, out, { type: "triangle", f0: 1800, dur: 0.08, gain: 0.12 }));
registerSynth("cab-start", (c, out) => notes(c, out, [523, 784, 1047], 0.07, "square", 0.06, 0.09));
registerSynth("cab-over", (c, out) => notes(c, out, [392, 330, 262], 0.14, "square", 0.06, 0.18));
registerSynth("cab-record", (c, out) => notes(c, out, [523, 659, 784, 1047, 784, 1047], 0.08, "square", 0.07, 0.12));
