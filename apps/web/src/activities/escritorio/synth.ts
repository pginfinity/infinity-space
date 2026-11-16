/**
 * Peças dos sons sintetizados de reserva do pacote (tocam enquanto os arquivos gerados a partir
 * do sounds.json não existem). Tudo curto e discreto: é um escritório.
 */

let noiseBuf: AudioBuffer | null = null;
function noiseBuffer(c: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === c.sampleRate) return noiseBuf;
  const len = c.sampleRate * 2;
  noiseBuf = c.createBuffer(1, len, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

export interface NoiseOpts {
  dur: number;
  /** Frequência do filtro no começo e no fim (Hz). */
  from: number;
  to: number;
  q?: number;
  gain?: number;
  attack?: number;
  delay?: number;
  type?: BiquadFilterType;
}

/** Ruído filtrado com varredura (sopros, papel, foguete). */
export function noise(c: AudioContext, out: AudioNode, o: NoiseOpts): void {
  const t = c.currentTime + (o.delay ?? 0);
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  const f = c.createBiquadFilter();
  f.type = o.type ?? "bandpass";
  f.Q.value = o.q ?? 1;
  f.frequency.setValueAtTime(o.from, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + o.dur);
  const g = c.createGain();
  const peak = o.gain ?? 0.3;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + (o.attack ?? 0.02));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random());
  src.stop(t + o.dur + 0.05);
}

export interface ToneOpts {
  freq: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
  /** Frequência final (glissando). */
  to?: number;
  attack?: number;
}

/** Nota simples com envelope (bipes, sininhos, acordes). */
export function tone(c: AudioContext, out: AudioNode, o: ToneOpts): void {
  const t = c.currentTime + (o.delay ?? 0);
  const osc = c.createOscillator();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.freq, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.gain ?? 0.25, t + (o.attack ?? 0.008));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + o.dur + 0.05);
}
