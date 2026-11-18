/**
 * Estrelas do Yale Bright Star Catalog até a magnitude 5,5 (2.887 estrelas; `public/space/estrelas.bin`,
 * gerado por `scripts/ceu/estrelas.mjs`). Posições J2000 viram vetores unitários no equador J2000; a cor
 * vem do índice B-V (temperatura → cor de corpo negro, puxada para o branco como o olho vê).
 */

export interface StarData {
  count: number;
  position: Float32Array;
  mag: Float32Array;
  color: Float32Array;
  /** Quantas estrelas até esta magnitude (o arquivo vem da mais brilhante para a mais fraca). */
  countTo(mag: number): number;
}

let loading: Promise<StarData> | null = null;

export function loadStars(): Promise<StarData> {
  loading ??= fetch("/space/estrelas.bin")
    .then((r) => {
      if (!r.ok) throw new Error(`estrelas.bin: ${r.status}`);
      return r.arrayBuffer();
    })
    .then(decodeStars)
    .catch((e: unknown) => {
      console.warn("[céu] catálogo de estrelas não carregou", e);
      loading = null;
      return decodeStars(new ArrayBuffer(0));
    });
  return loading;
}

export function decodeStars(buf: ArrayBuffer): StarData {
  const view = new DataView(buf);
  const count = Math.floor(buf.byteLength / 6);
  const position = new Float32Array(count * 3);
  const mag = new Float32Array(count);
  const color = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const o = i * 6;
    const ra = (view.getUint16(o, true) / 65535) * Math.PI * 2;
    const dec = (view.getInt16(o + 2, true) / 32767) * (Math.PI / 2);
    position[i * 3] = Math.cos(dec) * Math.cos(ra);
    position[i * 3 + 1] = Math.cos(dec) * Math.sin(ra);
    position[i * 3 + 2] = Math.sin(dec);
    mag[i] = view.getUint8(o + 4) / 20 - 2;
    const [r, g, b] = bvToRgb(view.getUint8(o + 5) / 50 - 0.5);
    color[i * 3] = r;
    color[i * 3 + 1] = g;
    color[i * 3 + 2] = b;
  }
  return {
    count,
    position,
    mag,
    color,
    countTo(m: number) {
      let n = 0;
      while (n < count && mag[n]! <= m) n++;
      return n;
    },
  };
}

/** Índice de cor B-V → RGB linear (Ballesteros 2012 para a temperatura; aproximação de Helland para a cor). */
export function bvToRgb(bv: number): [number, number, number] {
  const b = Math.max(-0.4, Math.min(2.0, bv));
  const t = (4600 * (1 / (0.92 * b + 1.7) + 1 / (0.92 * b + 0.62))) / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const bl = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const c = [r, g, bl].map((x) => Math.max(0, Math.min(255, x)) / 255);
  const max = Math.max(c[0]!, c[1]!, c[2]!) || 1;
  // Metade do caminho para o branco: a olho nu as estrelas são quase brancas, com um toque de cor.
  return c.map((x) => Math.pow(0.5 + 0.5 * (x / max), 2.2)) as [number, number, number];
}
