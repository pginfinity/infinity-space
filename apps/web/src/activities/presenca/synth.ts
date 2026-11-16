import { registerSynth } from "../../audio/sfx.ts";

/**
 * Sons sintetizados de reserva do pacote (tocam enquanto os arquivos do sounds.json não existem).
 * Curtos e baixos: um chamado é um toque no ombro, não um alarme.
 */

function note(c: AudioContext, out: AudioNode, freq: number, at: number, dur: number, gain: number, type: OscillatorType = "sine"): void {
  const t = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** Duas notas de marimba (quinta acima), com um harmônico leve. */
registerSynth("presenca-chamado", (c, out) => {
  note(c, out, 659.25, 0, 0.32, 0.32);
  note(c, out, 1318.5, 0, 0.18, 0.05);
  note(c, out, 987.77, 0.14, 0.42, 0.28);
  note(c, out, 1975.5, 0.14, 0.2, 0.04);
});

registerSynth("presenca-seguir", (c, out) => {
  note(c, out, 784, 0, 0.16, 0.25, "triangle");
});

/** Brilho subindo, com um sopro filtrado. */
registerSynth("presenca-warp", (c, out) => {
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(420, t);
  o.frequency.exponentialRampToValueAtTime(1680, t + 0.45);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.14, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.65);
  for (let i = 0; i < 4; i++) note(c, out, 1800 + i * 420, 0.08 + i * 0.07, 0.16, 0.05);
});
