#!/usr/bin/env node
/**
 * Gera as músicas da jukebox com a ElevenLabs (Eleven Music).
 *
 * Lê `apps/web/src/activities/vivo/tracks.json` (id, segundos, prompt) e, para cada faixa, gera
 * versões brutas em `.musica/<id>-a.mp3`, `-b.mp3`... (fora do Git). A versão escolhida (a "a", se
 * ninguém escolheu outra) é tratada com ffmpeg e salva em `apps/web/public/music/<id>.mp3`:
 * volume igualado (-16 LUFS, pico -1,5 dB), duração exata do `seconds` (o servidor avança a fila por
 * ela), entrada e saída suaves. Também monta `.musica/ouvir.html` para comparar as versões.
 *
 * Só roda na máquina de quem desenvolve: a chave fica em `.env.local` (ELEVENLABS_API_KEY),
 * nunca no app nem na VPS.
 *
 * Uso: node scripts/music.mjs                    (gera as versões que faltam e publica as escolhidas)
 *      node scripts/music.mjs --list             (só mostra o que seria gerado)
 *      node scripts/music.mjs --versions 1       (quantas versões por faixa; padrão 2)
 *      node scripts/music.mjs --only lagoa       (só essa faixa)
 *      node scripts/music.mjs --pick lagoa=b     (troca a versão publicada, sem gerar nada)
 *      node scripts/music.mjs --redo lagoa=b     (refaz essa versão)
 *      node scripts/music.mjs --model music_v1   (outro modelo; padrão music_v2_5)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const TRACKS = join(root, "apps/web/src/activities/vivo/tracks.json");
const RAW = join(root, ".musica");
const OUT = join(root, "apps/web/public/music");
const PICKS = join(RAW, "escolhas.json");

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const pairs = (name) =>
  args
    .flatMap((a, i) => (args[i - 1] === name ? [a] : []))
    .map((p) => p.split("="))
    .filter(([id, v]) => id && /^[a-z]$/.test(v ?? ""));

const MODEL = value("--model") ?? "music_v2_5";
const listOnly = flag("--list");
const versions = Math.max(1, Math.min(4, Number(value("--versions") ?? 2)));
const only = value("--only");
const tracks = JSON.parse(readFileSync(TRACKS, "utf8")).filter((t) => !only || t.id === only);
const letters = "abcd".slice(0, versions).split("");

mkdirSync(RAW, { recursive: true });
mkdirSync(OUT, { recursive: true });
const picks = existsSync(PICKS) ? JSON.parse(readFileSync(PICKS, "utf8")) : {};
for (const [id, v] of pairs("--pick")) picks[id] = v;
writeFileSync(PICKS, JSON.stringify(picks, null, 2));

const raw = (id, v) => join(RAW, `${id}-${v}.mp3`);
const redo = new Set(pairs("--redo").map(([id, v]) => `${id}-${v}`));
const todo = tracks.flatMap((t) => letters.filter((v) => redo.has(`${t.id}-${v}`) || !existsSync(raw(t.id, v))).map((v) => ({ t, v })));
const minutes = todo.reduce((s, { t }) => s + t.seconds, 0) / 60;
console.log(`${tracks.length} faixas, ${todo.length} versões para gerar (~${minutes.toFixed(1)} min de música).`);
for (const { t, v } of todo) console.log(`  · ${t.id}-${v} (${t.seconds} s)`);
if (listOnly) process.exit(0);

function apiKey() {
  const file = join(root, ".env.local");
  if (!existsSync(file)) return process.env.ELEVENLABS_API_KEY;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*ELEVENLABS_API_KEY\s*=\s*"?([^"\s]+)"?\s*$/);
    if (m) return m[1];
  }
  return process.env.ELEVENLABS_API_KEY;
}

if (todo.length) {
  const key = apiKey();
  if (!key) {
    console.error("Falta ELEVENLABS_API_KEY no .env.local.");
    process.exit(1);
  }
  for (const { t, v } of todo) {
    const body = { prompt: t.prompt, music_length_ms: t.seconds * 1000, model_id: MODEL, force_instrumental: true };
    const started = Date.now();
    const res = await fetch("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_192", {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(`  ✗ ${t.id}-${v}: ${res.status} ${(await res.text()).slice(0, 300)}`);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(raw(t.id, v), buf);
    console.log(`  ✓ ${t.id}-${v} (${Math.round(buf.length / 1024)} KB, ${Math.round((Date.now() - started) / 1000)} s)`);
  }
}

/** Mede o volume (primeira passada do loudnorm) para a segunda passada ser linear, sem "bombear". */
function measure(file, filters) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", `${filters},loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json`, "-f", "null", "-"], { encoding: "utf8" });
  const json = r.stderr.slice(r.stderr.lastIndexOf("{"), r.stderr.lastIndexOf("}") + 1);
  return JSON.parse(json);
}

