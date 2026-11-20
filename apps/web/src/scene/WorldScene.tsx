import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { getSky, retainSky, skyVersion } from "./astro/live.ts";
import { officeLight } from "./astro/light.ts";
import { world } from "../world/world.ts";
import type { Lens } from "@infinity/world";
import { Station } from "./Station.tsx";
import { Avatars } from "./Avatars.tsx";
import { Space } from "./Space.tsx";
import { ScreenTVs } from "./ScreenTVs.tsx";
import { HearingRing } from "./HearingRing.tsx";
import { ActivitiesScene } from "../activities/index.tsx";
import { LookRig } from "./look/LookRig.tsx";
import { LOOK } from "./look/looks.ts";
import { useQuality } from "./quality.ts";
import { perfFrame, perfStart } from "./perfWatch.ts";
import { IDLE_MS, frameInterval } from "./frameRate.ts";
import { currentEmote, remoteIds, sampleRemote, self, type Pose } from "../world/registry.ts";
import { useMedia } from "../media/rtc.ts";
import { patchShadowFade, SHADOW_FADE, snapToTexels, stepSize, viewFootprint, type Footprint } from "./sunShadow.ts";

/** O mundo: luzes, espaço, estação e pessoas. A lente só muda a câmera e o tratamento da imagem. */
export function WorldScene({ lens }: { lens: Lens }) {
  return (
    <>
      <SunLights />
      <directionalLight position={[-24, 18, -16]} intensity={0.35 * LOOK.lights.sky} color="#8FD0FF" />
      <ambientLight intensity={0.18 * LOOK.lights.ambient} />
      <LookRig />
      <Space lens={lens} />
      <Station lens={lens} />
      <Avatars />
      <ScreenTVs />
      <HearingRing />
      <ActivitiesScene lens={lens} />
      <BackgroundThrottle />
      <FrameWatch />
      {import.meta.env.DEV && <DevProbe />}
    </>
  );
}

/** Mede os primeiros segundos de desenho para sugerir o modo leve a quem precisa (ver perfWatch.ts). */
function FrameWatch() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const ctx = gl.getContext();
    const ext = ctx.getExtension("WEBGL_debug_renderer_info");
    perfStart(String(ctx.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : ctx.RENDERER) ?? ""));
  }, [gl]);
  useFrame((_, dt) => perfFrame(dt));
  return null;
}

/** Só em desenvolvimento: expõe o renderizador para medir desempenho (chamadas de desenho, triângulos). */
function DevProbe() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  (window as unknown as { __infinityGl?: unknown; __infinityScene?: unknown }).__infinityGl = gl;
  (window as unknown as { __infinityScene?: unknown }).__infinityScene = scene;
  return null;
}

/** Alguém andando ou fazendo um gesto: a cena precisa de todos os quadros. */
const probe: Pose = { x: 0, z: 0, yaw: 0, anim: "idle" };
function moving(): boolean {
  if (self.anim === "walk" || self.anim === "run") return true;
  const now = performance.now();
  for (const id of remoteIds()) {
    const p = sampleRemote(id, now, probe);
    if ((p && (p.anim === "walk" || p.anim === "run")) || currentEmote(id, now)) return true;
  }
  return false;
}

/**
 * Freio para o dia inteiro (ver frameRate.ts): menos quadros parado ou em segundo plano, poupando CPU,
 * placa de vídeo e bateria. Voz, vídeo e movimento não dependem do desenho e seguem normais.
 */
