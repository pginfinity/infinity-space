#!/usr/bin/env node
/**
 * Linhas das constelações e estrelas com nome do céu da estação, a partir do Yale Bright Star Catalog
 * (o mesmo `bsc5.dat` de `estrelas.mjs`). As figuras são as tradicionais, simplificadas e escritas aqui
 * pela designação de Bayer ("Alp Cru" = Alfa do Cruzeiro); o catálogo só dá a posição.
 *
 * Uso: node scripts/ceu/constelacoes.mjs caminho/para/bsc5.dat[.gz]  →  apps/web/public/space/constelacoes.json
 *
 * Saída: { linhas: { cru: [raH, decG, raH, decG, ...] (pares = um traço) }, estrelas: { sirius: [raH, decG, mag] } }
 */
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Figuras: "A-B" liga duas estrelas; sem constelação no nome, vale a da figura. */
const FIGURES = {
  cru: "Alp-Gam Bet-Del",
  cen: "Alp-Bet Bet-Eps Eps-Gam Gam-Del Eps-Zet Zet-Eta Eta-Kap Zet-The The-Iot",
  ori: "Lam-Alp Lam-Gam Alp-Zet Gam-Del Del-Eps Eps-Zet Zet-Kap Del-Bet",
  cma: "Bet-Alp Alp-Del Del-Eps Del-Eta",
  cmi: "Alp-Bet",
  sco: "Bet-Del Del-Pi Del-Sig Sig-Alp Alp-Tau Tau-Eps Eps-Mu Mu-Zet Zet-Eta Eta-The The-Iot Iot-Kap Kap-Lam Lam-Ups",
  sgr: "Gam-Del Del-Eps Eps-Gam Del-Lam Lam-Phi Del-Phi Eps-Zet Zet-Phi Phi-Sig Sig-Tau Tau-Zet",
  uma: "Alp-Bet Bet-Gam Gam-Del Del-Alp Del-Eps Eps-Zet Zet-Eta",
  cas: "Bet-Alp Alp-Gam Gam-Del Del-Eps",
  leo: "Eps-Mu Mu-Zet Zet-Gam Gam-Eta Eta-Alp Alp-The The-Bet Bet-Del Del-Gam Del-The",
  cyg: "Alp-Gam Gam-Eta Eta-Bet Del-Gam Gam-Eps Eps-Zet",
  lyr: "Alp-Zet Zet-Bet Bet-Gam Gam-Del Del-Zet Alp-Eps",
  aql: "Gam-Alp Alp-Bet Alp-Del Del-Zet Del-Lam Bet-Eta Eta-The",
  gem: "Alp-Tau Tau-Eps Eps-Mu Mu-Eta Bet-Ups Ups-Del Del-Zet Zet-Gam",
  tau: "Zet-Alp Alp-The The-Gam Gam-Del Del-Eps Eps-Bet Gam-Lam",
  boo: "Alp-Eps Eps-Del Del-Bet Bet-Gam Gam-Rho Rho-Alp Alp-Zet Alp-Eta",
  vir: "Alp-The The-Gam Gam-Eta Eta-Bet Gam-Del Del-Eps Alp-Zet Zet-Del",
  peg: "Alp-Bet Bet-Alp_And Alp_And-Gam Gam-Alp Alp-Zet Zet-The The-Eps Bet-Eta",
  and: "Alp-Del Del-Bet Bet-Gam",
  per: "Eta-Gam Gam-Alp Alp-Del Del-Eps Eps-Zet Alp-Bet",
  aur: "Alp-Bet Bet-The The-Bet_Tau Bet_Tau-Iot Iot-Alp",
  tra: "Alp-Bet Bet-Gam Gam-Alp",
  crv: "Gam-Del Del-Bet Bet-Eps Eps-Gam Eps-Alp",
  ari: "Alp-Bet Bet-Gam",
};
const ABBR = { cru: "Cru", cen: "Cen", ori: "Ori", cma: "CMa", cmi: "CMi", sco: "Sco", sgr: "Sgr", uma: "UMa", cas: "Cas", leo: "Leo", cyg: "Cyg", lyr: "Lyr", aql: "Aql", gem: "Gem", tau: "Tau", boo: "Boo", vir: "Vir", peg: "Peg", and: "And", per: "Per", aur: "Aur", tra: "TrA", crv: "Crv", ari: "Ari" };

