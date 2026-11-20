import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { SAO_PAULO, STATION_DIST, SUN_ANGULAR_RADIUS, type Sky as SkyState } from "../astro/astro.ts";
import { getSky, retainSky, skyVersion } from "../astro/live.ts";
import { skyNow } from "../astro/clock.ts";
import { SKY_PX, SKY_RES, SKY_VP, skyObject } from "./camera.ts";
import { skyTexture, type SkyTier } from "./textures.ts";
import { loadStars } from "./stars.ts";
import { MeteorLayer } from "./meteorLayer.ts";
import { SAT_SLOTS, satellitesAt } from "../astro/satellites.ts";
import { ConstellationLabels, constellationGeometry, loadConstellations, useConstellations } from "./constellations.ts";
import {
  billboardVert,
  earthFrag,
  earthVert,
  lineFrag,
  lineVert,
  meteorFrag,
  meteorVert,
  milkyWayFrag,
  milkyWayVert,
  moonFrag,
  pointsFrag,
  pointsVert,
  sunFrag,
} from "./shaders.ts";

/**
 * O céu de verdade em volta da estação: Via Láctea, estrelas do catálogo de Yale, planetas, Sol, Lua com
 * a fase real, meteoros das chuvas do calendário, satélites passando, constelações (liga/desliga) e a
 * Terra lá embaixo (São Paulo no nadir, dia e noite no horário real, luzes das cidades, nuvens e
 * atmosfera). Igual nas duas lentes e no telescópio.
 *
 * Desempenho: ~10 chamadas de desenho, nenhuma alocação por quadro. As contas astronômicas rodam a cada
 * 5 s (astro/live.ts); por quadro só meteoros e satélites (poucos, reaproveitados), o deslocamento das
 * nuvens e o relógio da cintilação.
 */

const ORDER = { milkyWay: -1000, constellations: -999.5, stars: -999, planets: -998, satellites: -997.5, sun: -997, moon: -996, meteors: -995, earth: -994 };
/** Tamanho aparente da Lua desenhada (raio, graus): ~4× o real para ser vista; direção e fase são as reais. */
const MOON_RADIUS = 1.1;
/** Meia largura do quadrado do Sol (graus): disco real + brilho em volta. */
const SUN_HALF = 16;
/** Nuvens: andam ~0,6° de longitude por hora para leste (~60 km/h em São Paulo); dão a volta em ~25 dias. */
const CLOUD_DEG_PER_HOUR = 0.6;

/** Terra fixa sob a estação: matriz cena (leste, cima, sul em São Paulo) → coordenadas da Terra (ECEF). */
function sceneToEcef(): THREE.Matrix3 {
  const lat = THREE.MathUtils.degToRad(SAO_PAULO.lat);
  const lon = THREE.MathUtils.degToRad(SAO_PAULO.lon);
  const east = new THREE.Vector3(-Math.sin(lon), Math.cos(lon), 0);
  const north = new THREE.Vector3(-Math.sin(lat) * Math.cos(lon), -Math.sin(lat) * Math.sin(lon), Math.cos(lat));
  const up = new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat));
  // colunas: leste, cima, −norte (o z da cena aponta para o sul)
  return new THREE.Matrix3().set(east.x, up.x, -north.x, east.y, up.y, -north.y, east.z, up.z, -north.z);
}

function shader(vertexShader: string, fragmentShader: string, uniforms: Record<string, THREE.IUniform>, extra: Partial<THREE.ShaderMaterialParameters> = {}) {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: { uSkyVP: SKY_VP, ...uniforms },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendEquation: THREE.AddEquation,
    ...extra,
  });
}

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

function setV(v: THREE.Vector3, a: readonly number[]): THREE.Vector3 {
  return v.set(a[0]!, a[1]!, a[2]!);
}

/** Base perpendicular a `dir` com `up` o mais perto possível de `ref` (para os planos do Sol e da Lua). */
function basis(dir: THREE.Vector3, ref: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3): void {
  up.copy(ref).addScaledVector(dir, -ref.dot(dir));
  if (up.lengthSq() < 1e-8) up.set(1, 0, 0).addScaledVector(dir, -dir.x);
  up.normalize();
  right.crossVectors(dir, up).normalize();
}

