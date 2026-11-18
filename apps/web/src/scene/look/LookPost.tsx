import { useMemo, type ReactElement } from "react";
import { Bloom, ChromaticAberration, EffectComposer, N8AO, Noise, TiltShift2, ToneMapping, Vignette } from "@react-three/postprocessing";
import { BlendFunction, ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import type { Lens } from "@infinity/world";
import { GradeEffect, InkEffect } from "./effects.ts";
import { hasPost, LOOK } from "./looks.ts";
import { useQuality } from "../quality.ts";

/**
 * Tratamento de imagem da prévia de visual (ver looks.ts). Sem visual escolhido, não existe:
 * o desenho continua direto na tela, sem custo.
 *
 * Ordem: oclusão de ambiente → brilho → tone mapping → paleta → contorno → foco → aberração →
 * vinheta → grão. (Com a etapa extra, o tone mapping sai do renderizador e vem para cá.)
 *
 * Nitidez: com a etapa extra, o antisserrilhado do navegador não vale mais; no 3D a suavização de
 * bordas é feita aqui (MSAA 4x), menos no modo "leve". O 2D é pixel art: sem suavização, de propósito.
 * No modo "leve" a etapa inteira sai (o tone mapping volta para o renderizador): cada passada de
 * tela cheia custa caro em PC fraco. Fica a luz física e os materiais, sem gradação, brilho nem oclusão.
 */
export function LookPost({ lens }: { lens: Lens }) {
  const spec = lens === "2d" ? LOOK.post2d : LOOK.post3d;
  const grade = useMemo(() => (spec.grade ? new GradeEffect(spec.grade) : null), [spec]);
  const ink = useMemo(() => (spec.ink ? new InkEffect(spec.ink) : null), [spec]);
  const quality = useQuality((s) => s.mode);
  if (!hasPost(spec) || quality === "leve") return null;
  const light = false;

  const fx: ReactElement[] = [];
  if (spec.ao && lens === "3d" && !light) fx.push(<N8AO key="ao" aoRadius={spec.ao.radius} intensity={spec.ao.intensity} distanceFalloff={1} quality="medium" halfRes={quality !== "alta"} />);
  if (spec.bloom && !light) fx.push(<Bloom key="bloom" intensity={spec.bloom.intensity} luminanceThreshold={spec.bloom.threshold} luminanceSmoothing={0.2} radius={spec.bloom.radius ?? 0.6} mipmapBlur />);
  fx.push(<ToneMapping key="tm" mode={ToneMappingMode.ACES_FILMIC} />);
  if (grade) fx.push(<primitive key="grade" object={grade} />);
  if (ink) fx.push(<primitive key="ink" object={ink} />);
  if (spec.tiltShift && !light) {
    // Linha de foco horizontal no meio da tela; borra para cima e para baixo (maquete).
    fx.push(<TiltShift2 key="tilt" blur={spec.tiltShift.blur} taper={spec.tiltShift.focus} start={[0, 0.5]} end={[1, 0.5]} samples={10} direction={[1, 1]} />);
  }
  if (spec.chromatic && !light) fx.push(<ChromaticAberration key="ca" offset={new THREE.Vector2(spec.chromatic, spec.chromatic)} radialModulation={false} modulationOffset={0} />);
  if (spec.vignette) fx.push(<Vignette key="vig" offset={0.3} darkness={spec.vignette} />);
  if (spec.grain && !light) fx.push(<Noise key="grain" opacity={spec.grain} blendFunction={BlendFunction.OVERLAY} premultiply={false} />);

  return (
    <EffectComposer multisampling={lens === "3d" && !light ? 4 : 0} enableNormalPass={false}>
      {fx}
    </EffectComposer>
  );
}
