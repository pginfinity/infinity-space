#!/usr/bin/env node
/**
 * Copia as fontes do Excalidraw (quadro branco das salas) para apps/web/public/excalidraw/fonts, para o
 * app servir do próprio servidor, sem CDN de terceiros. Fica de fora a Xiaolai (13 MB, só para texto em
 * chinês, japonês e coreano): se alguém escrever nessas línguas, o Excalidraw busca no CDN dele.
 * Roda sozinho antes do dev e do build.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "apps/web/package.json"));
let src;
try {
  src = join(dirname(require.resolve("@excalidraw/excalidraw")), "fonts");
} catch {
  console.log("[excalidraw] @excalidraw/excalidraw não instalado; nada a copiar.");
  process.exit(0);
}
const out = join(root, "apps/web/public/excalidraw/fonts");
let n = 0;
for (const family of readdirSync(src)) {
  if (family === "Xiaolai") continue;
  mkdirSync(join(out, family), { recursive: true });
  for (const f of readdirSync(join(src, family))) {
    const from = join(src, family, f);
    const to = join(out, family, f);
    if (existsSync(to) && statSync(to).size === statSync(from).size) continue;
    copyFileSync(from, to);
    n++;
  }
}
console.log(`[excalidraw] ${n ? `${n} fonte(s) copiada(s)` : "já atualizado"} em apps/web/public/excalidraw/fonts`);
