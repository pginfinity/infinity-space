import { SKY_GLSL } from "./camera.ts";

/**
 * Shaders do céu. Todos projetam com `skyClip` (camera.ts), escrevem cor pré-multiplicada e passam pelo
 * mesmo tone mapping e espaço de cor da cena. Unidades: raio da Terra = 1, estação na origem.
 */

const OUT = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;

// ---- Via Láctea (fundo) -----------------------------------------------------------------------

export const milkyWayVert = /* glsl */ `
${SKY_GLSL}
varying vec3 vDir;
void main() { vDir = position; gl_Position = skyClip(position); }
`;

export const milkyWayFrag = /* glsl */ `
uniform sampler2D uMap;
uniform mat3 uToEqj;
uniform float uGain;
varying vec3 vDir;
void main() {
  vec3 e = uToEqj * normalize(vDir);
  // Mapa da NASA SVS em RA/Dec: RA 0h no centro, crescendo para a esquerda.
  float ra = atan(e.y, e.x);
  vec2 uv = vec2(fract(0.5 - ra / 6.28318531), asin(clamp(e.z, -1.0, 1.0)) / 3.14159265 + 0.5);
  gl_FragColor = vec4(texture2D(uMap, uv).rgb * uGain, 1.0);
  ${OUT}
}
`;

// ---- estrelas e planetas (pontos) ----------------------------------------------------------------

export const pointsVert = /* glsl */ `
${SKY_GLSL}
uniform mat3 uRot;
uniform float uPx;
uniform float uGain;
uniform float uSizeK;
attribute float aMag;
attribute vec3 aColor;
varying vec3 vColor;
void main() {
  gl_Position = skyClip(uRot * position);
  // Fluxo relativo à magnitude 2; o tamanho cresce devagar e o brilho carrega o resto.
  float flux = pow(10.0, -0.4 * (aMag - 2.0));
  float size = clamp(1.2 + (3.5 - aMag) * 0.7, 1.0, 5.0) * uSizeK;
  gl_PointSize = max(1.0, size * uPx);
  vColor = aColor * clamp(0.16 + 0.9 * sqrt(flux), 0.0, 3.0) * uGain;
}
`;

export const pointsFrag = /* glsl */ `
varying vec3 vColor;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float a = exp(-dot(q, q) * 2.0);
  gl_FragColor = vec4(vColor * a, 0.0);
  ${OUT}
}
`;

// ---- Sol (disco e brilho) -----------------------------------------------------------------------

export const billboardVert = /* glsl */ `
${SKY_GLSL}
uniform vec3 uDir;
uniform vec3 uRight;
uniform vec3 uUp;
uniform float uSize;
varying vec2 vQ;
void main() {
  vQ = position.xy;
  gl_Position = skyClip(uDir + (position.x * uRight + position.y * uUp) * uSize);
}
`;

export const sunFrag = /* glsl */ `
uniform float uHalfDeg;
uniform float uDiscDeg;
uniform vec3 uTint;
uniform float uGlow;
varying vec2 vQ;
void main() {
  float r = length(vQ);
  float ang = r * uHalfDeg;
  float aa = uHalfDeg * fwidth(r);
  float disc = 1.0 - smoothstep(uDiscDeg - aa, uDiscDeg + aa, ang);
  float glow = exp(-ang * 0.55) * 0.35 + exp(-ang * 3.0) * 1.1 + 0.02 / (ang * ang + 0.04);
  vec3 c = uTint * (disc * 12.0 + glow * uGlow) * (1.0 - smoothstep(0.75, 1.0, r));
  gl_FragColor = vec4(c, 0.0);
  ${OUT}
}
`;

// ---- Lua (esfera desenhada no plano, com a fase pela geometria) ----------------------------------

