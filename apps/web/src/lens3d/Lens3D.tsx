import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PerformanceMonitor } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { LookPost } from "../scene/look/LookPost.tsx";
import * as THREE from "three";
import { SPACE } from "../world/theme.ts";
import { WorldScene } from "../scene/WorldScene.tsx";
import { wallUniforms } from "../scene/walls.ts";
import { CameraRig } from "./CameraRig.tsx";
import { setWallView } from "../scene/wallFacing.ts";
import { MIN_AUTO_DPR, maxDpr, useQuality, type Quality } from "../scene/quality.ts";

/** Lente 3D: o escritório em terceira pessoa, paredes inteiras e vazadas em volta de você. */
export default function Lens3D() {
  const { t } = useTranslation();
  const quality = useQuality((s) => s.mode);
  const top = maxDpr(quality);
  const [dpr, setDpr] = useState(top);
  // Shaders compilados para este contexto (trocar a qualidade recria o contexto e compila de novo).
  const [readyFor, setReadyFor] = useState<Quality | null>(null);
  const ready = readyFor === quality;
  useEffect(() => setDpr(maxDpr(quality)), [quality]);
  useEffect(() => {
    wallUniforms.uCut.value = 100;
    wallUniforms.uSee.value = 1;
    setWallView(null);
  }, []);

  return (
    <div className="absolute inset-0" aria-label="Escritório em 3D" role="application" data-ready={ready ? "true" : "false"}>
      <Canvas
        // Trocar o modo recria o contexto (a suavização de bordas só é definida na criação).
        key={quality}
        dpr={dpr}
        gl={{ antialias: quality !== "leve", powerPreference: "high-performance" }}
        camera={{ fov: 50, near: 0.1, far: 3000, position: [0, 8, 14] }}
        onCreated={({ gl, scene }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.0;
          // Conferir erros de shader obriga o navegador a esperar cada compilação: só em desenvolvimento.
          gl.debug.checkShaderErrors = import.meta.env.DEV;
          scene.background = new THREE.Color(SPACE);
        }}
      >
        {quality === "auto" && (
          // Escada automática: se os quadros por segundo caem, baixa a resolução; se sobram, sobe.
          <PerformanceMonitor
            factor={1}
            step={0.2}
            ms={200}
            flipflops={4}
            onChange={({ factor }) => setDpr(Math.round((MIN_AUTO_DPR + (top - MIN_AUTO_DPR) * factor) * 10) / 10)}
            onFallback={() => setDpr(MIN_AUTO_DPR)}
          />
        )}
        <WorldScene lens="3d" />
        <CameraRig />
        <LookPost lens="3d" />
        <WarmUp onReady={() => setReadyFor(quality)} />
      </Canvas>
      {!ready && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-deep" role="status">
          <div className="flex flex-col items-center gap-4">
            <img src="/brand/sparkle.svg" alt="" width={44} height={44} className="animate-pulse" />
            <p className="text-sm text-slate">{t("loading.world3d")}</p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Compila os shaders da cena antes do primeiro quadro. Com `KHR_parallel_shader_compile` (Chrome e
 * Edge no Windows, por exemplo) a compilação roda nas threads do driver: a página, o chat e a voz
 * seguem respondendo enquanto o 3D se prepara, em vez de congelar por alguns segundos na troca de lente.
 */
function WarmUp({ onReady }: { onReady: () => void }) {
  const get = useThree((s) => s.get);
  const ready = useRef(onReady);
  ready.current = onReady;
  useLayoutEffect(() => {
    const { gl, scene, camera, setFrameloop } = get();
    let finished = false;
    setFrameloop("never");
    const done = () => {
      if (finished) return;
      finished = true;
      // Se o freio de segundo plano já mudou o modo nesse meio-tempo, ele vale.
      if (get().frameloop === "never") get().setFrameloop("always");
      get().invalidate();
      ready.current();
    };
    // Um quadro de folga para o que monta logo depois (texturas, textos) entrar na cena.
    const raf = requestAnimationFrame(() => {
      gl.compileAsync(scene, camera).then(done, done);
    });
    // Rede de segurança: nunca segura o 3D por mais de 8 s.
    const timer = window.setTimeout(done, 8000);
    return () => {
      finished = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [get]);
  return null;
}