function BackgroundThrottle() {
  const setFrameloop = useThree((s) => s.setFrameloop);
  const invalidate = useThree((s) => s.invalidate);
  const get = useThree((s) => s.get);
  useEffect(() => {
    // Testes automatizados (desenvolvimento, Chrome sem placa de vídeo, várias janelas ao mesmo tempo):
    // a cena desenha a ~12 quadros por segundo e sobra CPU para a interface responder no tempo do teste.
    // O movimento tem laço próprio (engine/movement.ts) e não depende disto.
    if (import.meta.env.DEV && typeof navigator !== "undefined" && navigator.webdriver && !new URLSearchParams(location.search).has("quadros")) {
      setFrameloop("demand");
      const id = window.setInterval(() => invalidate(), 80);
      return () => {
        window.clearInterval(id);
        setFrameloop("always");
      };
    }
    let focused = document.hasFocus();
    let lastInput = performance.now();
    let current = 0;
    let timer = 0;
    const apply = () => {
      // Shaders ainda compilando (WarmUp, na lente 3D): desenhar agora travaria a página.
      if (get().frameloop === "never") return;
      const ms = frameInterval({ focused, idleFor: performance.now() - lastInput, moving: moving(), sharing: Object.keys(useMedia.getState().screens).length > 0 });
      if (ms === current) return;
      current = ms;
      window.clearInterval(timer);
      if (ms) {
        setFrameloop("demand");
        timer = window.setInterval(() => invalidate(), ms);
      } else setFrameloop("always");
    };
    const input = () => {
      lastInput = performance.now();
      if (current === IDLE_MS) apply();
    };
    const blur = () => {
      focused = false;
      apply();
    };
    const focus = () => {
      focused = true;
      input();
      apply();
    };
    const INPUT = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"] as const;
    for (const e of INPUT) window.addEventListener(e, input, { passive: true, capture: true });
    window.addEventListener("blur", blur);
    window.addEventListener("focus", focus);
    const check = window.setInterval(apply, 1000);
    return () => {
      for (const e of INPUT) window.removeEventListener(e, input, { capture: true });
      window.removeEventListener("blur", blur);
      window.removeEventListener("focus", focus);
      window.clearInterval(check);
      window.clearInterval(timer);
      setFrameloop("always");
    };
  }, [setFrameloop, invalidate, get]);
  return null;
}

/** Centro e raio da estação (para mirar a luz do Sol e enquadrar as sombras). */
function stationBounds(): { x: number; z: number; r: number } {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const f of world().map.floors) {
    for (const p of f.polygon) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
  }
  if (!Number.isFinite(minX)) return { x: 0, z: 0, r: 40 };
  return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, r: Math.hypot(maxX - minX, maxZ - minZ) / 2 + 3 };
}

/** Distância da luz ao centro do quadro de sombra (só define de onde a sombra é projetada). */
const LIGHT_DIST = 90;
/** No 3D, até onde (metros a partir da câmera) há sombra; além disso ela desvanece. */
const SHADOW_REACH = 32;
/** Folga do quadro em volta do que se vê, para a faixa onde a sombra desvanece ficar fora da tela. */
const FRAME_PAD = 1 / (1 - 2 * SHADOW_FADE) + 0.04;
/** Altura máxima de quem projeta sombra (paredes, escultura) e um pouco de margem, em metros. */
const CASTER_SPAN = 14;
/** Quanto a exposição sobe na sombra da Terra (fração da exposição do visual). */
const NIGHT_EXPOSURE = 0.45;
/** O rumo e a altura da luz andam em degraus de meio grau: menos recálculo de sombra e nada de tremer. */
const DIR_STEP = THREE.MathUtils.degToRad(0.5);

/**
 * Luz principal do escritório: vem do Sol de verdade, visto da estação (astro/light.ts). Dourada quando o Sol
 * encosta na borda da Terra; na sombra da Terra some e ficam as luzes internas, mais quentes.
 * A luz nunca é desligada (só a intensidade vai a 0): mudar o número de luzes recompilaria todos os materiais.
 *
 * Sombras (se a lente ligou): o quadro de sombra cobre só o que a câmera enxerga e é refeito a cada quadro,
 * acompanhando pessoas e móveis animados (ver sunShadow.ts). A resolução segue o modo de qualidade.
 *
 * Visual (look/looks.ts): multiplica a luz do Sol e o ambiente. De dia valem as cores de céu do visual;
 * na sombra da Terra voltam as cores quentes das luzes internas e o ambiente sobe, para o escritório
 * continuar claro o bastante para trabalhar.
 */
