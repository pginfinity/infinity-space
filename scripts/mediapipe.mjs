#!/usr/bin/env node
/**
 * Copia os arquivos WebAssembly do MediaPipe (usados pelo desfoque e pelo fundo da câmera) para
 * apps/web/public/mediapipe/wasm, para o app servir tudo do próprio servidor, sem CDN de terceiros.
 * Usa a versão que o @livekit/track-processors resolve. Roda sozinho antes do dev e do build.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "apps/web/package.json"));
let src;
try {
  // Os pacotes não exportam o package.json: resolve pela entrada principal de cada um.
  const tpMain = require.resolve("@livekit/track-processors");
  const tvMain = createRequire(tpMain).resolve("@mediapipe/tasks-vision");
  src = join(dirname(tvMain), "wasm");
} catch {
  console.log("[mediapipe] @livekit/track-processors não instalado; nada a copiar.");
  process.exit(0);
}
const out = join(root, "apps/web/public/mediapipe/wasm");
mkdirSync(out, { recursive: true });
let n = 0;
for (const f of readdirSync(src)) {
  const from = join(src, f);
  const to = join(out, f);
  if (existsSync(to) && statSync(to).size === statSync(from).size) continue;
  copyFileSync(from, to);
  n++;
}
console.log(`[mediapipe] ${n ? `${n} arquivo(s) copiado(s)` : "já atualizado"} em apps/web/public/mediapipe/wasm`);