/** Estrelas que abrem um cartão ao clicar (os textos ficam no i18n, `espaco.astro.<chave>`). */
const NAMED = {
  sirius: "Alp CMa",
  canopus: "Alp Car",
  alfaCentauro: "Alp Cen",
  arcturo: "Alp Boo",
  vega: "Alp Lyr",
  capela: "Alp Aur",
  rigel: "Bet Ori",
  procion: "Alp CMi",
  achernar: "Alp Eri",
  betelgeuse: "Alp Ori",
  hadar: "Bet Cen",
  altair: "Alp Aql",
  acrux: "Alp Cru",
  aldebara: "Alp Tau",
  antares: "Alp Sco",
  espiga: "Alp Vir",
  polux: "Bet Gem",
  fomalhaut: "Alp PsA",
  deneb: "Alp Cyg",
  mimosa: "Bet Cru",
  regulo: "Alp Leo",
  gacrux: "Gam Cru",
  sigmaOitante: "Sig Oct",
  pleiades: "Eta Tau",
};

const src = process.argv[2];
if (!src) {
  console.error("uso: node scripts/ceu/constelacoes.mjs bsc5.dat[.gz]");
  process.exit(1);
}
let raw = readFileSync(src);
if (raw[0] === 0x1f && raw[1] === 0x8b) raw = gunzipSync(raw);

/** "Alp Cru" → a componente mais brilhante com essa letra grega (Alfa¹ e Alfa² do Cruzeiro viram uma). */
const byName = new Map();
for (const line of raw.toString("latin1").split(/\r?\n/)) {
  const bayer = line.slice(7, 10).trim();
  const con = line.slice(11, 14).trim();
  const rah = line.slice(75, 77).trim();
  if (!bayer || !con || !rah) continue;
  const ra = Number(rah) + Number(line.slice(77, 79)) / 60 + Number(line.slice(79, 83)) / 3600;
  const sign = line[83] === "-" ? -1 : 1;
  const dec = sign * (Number(line.slice(84, 86)) + Number(line.slice(86, 88)) / 60 + Number(line.slice(88, 90)) / 3600);
  const mag = Number(line.slice(102, 107));
  if (![ra, dec, mag].every(Number.isFinite)) continue;
  const key = `${bayer} ${con}`;
  const prev = byName.get(key);
  if (!prev || mag < prev.mag) byName.set(key, { ra, dec, mag });
}

function star(name, con) {
  const full = name.includes("_") ? name.replace("_", " ") : `${name} ${con}`;
  const s = byName.get(full);
  if (!s) throw new Error(`estrela não encontrada no catálogo: ${full}`);
  return s;
}

const r = (x, d) => Number(x.toFixed(d));
const linhas = {};
for (const [key, fig] of Object.entries(FIGURES)) {
  linhas[key] = fig.split(" ").flatMap((seg) => {
    const [a, b] = seg.split("-").map((n) => star(n, ABBR[key]));
    return [r(a.ra, 4), r(a.dec, 3), r(b.ra, 4), r(b.dec, 3)];
  });
}
const estrelas = {};
for (const [key, name] of Object.entries(NAMED)) {
  const s = star(name.replace(" ", "_"));
  estrelas[key] = [r(s.ra, 4), r(s.dec, 3), r(s.mag, 2)];
}

const out = join(dirname(fileURLToPath(import.meta.url)), "../../apps/web/public/space/constelacoes.json");
writeFileSync(out, JSON.stringify({ linhas, estrelas }) + "\n");
console.log(`${Object.keys(linhas).length} constelações, ${Object.keys(estrelas).length} estrelas com nome → ${out}`);
