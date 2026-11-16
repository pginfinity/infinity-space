import { registerSynth } from "../../audio/sfx.ts";

/**
 * Sons de reserva do pacote, sintetizados em WebAudio até os arquivos gerados existirem
 * (prompts em sounds.json). Curtos, suaves e com o volume baixo: o escritório é para trabalhar.
 */

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();
function noise(c: BaseAudioContext): AudioBuffer {
  let b = noiseBuffers.get(c);
  if (!b) {
    b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseBuffers.set(c, b);
  }
  return b;
}

/** Ruído filtrado com envelope (chiado, vapor, água). */
function hiss(c: AudioContext, out: AudioNode, at: number, dur: number, opts: { type?: BiquadFilterType; freq: number; q?: number; gain: number; attack?: number; freqTo?: number }): void {
  const src = c.createBufferSource();
  src.buffer = noise(c);
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = opts.type ?? "bandpass";
  f.frequency.setValueAtTime(opts.freq, at);
  if (opts.freqTo) f.frequency.exponentialRampToValueAtTime(opts.freqTo, at + dur);
  f.Q.value = opts.q ?? 1;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(opts.gain, at + (opts.attack ?? 0.05));
  g.gain.setValueAtTime(opts.gain, at + Math.max(0.06, dur - 0.25));
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f).connect(g).connect(out);
  src.start(at, Math.random());
  src.stop(at + dur + 0.05);
}

/** Nota curta com envelope (sinos, bipes). */
function tone(c: AudioContext, out: AudioNode, at: number, freq: number, dur: number, gain: number, type: OscillatorType = "sine", glide?: number): void {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (glide) o.frequency.exponentialRampToValueAtTime(glide, at + dur * 0.8);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + dur + 0.05);
}

/** Bolha d'água: senoide que sobe rápido. */
function bubble(c: AudioContext, out: AudioNode, at: number, f0: number, gain: number): void {
  tone(c, out, at, f0, 0.09, gain, "sine", f0 * 2.2);
}

registerSynth("vivo-espresso", (c, out) => {
  const t = c.currentTime;
  // moedor, bomba e o café caindo
  hiss(c, out, t, 0.7, { freq: 900, q: 3, gain: 0.12, freqTo: 1300 });
  const hum = c.createOscillator();
  hum.type = "sawtooth";
  hum.frequency.value = 62;
  const hg = c.createGain();
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 260;
  hg.gain.setValueAtTime(0.0001, t + 0.6);
  hg.gain.exponentialRampToValueAtTime(0.06, t + 0.8);
  hg.gain.setValueAtTime(0.06, t + 2.7);
  hg.gain.exponentialRampToValueAtTime(0.0001, t + 3.1);
  hum.connect(lp).connect(hg).connect(out);
  hum.start(t + 0.6);
  hum.stop(t + 3.2);
  hiss(c, out, t + 0.9, 2.2, { freq: 2400, q: 0.7, gain: 0.05, attack: 0.3 });
  for (let i = 0; i < 9; i++) bubble(c, out, t + 1.1 + i * 0.2 + Math.random() * 0.08, 300 + Math.random() * 200, 0.05);
});

registerSynth("vivo-kettle", (c, out) => {
  const t = c.currentTime;
  hiss(c, out, t, 1.6, { type: "lowpass", freq: 700, gain: 0.07, attack: 0.4 });
  for (let i = 0; i < 14; i++) bubble(c, out, t + 0.2 + Math.random() * 1.3, 180 + Math.random() * 260, 0.04);
  hiss(c, out, t + 1.7, 1.3, { freq: 1500, q: 0.8, gain: 0.07, freqTo: 900 });
});

registerSynth("vivo-water", (c, out) => {
  const t = c.currentTime;
  hiss(c, out, t, 1.2, { freq: 1700, q: 0.9, gain: 0.06, freqTo: 1100 });
  bubble(c, out, t + 0.35, 210, 0.12);
  bubble(c, out, t + 0.95, 170, 0.13);
});

