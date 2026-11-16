import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import type { Lens } from "@infinity/world";
import { Station } from "./Station.tsx";
import { Avatars } from "./Avatars.tsx";
import { Space } from "./Space.tsx";
import { ScreenTVs } from "./ScreenTVs.tsx";
import { ActivitiesScene } from "../activities/index.tsx";

/** O mundo: luzes, espaço, estação e pessoas. A lente só muda a câmera e o tratamento da imagem. */
export function WorldScene({ lens }: { lens: Lens }) {
  return (
    <>
      <hemisphereLight args={["#D8E8FF", "#2A3550", 1.15]} />
      <directionalLight position={[28, 46, 22]} intensity={1.7} color="#FFF1DE" />
      <directionalLight position={[-24, 18, -16]} intensity={0.35} color="#8FD0FF" />
      <ambientLight intensity={0.18} />
      <Space />
      <Station lens={lens} />
      <Avatars />
      <ScreenTVs />
      <ActivitiesScene lens={lens} />
      <BackgroundThrottle />
      {import.meta.env.DEV && <DevProbe />}
    </>
  );
}

/** Só em desenvolvimento: expõe o renderizador para medir desempenho (chamadas de desenho, triângulos). */
function DevProbe() {
  const gl = useThree((s) => s.gl);
  (window as unknown as { __infinityGl?: unknown }).__infinityGl = gl;
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
