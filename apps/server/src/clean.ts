import { DEFAULT_LOOK, type AvatarLook } from "@infinity/world";

/** Limpeza de dados que chegam dos clientes (nome e visual do avatar). */

const HEX = /^#[0-9a-fA-F]{6}$/;

export function cleanName(name: unknown): string {
  const s = typeof name === "string" ? name.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 32) : "";
  return s || "Visitante";
}

/** Aceita só cores hex e índices pequenos; qualquer coisa estranha volta ao padrão. */
export function cleanLook(look: unknown): AvatarLook {
  const l = (look ?? {}) as Partial<AvatarLook>;
  const hex = (v: unknown, d: string) => (typeof v === "string" && HEX.test(v) ? v : d);
  const idx = (v: unknown, d: number) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 32 ? v : d);
  const D = DEFAULT_LOOK;
  return {
    skin: hex(l.skin, D.skin),
    hair: idx(l.hair, D.hair),
    hairColor: hex(l.hairColor, D.hairColor),
    eyes: idx(l.eyes, D.eyes),
    brows: idx(l.brows, D.brows),
    mouth: idx(l.mouth, D.mouth),
    facial: idx(l.facial, D.facial),
    top: idx(l.top, D.top),
    topColor: hex(l.topColor, D.topColor),
    topColor2: hex(l.topColor2, D.topColor2),
    bottom: idx(l.bottom, D.bottom),
    bottomColor: hex(l.bottomColor, D.bottomColor),
    shoes: idx(l.shoes, D.shoes),
    shoesColor: hex(l.shoesColor, D.shoesColor),
    acc: Array.isArray(l.acc) ? [...new Set(l.acc.filter((a) => typeof a === "number" && Number.isInteger(a) && a >= 0 && a < 32))].slice(0, 4) : [],
    accColor: hex(l.accColor, D.accColor),
  };
}
