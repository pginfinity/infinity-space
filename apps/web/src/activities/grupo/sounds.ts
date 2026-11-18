import { registerSynth } from "../../audio/sfx.ts";

/**
 * Sons sintetizados de reserva dos jogos de grupo (tocam até existirem os arquivos gerados a partir
 * do sounds.json). Curtos, suaves e com envelope, para não cansar quem ouve todo dia.
 */

type Wave = OscillatorType;

/** Uma nota com ataque rápido e decaimento exponencial. */
function note(c: AudioContext, out: AudioNode, f: number, t: number, dur: number, gain: number, type: Wave = "sine", slideTo?: number): void {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** Ruído curto filtrado (estalos, caixa, apito). */
function noise(c: AudioContext, out: AudioNode, t: number, dur: number, gain: number, freq: number, q = 1, type: BiquadFilterType = "bandpass"): void {
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t);
}

registerSynth("grupo-entrar", (c, out) => {
  const t = c.currentTime;
  note(c, out, 520, t, 0.12, 0.35, "sine", 880);
  note(c, out, 1040, t + 0.06, 0.16, 0.18, "triangle");
});

registerSynth("grupo-tique", (c, out) => {
  const t = c.currentTime;
  noise(c, out, t, 0.04, 0.5, 3200, 6);
  note(c, out, 1800, t, 0.03, 0.08, "square");
});

registerSynth("grupo-inicio", (c, out) => {
  const t = c.currentTime;
  [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => note(c, out, f, t + i * 0.09, 0.32, 0.22, "triangle"));
  note(c, out, 1046.5, t + 0.45, 0.9, 0.16, "sine");
  noise(c, out, t, 0.5, 0.06, 1800, 0.7, "highpass");
});

registerSynth("grupo-acerto", (c, out) => {
  const t = c.currentTime;
  note(c, out, 880, t, 0.25, 0.3, "triangle");
  note(c, out, 1318.5, t + 0.1, 0.5, 0.28, "triangle");
  note(c, out, 2637, t + 0.1, 0.3, 0.05, "sine");
});

registerSynth("grupo-erro", (c, out) => {
  const t = c.currentTime;
  note(c, out, 220, t, 0.22, 0.22, "sawtooth", 196);
  note(c, out, 174.6, t + 0.18, 0.4, 0.2, "sawtooth", 155);
});

registerSynth("grupo-revelar", (c, out) => {
  const t = c.currentTime;
  for (let i = 0; i < 14; i++) noise(c, out, t + i * 0.05, 0.05, 0.12 + i * 0.012, 1800, 1.2);
  noise(c, out, t + 0.72, 0.6, 0.35, 6000, 0.6, "highpass");
  note(c, out, 110, t + 0.72, 0.3, 0.3, "sine", 60);
});

registerSynth("grupo-fanfarra", (c, out) => {
  const t = c.currentTime;
  const seq: [number, number, number][] = [
    [523.25, 0, 0.16],
    [523.25, 0.17, 0.16],
    [523.25, 0.34, 0.16],
    [659.25, 0.51, 0.5],
    [587.33, 1.05, 0.16],
    [659.25, 1.22, 0.16],
    [783.99, 1.39, 1.1],
  ];
  for (const [f, dt, d] of seq) {
    note(c, out, f, t + dt, d + 0.05, 0.2, "sawtooth");
    note(c, out, f * 2, t + dt, d, 0.06, "triangle");
  }
  note(c, out, 261.63, t + 1.39, 1.2, 0.15, "triangle");
  for (let i = 0; i < 22; i++) noise(c, out, t + 1.4 + Math.random() * 1.6, 0.06, 0.05, 2500 + Math.random() * 2500, 2);
});

registerSynth("desenho-acerto", (c, out) => {
  const t = c.currentTime;
  [1046.5, 1318.5, 1568].forEach((f, i) => note(c, out, f, t + i * 0.06, 0.3, 0.2, "triangle"));
});

registerSynth("desenho-vez", (c, out) => {
  const t = c.currentTime;
  note(c, out, 659.25, t, 0.35, 0.3, "sine");
  note(c, out, 987.77, t + 0.16, 0.5, 0.28, "sine");
});

registerSynth("desenho-quase", (c, out) => {
  const t = c.currentTime;
  note(c, out, 440, t, 0.12, 0.2, "triangle", 520);
  note(c, out, 520, t + 0.13, 0.18, 0.18, "triangle", 470);
});

registerSynth("stop-roleta", (c, out) => {
  const t = c.currentTime;
  let dt = 0;
  let gap = 0.045;
  while (dt < 2.3) {
    noise(c, out, t + dt, 0.025, 0.35, 2600, 5);
    dt += gap;
    gap *= 1.09;
  }
  note(c, out, 1318.5, t + 2.4, 0.4, 0.25, "triangle");
});

registerSynth("stop-grito", (c, out) => {
  const t = c.currentTime;
  note(c, out, 196, t, 0.55, 0.3, "square", 185);
  note(c, out, 247, t, 0.55, 0.18, "square", 233);
  noise(c, out, t, 0.25, 0.12, 900, 0.8);
});

registerSynth("stop-largada", (c, out) => {
  const t = c.currentTime;
  const o = c.createOscillator();
  const lfo = c.createOscillator();
  const lg = c.createGain();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.value = 2900;
  lfo.frequency.value = 38;
  lg.gain.value = 120;
  lfo.connect(lg).connect(o.frequency);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
  g.gain.setValueAtTime(0.22, t + 0.4);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
  o.connect(g).connect(out);
  o.start(t);
  lfo.start(t);
  o.stop(t + 0.6);
  lfo.stop(t + 0.6);
});

registerSynth("imp-papel", (c, out) => {
  const t = c.currentTime;
  note(c, out, 110, t, 1.6, 0.25, "sawtooth", 98);
  note(c, out, 164.8, t + 0.05, 1.4, 0.14, "triangle");
  note(c, out, 220, t + 0.5, 1.1, 0.12, "sine");
  noise(c, out, t + 0.5, 0.4, 0.15, 400, 0.7, "lowpass");
});

registerSynth("imp-congelar", (c, out) => {
  const t = c.currentTime;
  for (let i = 0; i < 10; i++) noise(c, out, t + i * 0.03, 0.04, 0.22, 4000 + i * 300, 4);
  [1568, 2093, 2637].forEach((f, i) => note(c, out, f, t + 0.25 + i * 0.07, 0.5, 0.12, "sine"));
});

registerSynth("imp-reuniao", (c, out) => {
  const t = c.currentTime;
  for (let k = 0; k < 2; k++) {
    note(c, out, 660, t + k * 0.8, 0.35, 0.18, "square", 640);
    note(c, out, 494, t + k * 0.8 + 0.38, 0.35, 0.18, "square", 480);
  }
});

registerSynth("palavra-proibida", (c, out) => {
  const t = c.currentTime;
  // apito de juiz curto e duas notas descendo: "epa!"
  note(c, out, 1320, t, 0.12, 0.16, "square", 1240);
  note(c, out, 392, t + 0.12, 0.22, 0.2, "triangle", 370);
  note(c, out, 294, t + 0.3, 0.32, 0.2, "triangle", 277);
});

registerSynth("palavra-pular", (c, out) => {
  const t = c.currentTime;
  // virada de carta: sopro curto subindo e um toque leve
  noise(c, out, t, 0.18, 0.18, 1400, 0.9, "bandpass");
  note(c, out, 660, t + 0.08, 0.14, 0.1, "sine", 990);
});