export const moonFrag = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uDir;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uSun;
uniform vec3 uGeo;
uniform float uEarthshine;
varying vec2 vQ;
void main() {
  float r2 = dot(vQ, vQ);
  float fw = fwidth(r2);
  float alpha = 1.0 - smoothstep(1.0 - fw, 1.0 + fw, r2);
  if (alpha <= 0.0) discard;
  float z = sqrt(max(0.0, 1.0 - r2));
  // Normal no referencial da cena (de frente para a estação).
  vec3 n = vQ.x * uRight + vQ.y * uUp - z * uDir;
  // Lado visível: longitude 0 no centro, leste selenográfico à direita (oeste do céu), norte para cima.
  vec2 uv = vec2(atan(vQ.x, z) / 6.28318531 + 0.5, asin(clamp(vQ.y, -1.0, 1.0)) / 3.14159265 + 0.5);
  vec3 alb = texture2D(uMap, uv).rgb;
  // Lommel-Seeliger: a lua cheia não escurece na borda.
  float mu0 = max(dot(n, uSun), 0.0);
  float lit = 2.0 * mu0 / (mu0 + z + 1e-3);
  // Sombra da Terra (eclipse lunar): ponto da superfície em raios terrestres, eixo da sombra = anti-Sol.
  vec3 P = uGeo + n * 0.2727;
  vec3 axis = -uSun;
  float t = dot(P, axis);
  float dist = length(P - axis * t);
  float ru = 1.0128 - t * 0.004613;
  float rp = 1.0128 + t * 0.004698;
  float pen = t > 0.0 ? clamp((dist - ru) / (rp - ru), 0.0, 1.0) : 1.0;
  float umbra = t > 0.0 ? 1.0 - smoothstep(ru - 0.012, ru + 0.012, dist) : 0.0;
  vec3 direct = alb * lit * 1.35 * pen;
  // Na umbra, só a luz avermelhada que a atmosfera da Terra desvia (mais clara perto da borda).
  vec3 blood = alb * vec3(0.7, 0.24, 0.09) * (0.3 + 0.45 * smoothstep(0.2, 1.0, dist / ru)) * umbra;
  vec3 c = direct * (1.0 - umbra) + blood + alb * uEarthshine;
  gl_FragColor = vec4(c * alpha, alpha);
  ${OUT}
}
`;

// ---- meteoros (fitas na tela, mais largas e brilhantes na cabeça) --------------------------------

export const meteorVert = /* glsl */ `
${SKY_GLSL}
uniform vec2 uRes;
uniform float uPx;
attribute vec3 aTail;
attribute vec3 aHead;
attribute float aSide;
attribute float aEnd;
attribute vec4 aColor;
varying float vEnd;
varying float vSide;
varying vec4 vColor;
void main() {
  vec4 ct = skyClip(aTail);
  vec4 ch = skyClip(aHead);
  vEnd = aEnd; vSide = aSide; vColor = aColor;
  if (ct.w <= 0.0 || ch.w <= 0.0 || aColor.a <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec2 d = (ch.xy / ch.w - ct.xy / ct.w) * uRes;
  float len = length(d);
  vec2 nrm = len > 1e-4 ? vec2(-d.y, d.x) / len : vec2(0.0, 1.0);
  float w = mix(0.5, 1.6, aEnd) * max(uPx, 0.75);
  vec4 c = aEnd > 0.5 ? ch : ct;
  c.xy += nrm * aSide * w / uRes * 2.0 * c.w;
  gl_Position = c;
}
`;

export const meteorFrag = /* glsl */ `
varying float vEnd;
varying float vSide;
varying vec4 vColor;
void main() {
  float a = vColor.a * pow(vEnd, 1.6) * (1.0 - vSide * vSide);
  vec3 c = mix(vColor.rgb, vec3(1.0), smoothstep(0.85, 1.0, vEnd));
  gl_FragColor = vec4(c * a, 0.0);
  ${OUT}
}
`;

// ---- Terra, nuvens e atmosfera (um passe: casca da atmosfera, raio contra a esfera por pixel) -----

export const earthVert = /* glsl */ `
${SKY_GLSL}
uniform float uDist;
uniform float uShell;
varying vec3 vPos;
void main() {
  vPos = position * uShell + vec3(0.0, -uDist, 0.0);
  gl_Position = skyClip(vPos);
}
`;

export const earthFrag = /* glsl */ `
uniform sampler2D uDay;
uniform sampler2D uNight;
uniform sampler2D uClouds;
uniform vec3 uSun;
uniform mat3 uToEcef;
uniform float uDist;
uniform float uCloud;  // deriva das nuvens para leste (fração da volta)
uniform float uMoonLight;
uniform float uExposure;
varying vec3 vPos;

float clouds(vec2 uv) {
  // A textura repete na longitude: a deriva dá a volta sem emenda.
  return texture2D(uClouds, uv - vec2(uCloud, 0.0)).r;
}

void main() {
  vec3 rd = normalize(vPos);
  vec3 oc = vec3(0.0, uDist, 0.0);           // estação − centro da Terra
  float b = dot(oc, rd);
  float dmin = sqrt(max(dot(oc, oc) - b * b, 0.0)); // menor distância do raio ao centro
  float fw = max(fwidth(dmin), 1e-5);
  float cover = (b < 0.0) ? clamp((1.0 - dmin) / fw + 0.5, 0.0, 1.0) : 0.0;

  // Brilho da atmosfera acima da borda (raios que passam rente à Terra).
  vec3 pc = oc + rd * (-b);
  vec3 nc = pc / max(dmin, 1e-4);
  float s = dot(nc, uSun);
  float hgt = max(dmin - 1.0, 0.0);
  float g = exp(-hgt / 0.0065) * step(b, 0.0);
  vec3 glow = vec3(0.28, 0.55, 1.0) * smoothstep(-0.28, 0.3, s) * 1.25
            + vec3(1.0, 0.42, 0.16) * exp(-pow(s / 0.13, 2.0)) * 0.9;
  glow *= g * (1.0 + 2.5 * pow(max(dot(rd, uSun), 0.0), 24.0));

  vec3 surf = vec3(0.0);
  if (cover > 0.0) {
    float h = b * b - dot(oc, oc) + 1.0;
    float t = -b - sqrt(max(h, 0.0));
    vec3 N = normalize(rd * t + oc);
    vec3 e = uToEcef * N;
    vec2 uv = vec2(atan(e.y, e.x) / 6.28318531 + 0.5, asin(clamp(e.z, -1.0, 1.0)) / 3.14159265 + 0.5);
    vec3 day = texture2D(uDay, uv).rgb;
    float cl = clouds(uv);
    float mu = dot(N, uSun);
    float lamb = max(mu, 0.0);
    vec3 V = -rd;
    float nv = max(dot(N, V), 0.0);
    // Luz do dia (com um quê de crepúsculo avermelhado perto do terminador).
    vec3 tw = mix(vec3(1.0, 0.5, 0.3), vec3(1.0), smoothstep(0.0, 0.3, mu));
    vec3 col = day * (1.2 * lamb) * tw;
#ifndef LEVE
    // Reflexo do Sol no mar.
    float ocean = smoothstep(0.004, 0.02, day.b - max(day.r, day.g)) * (1.0 - cl);
    vec3 H = normalize(uSun + V);
    float nh = max(dot(N, H), 0.0);
    col += vec3(1.0, 0.9, 0.75) * (pow(nh, 140.0) * 1.4 + pow(nh, 18.0) * 0.05) * ocean * smoothstep(0.0, 0.1, mu);
#endif
    vec3 cloudCol = vec3(0.86) * (1.15 * lamb) * tw;
    col = mix(col, cloudCol, cl * 0.9);
    // Noite: luzes das cidades (veladas pelas nuvens) e um pouco de luar.
    float night = 1.0 - smoothstep(-0.12, 0.03, mu);
    float lights = texture2D(uNight, uv).r;
    // (as luzes são emissivas: não passam pela exposição, que só escurece a luz refletida)
    vec3 city = vec3(1.0, 0.68, 0.34) * pow(lights, 2.0) * 1.9 * night * (1.0 - cl * 0.75);
    col += (day * 0.6 + vec3(cl) * 0.5) * uMoonLight * night;
    // Atmosfera vista de cima: mais densa perto da borda, azul no dia, avermelhada no terminador.
    float haze = pow(1.0 - nv, 2.6);
    vec3 atmo = vec3(0.3, 0.56, 1.0) * (0.04 + 0.95 * smoothstep(-0.2, 0.4, mu))
              + vec3(1.0, 0.45, 0.2) * exp(-pow(mu / 0.12, 2.0)) * 0.5;
    col = col * (1.0 - haze * 0.55) + atmo * haze * 0.9 + vec3(0.02, 0.04, 0.09) * (1.0 - nv) * smoothstep(-0.2, 0.3, mu) * 0.4;
    surf = col * uExposure + city * (1.0 - haze * 0.55);
  }
  gl_FragColor = vec4(surf * cover + glow * (1.0 - cover), cover);
  ${OUT}
}
`;