registerSynth("vivo-fridge", (c, out) => {
  const t = c.currentTime;
  hiss(c, out, t, 0.12, { type: "lowpass", freq: 300, gain: 0.18, attack: 0.005 });
  tone(c, out, t + 0.35, 1850, 0.25, 0.05, "triangle");
  tone(c, out, t + 0.38, 2470, 0.2, 0.03, "triangle");
  hiss(c, out, t + 0.55, 0.8, { freq: 1300, q: 1.2, gain: 0.05, freqTo: 800 });
  hiss(c, out, t + 1.45, 0.12, { type: "lowpass", freq: 220, gain: 0.15, attack: 0.005 });
});

registerSynth("vivo-popcorn", (c, out) => {
  const t = c.currentTime;
  let at = t + 0.5;
  // começa devagar, acelera e vai parando
  while (at < t + 4) {
    const k = (at - t) / 4;
    const rate = 0.06 + Math.abs(k - 0.55) * 0.5;
    hiss(c, out, at, 0.035, { type: "highpass", freq: 1200 + Math.random() * 1800, gain: 0.08 + Math.random() * 0.06, attack: 0.002 });
    at += rate * (0.4 + Math.random());
  }
});

registerSynth("vivo-ready", (c, out) => {
  const t = c.currentTime;
  tone(c, out, t, 784, 0.35, 0.12, "triangle");
  tone(c, out, t + 0.12, 1175, 0.45, 0.1, "triangle");
});

registerSynth("vivo-watering", (c, out) => {
  const t = c.currentTime;
  hiss(c, out, t + 0.25, 1.9, { freq: 3200, q: 0.6, gain: 0.05, attack: 0.3 });
  for (let i = 0; i < 16; i++) tone(c, out, t + 0.35 + Math.random() * 1.7, 1800 + Math.random() * 2200, 0.04, 0.012);
});

registerSynth("vivo-plant-happy", (c, out) => {
  const t = c.currentTime;
  [1047, 1319, 1568].forEach((f, i) => tone(c, out, t + i * 0.11, f, 0.7, 0.06));
  hiss(c, out, t, 0.9, { type: "highpass", freq: 6000, gain: 0.015, attack: 0.2 });
});

registerSynth("vivo-can", (c, out) => {
  const t = c.currentTime;
  tone(c, out, t, 2300, 0.18, 0.05, "triangle");
  tone(c, out, t + 0.06, 3100, 0.14, 0.03, "triangle");
});

registerSynth("vivo-orbi-beep", (c, out) => {
  const t = c.currentTime;
  tone(c, out, t, 1240, 0.12, 0.08, "square", 1700);
  tone(c, out, t + 0.16, 1500, 0.14, 0.07, "square", 1100);
});

registerSynth("vivo-orbi-happy", (c, out) => {
  const t = c.currentTime;
  [880, 1109, 1319, 1760].forEach((f, i) => tone(c, out, t + i * 0.12, f, 0.2, 0.07, "triangle", f * 1.06));
  const o = c.createOscillator();
  const lfo = c.createOscillator();
  const lg = c.createGain();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.value = 660;
  lfo.frequency.value = 22;
  lg.gain.value = 40;
  lfo.connect(lg).connect(o.frequency);
  g.gain.setValueAtTime(0.0001, t + 0.5);
  g.gain.exponentialRampToValueAtTime(0.04, t + 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.15);
  o.connect(g).connect(out);
  o.start(t + 0.5);
  lfo.start(t + 0.5);
  o.stop(t + 1.2);
  lfo.stop(t + 1.2);
});

registerSynth("vivo-orbi-call", (c, out) => {
  const t = c.currentTime;
  tone(c, out, t, 990, 0.1, 0.08, "square");
  tone(c, out, t + 0.12, 1320, 0.25, 0.08, "square", 1980);
});

registerSynth("vivo-telescope", (c, out) => {
  const t = c.currentTime;
  hiss(c, out, t, 1.4, { type: "lowpass", freq: 300, gain: 0.08, attack: 0.5, freqTo: 2400 });
  tone(c, out, t + 0.4, 523, 1.0, 0.03);
  tone(c, out, t + 0.55, 784, 0.9, 0.025);
});