let published = 0;
for (const t of tracks) {
  const v = picks[t.id] ?? "a";
  const src = raw(t.id, v);
  if (!existsSync(src)) {
    console.warn(`  · ${t.id}: falta a versão ${v}`);
    continue;
  }
  // Duração exata (completa com silêncio se vier curta), entrada de 1 s e saída de 3 s.
  const shape = `apad=whole_dur=${t.seconds},atrim=0:${t.seconds},afade=t=in:d=1,afade=t=out:st=${t.seconds - 3}:d=3`;
  const m = measure(src, shape);
  const norm = `loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  const out = join(OUT, `${t.id}.mp3`);
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", src, "-af", `${shape},${norm}`, "-ar", "44100", "-ac", "2", "-b:a", "128k", "-map_metadata", "-1", out], { encoding: "utf8" });
  if (r.status !== 0) {
    console.error(`  ✗ ${t.id}: ffmpeg falhou\n${r.stderr}`);
    continue;
  }
  published++;
  console.log(`  ♪ ${t.id} ← versão ${v} (${m.input_i} LUFS → -16)`);
}
console.log(`${published} de ${tracks.length} faixas publicadas em ${relative(root, OUT)}.`);

// Página para comparar as versões (abrir no navegador; os arquivos ficam ao lado).
const rows = JSON.parse(readFileSync(TRACKS, "utf8"))
  .map((t) => {
    const cells = "abcd"
      .split("")
      .filter((v) => existsSync(raw(t.id, v)))
      .map((v) => `<div class="v${(picks[t.id] ?? "a") === v ? " on" : ""}"><b>${v.toUpperCase()}</b><audio controls preload="none" src="${t.id}-${v}.mp3"></audio></div>`)
      .join("");
    return `<section><h2>${t.title}</h2><p>${t.mood} · ${t.seconds} s</p>${cells}</section>`;
  })
  .join("");
writeFileSync(
  join(RAW, "ouvir.html"),
  `<!doctype html><meta charset="utf-8"><title>Jukebox · versões</title><style>
body{margin:0;padding:24px;background:#00112A;color:#F2F0EF;font:15px/1.4 system-ui,Segoe UI,sans-serif}
h1{font-size:20px;margin:0 0 4px}small{color:#9AA7B8}section{background:#0A1E3D;border-radius:12px;padding:14px 16px;margin:14px 0}
h2{font-size:16px;margin:0}p{margin:2px 0 10px;color:#9AA7B8}.v{display:flex;gap:12px;align-items:center;margin:6px 0;padding:4px 8px;border-radius:8px}
.v.on{outline:2px solid #FF6B00}audio{width:min(520px,100%)}</style>
<h1>Jukebox · versões geradas</h1><small>Contorno laranja = versão publicada. Para trocar: node scripts/music.mjs --pick id=b</small>${rows}`,
);
console.log(`Comparar versões: ${relative(root, join(RAW, "ouvir.html"))}`);