const _skyLook = new THREE.Color();
const _groundLook = new THREE.Color();
const _focus = new THREE.Vector3();
const _snapped = new THREE.Vector3();
patchShadowFade();
function SunLights() {
  const key = useRef<THREE.DirectionalLight>(null);
  const sky = useRef<THREE.HemisphereLight>(null);
  const gl = useThree((s) => s.gl);
  const box = useMemo(stationBounds, []);
  const mapSize = useQuality((s) => s.mode) === "alta" ? 4096 : 2048;
  const st = useRef({ version: -1, lit: true, dir: new THREE.Vector3(0, 1, 0), half: 0, foot: { x: 0, z: 0, r: 0 } as Footprint });

  useEffect(() => retainSky(), []);
  useEffect(() => {
    gl.shadowMap.autoUpdate = true;
    // Mudou a resolução (qualidade): o three só cria o mapa uma vez, então ele é descartado e refeito.
    const k = key.current;
    if (k?.shadow.map) {
      k.shadow.map.dispose();
      k.shadow.map = null;
    }
    st.current.half = 0;
  }, [gl, mapSize]);

  useFrame((state) => {
    const k = key.current;
    const h = sky.current;
    if (!k || !h) return;
    const s = st.current;
    const v = skyVersion();
    if (v !== s.version) {
      s.version = v;
      const l = officeLight(getSky());
      // Direção em degraus de meio grau (o Sol anda ~0,25° por minuto).
      const az = Math.round(Math.atan2(l.dir[0], l.dir[2]) / DIR_STEP) * DIR_STEP;
      const el = Math.round(Math.asin(THREE.MathUtils.clamp(l.dir[1], -1, 1)) / DIR_STEP) * DIR_STEP;
      s.dir.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
      k.color.setRGB(l.color[0], l.color[1], l.color[2], THREE.SRGBColorSpace);
      k.intensity = l.intensity * LOOK.lights.key;
      h.color.setRGB(l.skyColor[0], l.skyColor[1], l.skyColor[2], THREE.SRGBColorSpace);
      h.groundColor.setRGB(l.groundColor[0], l.groundColor[1], l.groundColor[2], THREE.SRGBColorSpace);
      if (LOOK.lights.skyColor) h.color.lerp(_skyLook.set(LOOK.lights.skyColor), 0.7 * l.sun);
      if (LOOK.lights.groundColor) h.groundColor.lerp(_groundLook.set(LOOK.lights.groundColor), 0.7 * l.sun);
      // Na sombra da Terra as luzes internas seguram o lugar: o ambiente do visual sobe e a exposição
      // também (como o olho se acostumando), senão as salas de piso escuro (Dev Lab, IA, auditório) somem.
      const dim = LOOK.lights.sky < 1 ? 1 - l.sun : 0;
      h.intensity = l.sky * LOOK.lights.sky * (1 + dim * 3.2);
      gl.toneMappingExposure = LOOK.exposure * (1 + dim * NIGHT_EXPOSURE);
      s.lit = l.intensity > 0.01;
    }
    // Na sombra da Terra não há sombra do Sol para desenhar: o mapa fica parado (desligar a sombra da
    // luz mudaria o número de sombras e recompilaria todos os materiais).
    k.shadow.autoUpdate = s.lit;

    // Quadro de sombra: o pedaço do chão que a câmera vê (no máximo a estação inteira).
    const foot = viewFootprint(state.camera, SHADOW_REACH, s.foot);
    let cx = foot.x;
    let cz = foot.z;
    let r = foot.r;
    if (r >= box.r) {
      cx = box.x;
      cz = box.z;
      r = box.r;
    }
    const half = stepSize(Math.max(6, r * FRAME_PAD), s.half);
    if (half !== s.half) {
      s.half = half;
      const cam = k.shadow.camera;
      cam.left = -half;
      cam.right = half;
      cam.top = half;
      cam.bottom = -half;
      // Profundidade: com o Sol na altura mínima, o chão na borda do quadro fica até half/tan(35°) ≈
      // 1,43 × half mais perto ou mais longe da luz; mais a altura de quem projeta.
      cam.near = LIGHT_DIST - half * 1.5 - CASTER_SPAN;
      cam.far = LIGHT_DIST + half * 1.5 + CASTER_SPAN;
      cam.updateProjectionMatrix();
      // Desvios contra "acne" na medida do texel (o quadro muda de tamanho, o texel junto).
      const texel = (2 * half) / mapSize;
      k.shadow.normalBias = Math.max(0.012, texel * 1.1);
      k.shadow.bias = -(texel * 0.6) / (cam.far - cam.near);
    }
    // Centro do quadro andando em passos de um texel, visto do Sol: a borda da sombra não tremula.
    snapToTexels(_focus.set(cx, 0, cz), s.dir, (2 * half) / mapSize, _snapped);
    k.target.position.copy(_snapped);
    k.target.updateMatrixWorld();
    k.position.copy(_snapped).addScaledVector(s.dir, LIGHT_DIST);
  });
  return (
    <>
      <hemisphereLight ref={sky} args={["#D8E8FF", "#2A3550", 1.15]} />
      <directionalLight ref={key} position={[28, 46, 22]} intensity={1.7} color="#FFF1DE" castShadow shadow-mapSize={[mapSize, mapSize]} shadow-radius={1.6} />
    </>
  );
}
