import { registerSynth } from "../../audio/sfx.ts";

/**
 * Sons de reserva do pacote easter, sintetizados até os arquivos de `sounds.json` serem gerados
 * (a geração é feita depois, por quem tem a chave). Curtos e baixinhos: ninguém é interrompido.
 */

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();
function noise(c: BaseAudioContext): AudioBuffer {
  let b = noiseBuffers.get(c);
  if (!b) {
    b = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseBuffers.set(c, b);
  }
  return b;
}

/** Ruído filtrado com envelope curto. */
function burst(c: AudioContext, out: AudioNode, at: number, dur: number, freq: number, gain: number, opts: { type?: BiquadFilterType; q?: number; freqTo?: number } = {}): void {
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const f = c.createBiquadFilter();
  f.type = opts.type ?? "bandpass";
  f.frequency.setValueAtTime(freq, at);
  if (opts.freqTo) f.frequency.exponentialRampToValueAtTime(opts.freqTo, at + dur);
  f.Q.value = opts.q ?? 1;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + Math.min(0.02, dur * 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f).connect(g).connect(out);
  src.start(at, Math.random() * 0.5);
  src.stop(at + dur + 0.05);
}

function tone(c: AudioContext, out: AudioNode, at: number, freq: number, dur: number, gain: number, type: OscillatorType = "sine", to?: number): void {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (to) o.frequency.exponentialRampToValueAtTime(to, at + dur * 0.9);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + dur + 0.05);
}

// livro escorregando e batendo no chão
registerSynth("easter-book", (c, out) => {
  const t = c.currentTime;
  burst(c, out, t, 0.18, 2400, 0.12, { freqTo: 1200 });
  tone(c, out, t + 0.32, 120, 0.18, 0.45, "sine", 60);
  burst(c, out, t + 0.32, 0.22, 500, 0.3, { type: "lowpass" });
});

// cabeçada na parede: baque oco e uma molinha
registerSynth("easter-bonk", (c, out) => {
  const t = c.currentTime;
  tone(c, out, t, 180, 0.16, 0.5, "triangle", 90);
  burst(c, out, t, 0.08, 800, 0.2, { type: "lowpass" });
  const o = c.createOscillator();
  const lfo = c.createOscillator();
  const depth = c.createGain();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.value = 520;
  lfo.frequency.value = 18;
  depth.gain.value = 60;
  lfo.connect(depth).connect(o.frequency);
  g.gain.setValueAtTime(0.0001, t + 0.08);
  g.gain.exponentialRampToValueAtTime(0.12, t + 0.1);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
  o.connect(g).connect(out);
  o.start(t + 0.08);
  lfo.start(t + 0.08);
  o.stop(t + 0.6);
  lfo.stop(t + 0.6);
});

// sorvida de lámen e o hashi na tigela
registerSynth("easter-slurp", (c, out) => {
  const t = c.currentTime;
  burst(c, out, t, 0.45, 900, 0.18, { q: 3, freqTo: 2600 });
  tone(c, out, t + 0.55, 2100, 0.08, 0.08, "sine");
});

// pergaminho se abrindo e um brilho de tinta
registerSynth("easter-pergaminho", (c, out) => {
  const t = c.currentTime;
  for (let i = 0; i < 4; i++) burst(c, out, t + i * 0.09, 0.12, 3000 + i * 400, 0.08, { q: 0.8 });
  tone(c, out, t + 0.35, 1320, 0.5, 0.05, "sine", 1760);
});
