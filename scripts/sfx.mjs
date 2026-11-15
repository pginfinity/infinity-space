#!/usr/bin/env node
/**
 * Gera os efeitos sonoros que faltam com a ElevenLabs (Sound Effects).
 *
 * Lê todos os `sounds.json` de `apps/web/src` ({ "nome": { "prompt": "...", "seconds": 2 } })
 * e cria `apps/web/public/sfx/<nome>.mp3` para os que ainda não existem.
 * Só roda na máquina de quem desenvolve: a chave fica em `.env.local` (ELEVENLABS_API_KEY),
 * nunca no app nem na VPS.
 *
 * Uso: node scripts/sfx.mjs            (gera os que faltam)
 *      node scripts/sfx.mjs --list     (só mostra o que seria gerado)
 *      node scripts/sfx.mjs --force gong   (refaz um som)
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(root, "apps/web/src");
const OUT = join(root, "apps/web/public/sfx");
const args = process.argv.slice(2);
const listOnly = args.includes("--list");
const force = new Set(args.includes("--force") ? args.slice(args.indexOf("--force") + 1) : []);

function findSounds(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) findSounds(p, acc);
    else if (name === "sounds.json") acc.push(p);
  }
  return acc;
}

function apiKey() {
  const file = join(root, ".env.local");
  if (!existsSync(file)) return process.env.ELEVENLABS_API_KEY;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*ELEVENLABS_API_KEY\s*=\s*"?([^"\s]+)"?\s*$/);
    if (m) return m[1];
  }
  return process.env.ELEVENLABS_API_KEY;
}

const wanted = new Map();
for (const file of findSounds(SRC)) {
  const list = JSON.parse(readFileSync(file, "utf8"));
  for (const [name, spec] of Object.entries(list)) {
    if (!/^[a-z0-9-]+$/.test(name)) {
      console.warn(`ignorado (nome inválido): ${name} em ${relative(root, file)}`);
      continue;
    }
    if (wanted.has(name)) console.warn(`nome repetido: ${name} (${relative(root, file)})`);
    wanted.set(name, { ...spec, from: relative(root, file) });
  }
}

mkdirSync(OUT, { recursive: true });
const todo = [...wanted].filter(([name]) => force.has(name) || !existsSync(join(OUT, `${name}.mp3`)));
console.log(`${wanted.size} sons declarados, ${todo.length} para gerar.`);
for (const [name, s] of todo) console.log(`  · ${name} (${s.seconds ?? "auto"} s) — ${s.prompt}`);
if (listOnly || todo.length === 0) process.exit(0);

const key = apiKey();
if (!key) {
  console.error("Falta ELEVENLABS_API_KEY no .env.local.");
  process.exit(1);
}

let ok = 0;
for (const [name, s] of todo) {
  const body = { text: s.prompt, prompt_influence: s.influence ?? 0.45 };
  if (s.seconds) body.duration_seconds = Math.max(0.5, Math.min(22, s.seconds));
  const res = await fetch("https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128", {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error(`  ✗ ${name}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(join(OUT, `${name}.mp3`), buf);
  ok++;
  console.log(`  ✓ ${name} (${Math.round(buf.length / 1024)} KB)`);
}
console.log(`${ok} de ${todo.length} gerados em ${relative(root, OUT)}.`);
