import * as THREE from "three";

/**
 * Sombras do Sol que acompanham o que você está vendo.
 *
 * Em vez de um mapa de sombra para a estação inteira (pouca definição: pernas e objetos finos sumiam),
 * o quadro de sombra cobre só o pedaço do chão que a câmera enxerga e é refeito a cada quadro: a
 * sombra anda junto com as pessoas e com os móveis animados. Para a imagem não "tremer" quando a
 * câmera anda, o quadro anda em passos de um texel do mapa e só muda de tamanho em degraus.
 * Na borda do quadro a sombra desvanece (patchShadowFade), então o limite não aparece como uma linha.
 */

/** Círculo no chão (metros). */
export interface Footprint {
  x: number;
  z: number;
  r: number;
}

// Cantos, meios das bordas e centro da tela (coordenadas normalizadas).
const SAMPLES: readonly (readonly [number, number])[] = [
  [-1, -1], [1, -1], [1, 1], [-1, 1],
  [0, -1], [0, 1], [-1, 0], [1, 0], [0, 0],
];
const _near = new THREE.Vector3();
const _ray = new THREE.Vector3();

/**
 * Pedaço do chão (y = 0) que a câmera enxerga, como um círculo. Na perspectiva, o que fica além de
 * `reach` metros da câmera (ou acima do horizonte) é cortado em `reach`: lá longe não há sombra.
 * Usa as matrizes da câmera como estão (as do último quadro desenhado).
 */
export function viewFootprint(camera: THREE.Camera, reach: number, out: Footprint): Footprint {
  const persp = (camera as THREE.PerspectiveCamera).isPerspectiveCamera === true;
  const e = camera.matrixWorld.elements;
  const cx = e[12]!;
  const cz = e[14]!;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  const pts: number[] = [];
  for (const [sx, sy] of SAMPLES) {
    _near.set(sx, sy, -1).unproject(camera);
    _ray.set(sx, sy, 1).unproject(camera).sub(_near);
    let px = NaN, pz = NaN;
    if (_ray.y < -1e-9) {
      const t = -_near.y / _ray.y;
      px = _near.x + _ray.x * t;
      pz = _near.z + _ray.z * t;
    }
    if (persp && !(Math.hypot(px - cx, pz - cz) <= reach)) {
      // Acima do horizonte ou longe demais: o ponto a `reach` metros, na direção do raio.
      const h = Math.hypot(_ray.x, _ray.z);
      if (h < 1e-9) continue;
      px = cx + (_ray.x / h) * reach;
      pz = cz + (_ray.z / h) * reach;
    }
    if (!Number.isFinite(px) || !Number.isFinite(pz)) continue;
    pts.push(px, pz);
    minX = Math.min(minX, px);
    maxX = Math.max(maxX, px);
    minZ = Math.min(minZ, pz);
    maxZ = Math.max(maxZ, pz);
  }
  if (pts.length === 0) {
    out.x = cx;
    out.z = cz;
    out.r = reach;
    return out;
  }
  out.x = (minX + maxX) / 2;
  out.z = (minZ + maxZ) / 2;
  let r = 0;
  for (let i = 0; i < pts.length; i += 2) r = Math.max(r, Math.hypot(pts[i]! - out.x, pts[i + 1]! - out.z));
  out.r = r;
  return out;
}

/**
 * Tamanho do quadro em degraus (~19% cada): só troca quando o pedaço visto passa do degrau atual ou
 * fica bem menor que ele. Assim a definição da sombra não muda a cada movimento de câmera.
 */
export function stepSize(r: number, current: number): number {
  const step = (v: number) => Math.pow(2, Math.ceil(Math.log2(Math.max(v, 1)) * 4) / 4);
  if (current > 0 && r <= current && r > current * 0.62) return current;
  return step(r);
}

const _m = new THREE.Matrix4();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/**
 * Centro do quadro encaixado na grade de texels do mapa de sombra, vista da luz. `dir` aponta para o
 * Sol (unitário); `texel` é o tamanho de um texel em metros. Mesma base que o three monta para a
 * câmera da sombra (lookAt com "para cima" = +y).
 */
export function snapToTexels(center: THREE.Vector3, dir: THREE.Vector3, texel: number, out: THREE.Vector3): THREE.Vector3 {
  _m.lookAt(dir, _origin, _up);
  _m.extractBasis(_x, _y, _z);
  const a = Math.round(center.dot(_x) / texel) * texel;
  const b = Math.round(center.dot(_y) / texel) * texel;
  const c = center.dot(_z);
  return out.set(0, 0, 0).addScaledVector(_x, a).addScaledVector(_y, b).addScaledVector(_z, c);
}

/** Largura (fração do quadro) da faixa onde a sombra desvanece, na borda. */
export const SHADOW_FADE = 0.08;

let patched = false;
/**
 * Faz a sombra desvanecer perto da borda do quadro de sombra (fora dele não há sombra). Mexe no
 * trecho de sombra do three uma vez, antes de qualquer material ser compilado. Só nas sombras de luz
 * direcional e spot (getShadow); a de luz pontual fica como está.
 */
export function patchShadowFade(): void {
  if (patched) return;
  patched = true;
  const chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
  const cut = chunk.indexOf("getPointShadow");
  const head = cut >= 0 ? chunk.slice(0, cut) : chunk;
  const tail = cut >= 0 ? chunk.slice(cut) : "";
  const done = head.replace(
    /return mix\( 1\.0, shadow, shadowIntensity \);/g,
    `vec2 shadowEdge = min( shadowCoord.xy, 1.0 - shadowCoord.xy );
			float shadowFade = smoothstep( 0.0, ${SHADOW_FADE.toFixed(3)}, min( shadowEdge.x, shadowEdge.y ) );
			return mix( 1.0, shadow, shadowIntensity * shadowFade );`,
  );
  if (done === head) {
    if (import.meta.env.DEV) console.warn("[sombras] trecho do three mudou: sem desvanecer na borda");
    return;
  }
  THREE.ShaderChunk.shadowmap_pars_fragment = done + tail;
}
