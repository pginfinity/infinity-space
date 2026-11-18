import { skyAt, type Sky } from "./astro.ts";
import { SKY_SPEED, skyNow } from "./clock.ts";

/**
 * O céu do momento, fora do React (como o registro de poses): recalculado a cada 5 s enquanto alguém
 * usa (a cena, a luz do escritório, o painel). Em 5 s o céu gira 0,02°, menos de um pixel.
 */

const INTERVAL = Math.max(200, 5000 / SKY_SPEED);

let current: Sky | null = null;
let version = 0;
let users = 0;
let timer = 0;

function refresh(): void {
  current = skyAt(new Date(skyNow()));
  version++;
}

/** Céu atual (calcula na hora se ninguém pediu ainda). */
export function getSky(): Sky {
  if (!current) refresh();
  return current!;
}

/** Muda a cada recálculo: quem desenha só refaz o que depende do céu quando o número muda. */
export function skyVersion(): number {
  return version;
}

/** Mantém o céu atualizado enquanto o chamador precisar; devolve a função para soltar. */
export function retainSky(): () => void {
  users++;
  if (users === 1) {
    refresh();
    timer = window.setInterval(refresh, INTERVAL);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    users--;
    if (users === 0) window.clearInterval(timer);
  };
}
