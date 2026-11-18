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
      {import.meta.env.DEV && <DevProbe />}
    </>
  );
}

/** Só em desenvolvimento: expõe o renderizador para medir desempenho (chamadas de desenho, triângulos). */
function DevProbe() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  (window as unknown as { __infinityGl?: unknown; __infinityScene?: unknown }).__infinityGl = gl;
  (window as unknown as { __infinityScene?: unknown }).__infinityScene = scene;
  return null;
}

/**
 * O escritório fica aberto o dia todo: com a janela em segundo plano (outra janela em foco),
 * desenha a ~8 quadros por segundo em vez de 60, poupando CPU, placa de vídeo e bateria.
 * Voz, vídeo e movimento não dependem do desenho e seguem normais. Aba escondida já para sozinha.
 */
function BackgroundThrottle() {
  const setFrameloop = useThree((s) => s.setFrameloop);
  const invalidate = useThree((s) => s.invalidate);
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
    let timer = 0;
    const slow = () => {
      setFrameloop("demand");
      window.clearInterval(timer);
      timer = window.setInterval(() => invalidate(), 125);
    };
    const fast = () => {
      window.clearInterval(timer);
      setFrameloop("always");
    };
    window.addEventListener("blur", slow);
    window.addEventListener("focus", fast);
    return () => {
      window.removeEventListener("blur", slow);
      window.removeEventListener("focus", fast);
      fast();
    };
  }, [setFrameloop, invalidate]);
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

/** Distância da luz ao centro da estação (só define de onde a sombra é projetada). */
const LIGHT_DIST = 90;

/**
 * Luz principal do escritório: vem do Sol de verdade, visto da estação (astro/light.ts). Dourada quando o Sol
 * encosta na borda da Terra; na sombra da Terra some e ficam as luzes internas, mais quentes.
 * Sombras (se a lente ligou): o mapa é refeito quando o Sol anda e a cada meio segundo (móveis animados),
 * nunca a cada quadro. A luz nunca é desligada (só a intensidade vai a 0): mudar o número de luzes
 * recompilaria todos os materiais.
 *
 * Visual (look/looks.ts): multiplica a luz do Sol e o ambiente. De dia valem as cores de céu do visual;
 * na sombra da Terra voltam as cores quentes das luzes internas e o ambiente sobe, para o escritório
 * continuar claro o bastante para trabalhar. A resolução da sombra segue o modo de qualidade.
 */
const _skyLook = new THREE.Color();
const _groundLook = new THREE.Color();
function SunLights() {
  const key = useRef<THREE.DirectionalLight>(null);
  const sky = useRef<THREE.HemisphereLight>(null);
  const gl = useThree((s) => s.gl);
  const box = useMemo(stationBounds, []);
  const shadowSize = useQuality((s) => s.mode) === "alta" ? 4096 : 2048;
  const last = useRef({ version: -1, t: -Infinity, lit: true });

  useEffect(() => retainSky(), []);
  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    const k = key.current;
    if (k) {
      const cam = k.shadow.camera;
      cam.left = -box.r;
      cam.right = box.r;
      cam.top = box.r;
      cam.bottom = -box.r;
      cam.near = LIGHT_DIST - box.r - 10;
      cam.far = LIGHT_DIST + box.r + 10;
      cam.updateProjectionMatrix();
      k.target.position.set(box.x, 0, box.z);
      k.target.updateMatrixWorld();
    }
    return () => {
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl, box]);

  useFrame((state) => {
    const k = key.current;
    const h = sky.current;
    if (!k || !h) return;
    const st = last.current;
    const v = skyVersion();
    if (v !== st.version) {
      st.version = v;
      const l = officeLight(getSky());
      k.position.set(box.x + l.dir[0] * LIGHT_DIST, l.dir[1] * LIGHT_DIST, box.z + l.dir[2] * LIGHT_DIST);
      k.color.setRGB(l.color[0], l.color[1], l.color[2], THREE.SRGBColorSpace);
      k.intensity = l.intensity * LOOK.lights.key;
      h.color.setRGB(l.skyColor[0], l.skyColor[1], l.skyColor[2], THREE.SRGBColorSpace);
      h.groundColor.setRGB(l.groundColor[0], l.groundColor[1], l.groundColor[2], THREE.SRGBColorSpace);
      if (LOOK.lights.skyColor) h.color.lerp(_skyLook.set(LOOK.lights.skyColor), 0.7 * l.sun);
      if (LOOK.lights.groundColor) h.groundColor.lerp(_groundLook.set(LOOK.lights.groundColor), 0.7 * l.sun);
      // Na sombra da Terra as luzes internas seguram o lugar: o ambiente do visual sobe.
      h.intensity = l.sky * LOOK.lights.sky * (1 + (1 - l.sun) * (LOOK.lights.sky < 1 ? 3.2 : 0));
      st.lit = l.intensity > 0.01;
      gl.shadowMap.needsUpdate = true;
    }
    if (st.lit && gl.shadowMap.enabled && state.clock.elapsedTime - st.t > 0.5) {
      st.t = state.clock.elapsedTime;
      gl.shadowMap.needsUpdate = true;
    }
  });
  return (
    <>
      <hemisphereLight ref={sky} args={["#D8E8FF", "#2A3550", 1.15]} />
      <directionalLight ref={key} position={[28, 46, 22]} intensity={1.7} color="#FFF1DE" castShadow shadow-mapSize={[shadowSize, shadowSize]} shadow-bias={-0.0006} shadow-normalBias={0.04} />
    </>
  );
}
