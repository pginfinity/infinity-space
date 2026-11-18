import * as THREE from "three";

/**
 * Texturas do céu (todas em `public/space/`, sem rede externa). Cada uma nasce vazia (o shader lê preto)
 * e recebe a imagem quando chega, já no tamanho certo: a cena abre na hora (e o `compileAsync` do 3D não espera download).
 * A decodificação roda fora da thread principal (`createImageBitmap`); a imagem fica em cache e é
 * compartilhada pelas lentes e pelo telescópio.
 *
 * Duas resoluções: "cheia" (3D e telescópio) e "leve" (modo leve do 3D e a lente 2D, que desenha em
 * meia resolução).
 */

export type SkyTier = "cheia" | "leve";

const FILES = {
  day: { cheia: "terra-dia-4k.webp", leve: "terra-dia-2k.webp", color: true },
  // As luzes ficam em 2k nas duas: cidades são pontos pequenos e somem em 1k.
  night: { cheia: "terra-luzes-2k.jpg", leve: "terra-luzes-2k.jpg", color: false },
  clouds: { cheia: "terra-nuvens-2k.webp", leve: "terra-nuvens-1k.webp", color: false },
  moon: { cheia: "lua-1k.jpg", leve: "lua-1k.jpg", color: true },
  milkyWay: { cheia: "via-lactea-2k.jpg", leve: "via-lactea-1k.jpg", color: true },
} as const;

export type SkyTextureName = keyof typeof FILES;

const cache = new Map<string, THREE.Texture>();

async function decode(url: string): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    const blob = await (await fetch(url)).blob();
    return createImageBitmap(blob, { imageOrientation: "flipY", premultiplyAlpha: "none", colorSpaceConversion: "none" });
  }
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  await img.decode();
  return img;
}

export function skyTexture(name: SkyTextureName, tier: SkyTier): THREE.Texture {
  const f = FILES[name];
  const url = `/space/${f[tier]}`;
  let tex = cache.get(url);
  if (tex) return tex;
  tex = new THREE.Texture();
  tex.colorSpace = f.color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = name === "day" || name === "clouds" ? 4 : 1;
  cache.set(url, tex);
  const t = tex;
  decode(url)
    .then((img) => {
      t.image = img;
      // ImageBitmap já vem virada (imageOrientation); a <img> do plano B, não.
      t.flipY = !(typeof ImageBitmap !== "undefined" && img instanceof ImageBitmap);
      t.needsUpdate = true;
    })
    .catch((e: unknown) => console.warn(`[céu] textura ${url} não carregou`, e));
  return tex;
}