/** `host`: onde ficam os nomes das constelações (o elemento em volta do canvas). */
function buildSky(tier: SkyTier, exposure: number, host: HTMLElement | null) {
  const root = new THREE.Group();
  root.name = "ceu";
  const leve = tier === "leve";
  const disposables: Array<{ dispose(): void }> = [];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

  // Via Láctea: um cubo em volta da estação; a direção de cada pixel vira RA/Dec.
  const toEqj = new THREE.Matrix3();
  const mwMat = keep(shader(milkyWayVert, milkyWayFrag, { uMap: { value: skyTexture("milkyWay", tier) }, uToEqj: { value: toEqj }, uGain: { value: 0.5 } }, { side: THREE.BackSide }));
  const mw = skyObject(new THREE.Mesh(keep(new THREE.BoxGeometry(2, 2, 2)), mwMat), ORDER.milkyWay);
  root.add(mw);

  // Estrelas (catálogo em RA/Dec; giram com a matriz do céu).
  const eqj = new THREE.Matrix3();
  const starGain = { value: 1 };
  const time = { value: 0 };
  const starMat = keep(shader(pointsVert, pointsFrag, { uRot: { value: eqj }, uPx: SKY_PX, uGain: starGain, uSizeK: { value: 1 }, uTime: time }, leve ? {} : { defines: { TWINKLE: "" } }));
  const starGeo = keep(new THREE.BufferGeometry());
  const stars = skyObject(new THREE.Points(starGeo, starMat), ORDER.stars);
  root.add(stars);
  void loadStars().then((s) => {
    starGeo.setAttribute("position", new THREE.BufferAttribute(s.position, 3));
    starGeo.setAttribute("aMag", new THREE.BufferAttribute(s.mag, 1));
    starGeo.setAttribute("aColor", new THREE.BufferAttribute(s.color, 3));
    // No modo leve só até a magnitude 4,5 (~900 estrelas); as mais fracas quase não aparecem em meia resolução.
    starGeo.setDrawRange(0, leve ? s.countTo(4.5) : s.count);
  });

  // Planetas: pontos já no referencial da cena (atualizados a cada recálculo do céu).
  const planetGeo = keep(new THREE.BufferGeometry());
  const planetPos = new Float32Array(12);
  const planetMag = new Float32Array(4);
  const planetColor = new Float32Array([1, 0.97, 0.88, 1, 0.62, 0.42, 1, 0.94, 0.84, 1, 0.9, 0.7]);
  planetGeo.setAttribute("position", new THREE.BufferAttribute(planetPos, 3));
  planetGeo.setAttribute("aMag", new THREE.BufferAttribute(planetMag, 1));
  planetGeo.setAttribute("aColor", new THREE.BufferAttribute(planetColor, 3));
  const planetMat = keep(shader(pointsVert, pointsFrag, { uRot: { value: new THREE.Matrix3() }, uPx: SKY_PX, uGain: starGain, uSizeK: { value: 1.25 } }));
  root.add(skyObject(new THREE.Points(planetGeo, planetMat), ORDER.planets));

  // Satélites: pontos que cruzam devagar (mesmo material dos planetas, sem cintilar).
  const satGeo = keep(new THREE.BufferGeometry());
  const satPos = new Float32Array(SAT_SLOTS * 3);
  const satMag = new Float32Array(SAT_SLOTS);
  satGeo.setAttribute("position", new THREE.BufferAttribute(satPos, 3).setUsage(THREE.DynamicDrawUsage));
  satGeo.setAttribute("aMag", new THREE.BufferAttribute(satMag, 1).setUsage(THREE.DynamicDrawUsage));
  satGeo.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array(SAT_SLOTS * 3).fill(0.95), 3));
  satGeo.setDrawRange(0, 0);
  root.add(skyObject(new THREE.Points(satGeo, planetMat), ORDER.satellites));
  const sats: Array<{ dir: [number, number, number]; mag: number }> = [];
  let satDrawn = 0;

  // Constelações: linhas e nomes só quando ligadas (aparecem e somem devagar).
  const conU = { uRot: { value: eqj }, uAlpha: { value: 0 } };
  const conGeo = keep(new THREE.BufferGeometry());
  const conLines = skyObject(new THREE.LineSegments(conGeo, keep(shader(lineVert, lineFrag, conU))), ORDER.constellations);
  conLines.visible = false;
  root.add(conLines);
  let labels: ConstellationLabels | null = null;
  let disposed = false;
  // Também traz as estrelas com nome (clique no céu), por isso baixa mesmo com as linhas desligadas.
  loadConstellations()
    .then((d) => {
      if (disposed) return;
      const g = constellationGeometry(d);
      conGeo.setAttribute("position", new THREE.BufferAttribute(g.position, 3));
      if (!host) return;
      const l = new ConstellationLabels(host, g.centers);
      labels = l;
      // Depois de desenhar: a matriz do céu já é a deste quadro (os nomes não ficam um quadro atrás).
      conLines.onAfterRender = (gl) => l.place(eqj, gl.domElement.clientWidth, gl.domElement.clientHeight, conU.uAlpha.value);
    })
    .catch(() => {
      // sem o arquivo, o céu segue sem constelações nem estrelas clicáveis
    });

  // Sol.
  const quad = keep(new THREE.PlaneGeometry(2, 2));
  const sunU = {
    uDir: { value: new THREE.Vector3(0, 1, 0) },
    uRight: { value: new THREE.Vector3(1, 0, 0) },
    uUp: { value: new THREE.Vector3(0, 0, -1) },
    uSize: { value: Math.tan(THREE.MathUtils.degToRad(SUN_HALF)) },
    uHalfDeg: { value: SUN_HALF },
    uDiscDeg: { value: SUN_ANGULAR_RADIUS },
    uTint: { value: new THREE.Color(1, 0.96, 0.9) },
    uGlow: { value: 1 },
  };
  root.add(skyObject(new THREE.Mesh(quad, keep(shader(billboardVert, sunFrag, sunU))), ORDER.sun));

  // Lua.
  const moonU = {
    uMap: { value: skyTexture("moon", tier) },
    uDir: { value: new THREE.Vector3(0, 1, 0) },
    uRight: { value: new THREE.Vector3(1, 0, 0) },
    uUp: { value: new THREE.Vector3(0, 0, -1) },
    uSize: { value: Math.tan(THREE.MathUtils.degToRad(MOON_RADIUS)) },
    uSun: { value: new THREE.Vector3(0, 1, 0) },
    uGeo: { value: new THREE.Vector3(0, 60, 0) },
    uEarthshine: { value: 0.01 },
  };
  root.add(skyObject(new THREE.Mesh(quad, keep(shader(billboardVert, moonFrag, moonU))), ORDER.moon));

  // Meteoros.
  const meteors = new MeteorLayer();
  keep(meteors);
  // Dos dois lados: a fita é montada na tela e o sentido dos triângulos depende do rumo do meteoro.
  const meteorMat = keep(shader(meteorVert, meteorFrag, { uRes: SKY_RES, uPx: SKY_PX }, { side: THREE.DoubleSide }));
  root.add(skyObject(new THREE.Mesh(meteors.geometry, meteorMat), ORDER.meteors));

  // Terra + atmosfera: a casca da atmosfera é desenhada e cada pixel acerta (ou não) a esfera da Terra.
  const earthU = {
    uDay: { value: skyTexture("day", tier) },
    uNight: { value: skyTexture("night", tier) },
    uClouds: { value: skyTexture("clouds", tier) },
    uSun: { value: new THREE.Vector3(0, 1, 0) },
    uToEcef: { value: sceneToEcef() },
    uDist: { value: STATION_DIST },
    uShell: { value: 1.035 },
    uCloud: { value: 0 },
    uMoonLight: { value: 0 },
    uExposure: { value: exposure },
  };
  const earthMat = keep(shader(earthVert, earthFrag, earthU, leve ? { defines: { LEVE: "" } } : {}));
  const earthGeo = keep(new THREE.SphereGeometry(1, leve ? 64 : 96, leve ? 48 : 64));
  root.add(skyObject(new THREE.Mesh(earthGeo, earthMat), ORDER.earth));

  let seen = -1;
  const north = new THREE.Vector3();
  const sunDir = new THREE.Vector3();
  const moonDir = new THREE.Vector3();

  function applySky(s: SkyState) {
    const m = s.eqjToScene;
    eqj.set(m[0]!, m[1]!, m[2]!, m[3]!, m[4]!, m[5]!, m[6]!, m[7]!, m[8]!);
    toEqj.copy(eqj).transpose();
    setV(north, s.north);
    setV(sunDir, s.sun.dir);
    earthU.uSun.value.copy(sunDir);
    moonU.uSun.value.copy(sunDir);

    // Sol: plano virado para a estação; perto da borda da Terra a luz atravessa a atmosfera (mais laranja).
    sunU.uDir.value.copy(sunDir);
    basis(sunDir, north, sunU.uRight.value, sunU.uUp.value);
    const above = s.station.sunAboveLimb;
    const warm = THREE.MathUtils.clamp(1 - above / 6, 0, 1);
    sunU.uTint.value.setRGB(1, 0.96 - 0.3 * warm, 0.9 - 0.55 * warm);
    sunU.uGlow.value = THREE.MathUtils.smoothstep(above, -3, 0.5);

    // Lua: direção real; tamanho aumentado, menos perto do Sol (num eclipse solar ela cobre o Sol do tamanho certo).
    setV(moonDir, s.moon.dir);
    moonU.uDir.value.copy(moonDir);
    basis(moonDir, north, moonU.uRight.value, moonU.uUp.value);
    const sep = THREE.MathUtils.radToDeg(moonDir.angleTo(sunDir));
    const radius = THREE.MathUtils.lerp(s.moon.radius, MOON_RADIUS, THREE.MathUtils.smoothstep(sep, 3, 12));
    moonU.uSize.value = Math.tan(THREE.MathUtils.degToRad(radius));
    setV(moonU.uGeo.value, s.moon.geo);
    // Luz da Terra no lado escuro da Lua: forte perto da lua nova (a Terra vista de lá está quase "cheia").
    moonU.uEarthshine.value = 0.004 + 0.022 * (1 - s.moon.fraction);
    // Luar no lado noturno da Terra: só com a Lua acima do horizonte de lá (aproximado pelo da estação).
    earthU.uMoonLight.value = 0.035 * s.moon.fraction * THREE.MathUtils.smoothstep(moonDir.y, -0.6, 0.1);

    // Planetas.
    s.planets.forEach((p, i) => {
      planetPos.set(p.dir, i * 3);
      planetMag[i] = p.mag;
    });
    planetGeo.attributes.position!.needsUpdate = true;
    planetGeo.attributes.aMag!.needsUpdate = true;

    // Com a estação no Sol a "exposição" cai: estrelas e Via Láctea mais discretas.
    starGain.value = THREE.MathUtils.lerp(1, 0.55, s.station.light);
    mwMat.uniforms.uGain!.value = THREE.MathUtils.lerp(0.3, 0.13, s.station.light);
  }

  function update() {
    const v = skyVersion();
    const s = getSky();
    if (v !== seen) {
      seen = v;
      applySky(s);
    }
    const now = skyNow();
    // Nuvens: deriva contínua (o relógio é o mesmo para todos; fração da volta, sem perder precisão).
    earthU.uCloud.value = ((now / 3600_000) * (CLOUD_DEG_PER_HOUR / 360)) % 1;
    meteors.update(now, s, tmpA, tmpB);
    time.value = (performance.now() / 1000) % 1000;

    const n = satellitesAt(now, sats);
    for (let i = 0; i < n; i++) {
      satPos.set(sats[i]!.dir, i * 3);
      satMag[i] = sats[i]!.mag;
    }
    if (n > 0 || satDrawn > 0) {
      satDrawn = n;
      satGeo.setDrawRange(0, n);
      satGeo.attributes.position!.needsUpdate = true;
      satGeo.attributes.aMag!.needsUpdate = true;
    }

    const goal = useConstellations.getState().on ? 1 : 0;
    const a = conU.uAlpha.value;
    if (a !== goal) {
      conU.uAlpha.value = Math.abs(goal - a) < 0.02 ? goal : a + (goal - a) * 0.08;
      conLines.visible = conU.uAlpha.value > 0;
      if (!conLines.visible) labels?.hide();
    }
  }

  return {
    root,
    meteors,
    update,
    dispose() {
      disposed = true;
      labels?.dispose();
      for (const d of disposables) d.dispose();
    },
  };
}

/**
 * `exposure` escurece a superfície da Terra (o 2D usa menos: a Terra de dia é muito clara e não pode
 * competir com a estação nem com os textos do HUD).
 */
export function Sky({ tier, exposure = 1 }: { tier: SkyTier; exposure?: number }) {
  const host = useThree((s) => s.gl.domElement.parentElement);
  const sky = useMemo(() => buildSky(tier, exposure, host), [tier, exposure, host]);
  useEffect(() => {
    const release = retainSky();
    return () => {
      release();
      sky.dispose();
    };
  }, [sky]);
  useFrame(() => sky.update());
  // Só em desenvolvimento: o céu fica acessível para conferir pelo console e nos testes.
  if (import.meta.env.DEV) (window as unknown as { __infinitySky?: unknown }).__infinitySky = sky;
  return <primitive object={sky.root} />;
}
