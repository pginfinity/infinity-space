import * as THREE from "three";
import { BlendFunction, Effect, EffectAttribute } from "postprocessing";
import type { Grade } from "./looks.ts";

/**
 * Efeitos de imagem próprios das prévias de direção de arte (ver looks.ts):
 * - GradeEffect: paleta por faixa de matiz, papel (brancos viram creme), split toning, pretos levantados;
 * - InkEffect: contorno de quadrinho a partir da profundidade e das cores, com tons posterizados.
 * Rodam depois do tone mapping, em espaço de exibição (sRGB aproximado), e voltam para linear.
 */

const COLOR_FNS = /* glsl */ `
vec3 toDisplay(vec3 c){ return pow(max(c, 0.0), vec3(1.0/2.2)); }
vec3 toLinear(vec3 c){ return pow(max(c, 0.0), vec3(2.2)); }
vec3 rgb2hsv(vec3 c){
  vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
vec3 hsv2rgb(vec3 c){
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;

const MAX_BANDS = 4;

const gradeFragment = /* glsl */ `
uniform vec4 uBands[${MAX_BANDS}];
uniform int uBandCount;
uniform float uSaturation;
uniform float uContrast;
uniform float uBrightness;
uniform vec4 uShadows;
uniform vec4 uHighlights;
uniform float uLift;
uniform vec4 uPaper;
uniform float uProtect;
${COLOR_FNS}
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor){
  vec3 c = toDisplay(inputColor.rgb);
  vec3 orig = c;
  vec3 hsv = rgb2hsv(c);
  // Cores muito saturadas e claras o bastante (a estrela da marca, o laranja, neon) ficam de fora.
  float keep = uProtect * smoothstep(0.42, 0.8, hsv.y) * smoothstep(0.18, 0.45, hsv.z);
  // Papel: o que é quase branco (pouca saturação, claro) puxa para a cor do papel.
  float paper = uPaper.a * smoothstep(0.55, 0.95, hsv.z) * (1.0 - smoothstep(0.08, 0.3, hsv.y));
  // Faixas de matiz: desloca e (des)satura só a faixa, com borda suave.
  float h = hsv.x * 360.0;
  for (int i = 0; i < ${MAX_BANDS}; i++) {
    if (i >= uBandCount) break;
    vec4 b = uBands[i];
    float d = abs(mod(h - b.x + 540.0, 360.0) - 180.0);
    float w = (1.0 - smoothstep(b.y * 0.5, b.y, d)) * smoothstep(0.05, 0.2, hsv.y);
    h += b.z * w;
    hsv.y *= mix(1.0, b.w, w);
  }
  hsv.x = fract(h / 360.0);
  c = hsv2rgb(hsv);
  c = mix(c, uPaper.rgb * max(hsv.z, 0.6), paper);
  // Saturação, contraste e brilho.
  float l = luma(c);
  c = mix(vec3(l), c, uSaturation);
  c = (c - 0.5) * uContrast + 0.5 + uBrightness;
  // Split toning: sombras e luzes ganham uma tinta.
  l = luma(c);
  // (a tinta das sombras multiplica pela cor normalizada: muda o matiz sem escurecer)
  vec3 ts = uShadows.rgb / max(luma(uShadows.rgb), 0.01);
  c = mix(c, c * ts, uShadows.a * (1.0 - smoothstep(0.0, 0.55, l)));
  c = mix(c, mix(c, uHighlights.rgb, 0.5), uHighlights.a * smoothstep(0.45, 1.0, l));
  // Pretos levantados (filme desbotado).
  c = c * (1.0 - uLift) + uLift * vec3(0.5, 0.45, 0.4);
  c = mix(c, orig, keep);
  outputColor = vec4(toLinear(clamp(c, 0.0, 1.0)), inputColor.a);
}
`;

function rgba(spec: [string, number] | undefined): THREE.Vector4 {
  if (!spec) return new THREE.Vector4(1, 1, 1, 0);
  const c = new THREE.Color(spec[0]);
  return new THREE.Vector4(c.r, c.g, c.b, spec[1]);
}

/** Paleta e tratamento de cor de tela inteira. */
export class GradeEffect extends Effect {
  constructor(g: Grade) {
    const bands = Array.from({ length: MAX_BANDS }, (_, i) => {
      const b = g.bands?.[i];
      return b ? new THREE.Vector4(b.center, b.width, b.shift, b.sat) : new THREE.Vector4();
    });
    super("GradeEffect", gradeFragment, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, THREE.Uniform>([
        ["uBands", new THREE.Uniform(bands)],
        ["uBandCount", new THREE.Uniform(Math.min(MAX_BANDS, g.bands?.length ?? 0))],
        ["uSaturation", new THREE.Uniform(g.saturation ?? 1)],
        ["uContrast", new THREE.Uniform(g.contrast ?? 1)],
        ["uBrightness", new THREE.Uniform(g.brightness ?? 0)],
        ["uShadows", new THREE.Uniform(rgba(g.shadows))],
        ["uHighlights", new THREE.Uniform(rgba(g.highlights))],
        ["uLift", new THREE.Uniform(g.lift ?? 0)],
        ["uPaper", new THREE.Uniform(rgba(g.paper))],
        ["uProtect", new THREE.Uniform(g.protect ?? 0)],
      ]),
    });
  }
}

const inkFragment = /* glsl */ `
uniform vec3 uInk;
uniform float uStrength;
uniform float uLevels;
uniform vec2 uTexel;
${COLOR_FNS}
float viewDepth(vec2 p){
  float d = readDepth(p);
  return getViewZ(d);
}
void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor){
  // Contorno pela profundidade (silhuetas) e pelas cores (dobras, bordas de móveis).
  float z = viewDepth(uv);
  float zx = viewDepth(uv + vec2(uTexel.x, 0.0)) - viewDepth(uv - vec2(uTexel.x, 0.0));
  float zy = viewDepth(uv + vec2(0.0, uTexel.y)) - viewDepth(uv - vec2(0.0, uTexel.y));
  float depthEdge = smoothstep(0.04, 0.12, length(vec2(zx, zy)) / max(abs(z), 1.0) * 6.0);
  vec3 cx = toDisplay(texture2D(inputBuffer, uv + vec2(uTexel.x, 0.0)).rgb) - toDisplay(texture2D(inputBuffer, uv - vec2(uTexel.x, 0.0)).rgb);
  vec3 cy = toDisplay(texture2D(inputBuffer, uv + vec2(0.0, uTexel.y)).rgb) - toDisplay(texture2D(inputBuffer, uv - vec2(0.0, uTexel.y)).rgb);
  float colorEdge = smoothstep(0.18, 0.4, length(cx) + length(cy));
  float edge = max(depthEdge, colorEdge * 0.7) * uStrength;
  // Tons posterizados (como impressão em poucas cores), mantendo o matiz.
  vec3 c = toDisplay(inputColor.rgb);
  vec3 hsv = rgb2hsv(c);
  hsv.z = (floor(hsv.z * uLevels) + 0.5) / uLevels;
  c = mix(c, hsv2rgb(hsv), 0.7);
  c = mix(c, uInk, edge);
  outputColor = vec4(toLinear(c), inputColor.a);
}
`;

/** Contorno de tinta e posterização (ilustração). */
export class InkEffect extends Effect {
  constructor(opts: { color: string; strength: number; posterize: number }) {
    const ink = new THREE.Color(opts.color);
    super("InkEffect", inkFragment, {
      attributes: EffectAttribute.DEPTH,
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, THREE.Uniform>([
        ["uInk", new THREE.Uniform(new THREE.Vector3(ink.r, ink.g, ink.b))],
        ["uStrength", new THREE.Uniform(opts.strength)],
        ["uLevels", new THREE.Uniform(opts.posterize)],
        ["uTexel", new THREE.Uniform(new THREE.Vector2(1 / 1440, 1 / 900))],
      ]),
    });
  }

  override setSize(width: number, height: number): void {
    (this.uniforms.get("uTexel")!.value as THREE.Vector2).set(1 / Math.max(1, width), 1 / Math.max(1, height));
  }
}
