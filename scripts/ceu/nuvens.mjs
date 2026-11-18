#!/usr/bin/env node
/**
 * Extrai a camada de nuvens comparando um dia real do VIIRS (NOAA-20, "Corrected Reflectance True Color",
 * NASA GIBS) com a Terra sem nuvens do Blue Marble Next Generation (mesma grade equirretangular):
 * nuvem = o quanto o pixel ficou mais claro e mais cinza do que a superfície por baixo.
 *
 * Uso: node scripts/ceu/nuvens.mjs viirs.png bmng.png saida.jpg [largura=2048]
 * Precisa do ffmpeg no PATH.
 */
import { execFileSync } from "node:child_process";

const [viirs, bmng, out, widthArg] = process.argv.slice(2);
if (!viirs || !bmng || !out) {
  console.error("uso: node scripts/ceu/nuvens.mjs viirs.png bmng.png saida.jpg [largura]");
  process.exit(1);
}
const W = Number(widthArg ?? 2048);
const H = W / 2;
const raw = (file) => execFileSync("ffmpeg", ["-v", "error", "-i", file, "-vf", `scale=${W}:${H}:flags=area,format=rgb24`, "-f", "rawvideo", "-"], { maxBuffer: W * H * 4 });
const v = raw(viirs);
const b = raw(bmng);
const lum = (r, g, bb) => (0.2126 * r + 0.7152 * g + 0.0722 * bb) / 255;
const smooth = (a, c, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (c - a)));
  return t * t * (3 - 2 * t);
};
const cloud = Buffer.alloc(W * H);
for (let i = 0, p = 0; i < W * H; i++, p += 3) {
  const vr = v[p], vg = v[p + 1], vb = v[p + 2];
  const lv = lum(vr, vg, vb);
  const lb = lum(b[p], b[p + 1], b[p + 2]);
  const mx = Math.max(vr, vg, vb), mn = Math.min(vr, vg, vb);
  const sat = mx > 0 ? (mx - mn) / mx : 0;
  // Mais claro que a superfície (descontado um pouco do brilho do mar) e acinzentado.
  const a = smooth(0.4, 0.85, lv) * smooth(0.1, 0.3, lv - lb);
  const grey = 1 - smooth(0.12, 0.32, sat);
  cloud[i] = Math.round(255 * a * grey);
}
execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "gray", "-s", `${W}x${H}`, "-i", "-", "-q:v", "4", out], { input: cloud });
console.log(`nuvens ${W}x${H} → ${out}`);
