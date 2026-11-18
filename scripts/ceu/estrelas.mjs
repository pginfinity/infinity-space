#!/usr/bin/env node
/**
 * Converte o Yale Bright Star Catalog (BSC5, Hoffleit & Warren 1991; arquivo bsc5.dat do Harvard/CfA ou
 * catalog do CDS V/50) num binário compacto com as estrelas até a magnitude 5,5, para o céu da estação.
 *
 * Uso: node scripts/ceu/estrelas.mjs caminho/para/bsc5.dat[.gz]  →  apps/web/public/space/estrelas.bin
 *
 * Formato (little-endian, 6 bytes por estrela, da mais brilhante para a mais fraca):
 *   u16 RA (0..65535 = 0..24 h, J2000) · i16 Dec (-32767..32767 = -90..+90°) ·
 *   u8 magnitude ((V + 2) × 20) · u8 cor B-V ((B-V + 0,5) × 50)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_MAG = 5.5;
const src = process.argv[2];
if (!src) {
  console.error("uso: node scripts/ceu/estrelas.mjs bsc5.dat[.gz]");
  process.exit(1);
}
let raw = readFileSync(src);
if (raw[0] === 0x1f && raw[1] === 0x8b) raw = gunzipSync(raw);
const stars = [];
for (const line of raw.toString("latin1").split(/\r?\n/)) {
  // Colunas do ReadMe do catálogo (1-based): RA J2000 76-83, Dec 84-90, Vmag 103-107, B-V 110-114.
  const rah = line.slice(75, 77).trim();
  if (!rah) continue; // sem posição (novas, aglomerados removidos)
  const ra = Number(rah) + Number(line.slice(77, 79)) / 60 + Number(line.slice(79, 83)) / 3600;
  const sign = line[83] === "-" ? -1 : 1;
  const dec = sign * (Number(line.slice(84, 86)) + Number(line.slice(86, 88)) / 60 + Number(line.slice(88, 90)) / 3600);
  const mag = Number(line.slice(102, 107));
  const bvText = line.slice(109, 114).trim();
  const bv = bvText ? Number(bvText) : 0.6;
  if (!Number.isFinite(ra) || !Number.isFinite(dec) || !Number.isFinite(mag) || mag > MAX_MAG) continue;
  stars.push({ ra, dec, mag, bv: Number.isFinite(bv) ? bv : 0.6 });
}
stars.sort((a, b) => a.mag - b.mag);
const buf = Buffer.alloc(stars.length * 6);
stars.forEach((s, i) => {
  const o = i * 6;
  buf.writeUInt16LE(Math.round((s.ra / 24) * 65535) % 65536, o);
  buf.writeInt16LE(Math.round((s.dec / 90) * 32767), o + 2);
  buf.writeUInt8(Math.max(0, Math.min(255, Math.round((s.mag + 2) * 20))), o + 4);
  buf.writeUInt8(Math.max(0, Math.min(255, Math.round((s.bv + 0.5) * 50))), o + 5);
});
const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const out = join(root, "apps/web/public/space/estrelas.bin");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, buf);
console.log(`${stars.length} estrelas (V ≤ ${MAX_MAG}) → ${out} (${buf.length} bytes)`);
