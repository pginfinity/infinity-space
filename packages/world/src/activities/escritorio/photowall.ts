/**
 * Mural de fotos da copa: as fotos de grupo da cabine do Marketing Studio, pregadas no Café & Copa.
 *
 * Fluxo: no disparo da cabine, o servidor dá a cada pessoa que saiu na foto um bilhete (uso único
 * por foto, vale alguns minutos). Quem quiser põe a foto no mural mandando a imagem (JPEG reduzido
 * no navegador) por HTTP com o bilhete; a primeira que chega vale para o grupo todo. O mural guarda
 * só as últimas PHOTOWALL_MAX; qualquer pessoa perto dele tira uma foto.
 *
 * Privacidade: a foto é o render da cena (avatares e móveis), nunca câmera ou tela de alguém. Junto
 * da imagem fica só a data e os nomes que já aparecem impressos na moldura (quem saiu na foto).
 * Quem enviou não é guardado.
 */

export const PHOTOWALL_ID = "mural-fotos";
export const PHOTOWALL_KIND = "photowall";
/** Fotos no mural; ao passar disso, as mais antigas saem (do mural e do disco). */
export const PHOTOWALL_MAX = 12;
/** Distância máxima (m) do mural para tirar uma foto (e para a galeria continuar aberta). */
export const PHOTOWALL_RANGE = 3.2;
/** Tamanho máximo do envio (bytes). */
export const PHOTOWALL_MAX_BYTES = 2 * 1024 * 1024;
/** Lado maior da imagem que o navegador envia (reduzida antes). */
export const PHOTOWALL_SIDE = 1280;
/** O servidor recusa imagens com lado maior que isto (ou menor que o mínimo). */
export const PHOTOWALL_MAX_SIDE = 2048;
export const PHOTOWALL_MIN_SIDE = 64;
/** Por quanto tempo o bilhete da cabine vale. */
export const PHOTOWALL_TICKET_MS = 15 * 60 * 1000;
/** Envios por pessoa numa janela de tempo. */
export const PHOTOWALL_RATE = { max: 4, windowMs: 10 * 60 * 1000 } as const;
/** Endereço HTTP: POST envia; GET `/<arquivo>` devolve a imagem. */
export const PHOTOWALL_API = "/api/mural-fotos";
/** Nomes de arquivo aceitos (id + extensão). */
export const PHOTOWALL_FILE_RE = /^([a-z0-9]{8,40})\.(jpg|png)$/;

export type PhotoWallType = "jpeg" | "png";

export interface WallPhoto {
  id: string;
  /** Quando foi pregada (relógio do servidor, ms). */
  at: number;
  type: PhotoWallType;
  /** Largura e altura em pixels. */
  w: number;
  h: number;
  /** Quem saiu na foto (os mesmos nomes impressos na moldura), para o texto alternativo. */
  names: string[];
}

export interface PhotoWallState {
  /** Da mais antiga para a mais nova. */
  photos: WallPhoto[];
}

/** Evento "ticket" da cabine: só para quem saiu na foto. */
export interface PhotoTicket {
  shot: string;
  ticket: string;
}

/** Evento "posted" do mural: a foto deste disparo foi para o mural (para quem saiu nela). */
export interface PhotoWallPosted {
  shot: string;
}

/** Erros do envio (corpo `{ error }` da resposta HTTP). */
export type PhotoWallError = "sessao" | "origem" | "bilhete" | "ja-no-mural" | "tipo" | "tamanho" | "grande" | "muitas" | "mural";

export function photoWallFile(p: Pick<WallPhoto, "id" | "type">): string {
  return `${p.id}.${p.type === "png" ? "png" : "jpg"}`;
}

export function photoWallUrl(p: Pick<WallPhoto, "id" | "type">): string {
  return `${PHOTOWALL_API}/${photoWallFile(p)}`;
}

/** Prega uma foto no fim; se passar do limite, as mais antigas saem (e voltam em `dropped`). */
export function photoWallAdd(photos: readonly WallPhoto[], photo: WallPhoto, max = PHOTOWALL_MAX): { photos: WallPhoto[]; dropped: WallPhoto[] } {
  const next = [...photos.filter((p) => p.id !== photo.id), photo];
  const cut = Math.max(0, next.length - max);
  return { photos: next.slice(cut), dropped: next.slice(0, cut) };
}

/** Tira uma foto do mural (a mesma lista se ela não está lá). */
export function photoWallRemove(photos: readonly WallPhoto[], id: string): WallPhoto[] {
  return photos.some((p) => p.id === id) ? photos.filter((p) => p.id !== id) : (photos as WallPhoto[]);
}

/**
 * Confere pelos bytes do começo que é um PNG ou JPEG de verdade e lê as dimensões
 * (cabeçalho IHDR do PNG; marcador SOF do JPEG). Devolve null para qualquer outra coisa.
 */
export function photoWallImageInfo(b: Uint8Array): { type: PhotoWallType; w: number; h: number } | null {
  const u16 = (i: number) => (b[i]! << 8) | b[i + 1]!;
  const u32 = (i: number) => ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!;
  // PNG: assinatura de 8 bytes e o primeiro bloco é o IHDR (largura e altura).
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length >= 33 && PNG.every((v, i) => b[i] === v)) {
    if (u32(8) !== 13 || String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!) !== "IHDR") return null;
    const w = u32(16);
    const h = u32(20);
    return w > 0 && h > 0 ? { type: "png", w, h } : null;
  }
  // JPEG: FF D8 FF e os segmentos até o SOF (quadro), que traz altura e largura.
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    let i = 2;
    while (i + 3 < b.length) {
      if (b[i] !== 0xff) return null;
      let m = b[i + 1]!;
      // bytes de preenchimento (FF FF ...)
      while (m === 0xff && i + 2 < b.length) {
        i++;
        m = b[i + 1]!;
      }
      // marcadores sem tamanho
      if (m === 0x01 || (m >= 0xd0 && m <= 0xd8)) {
        i += 2;
        continue;
      }
      // início dos dados sem ter achado o quadro, ou fim da imagem: inválido
      if (m === 0xda || m === 0xd9) return null;
      if (i + 3 >= b.length) return null;
      const len = u16(i + 2);
      if (len < 2) return null;
      const sof = m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
      if (sof) {
        if (i + 8 >= b.length || len < 7) return null;
        const h = u16(i + 5);
        const w = u16(i + 7);
        return w > 0 && h > 0 ? { type: "jpeg", w, h } : null;
      }
      i += 2 + len;
    }
  }
  return null;
}

/** As dimensões servem para o mural? (nem minúscula nem gigante) */
export function photoWallSizeOk(w: number, h: number): boolean {
  return w >= PHOTOWALL_MIN_SIDE && h >= PHOTOWALL_MIN_SIDE && w <= PHOTOWALL_MAX_SIDE && h <= PHOTOWALL_MAX_SIDE;
}

/** Tamanho reduzido para enviar: lado maior até `side`, sem aumentar. */
export function photoWallFit(w: number, h: number, side = PHOTOWALL_SIDE): { w: number; h: number } {
  const k = Math.min(1, side / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}
