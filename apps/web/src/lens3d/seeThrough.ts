import * as THREE from "three";

/**
 * Paredes "vazadas": onde a parede corta a linha entre a câmera e o avatar, ela some com um
 * pontilhado suave (dithering), para a pessoa nunca ficar escondida atrás de uma parede.
 * O dithering evita os problemas de ordenação de transparência. Também escurece a base das
 * paredes, um falso oclusão ambiente que tira o aspecto chapado.
 */

export const seeThrough = {
  uCam: { value: new THREE.Vector3() },
  uTarget: { value: new THREE.Vector3() },
  uRadius: { value: 1.9 },
};

export function applySeeThrough(material: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial, opts: { baseShade?: boolean } = {}): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCam = seeThrough.uCam;
    shader.uniforms.uTarget = seeThrough.uTarget;
    shader.uniforms.uRadius = seeThrough.uRadius;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vSeeWorld;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSeeWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vSeeWorld;
uniform vec3 uCam;
uniform vec3 uTarget;
uniform float uRadius;`,
      )
      .replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>
{
  vec3 seg = uTarget - uCam;
  float L2 = max(dot(seg, seg), 1e-4);
  float t = clamp(dot(vSeeWorld - uCam, seg) / L2, 0.0, 1.0);
  float d = distance(vSeeWorld, uCam + seg * t);
  float fade = (1.0 - smoothstep(uRadius * 0.55, uRadius, d)) * (1.0 - smoothstep(0.86, 0.96, t));
  float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  if (fade > n) discard;
}`,
      );
    if (opts.baseShade) {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
diffuseColor.rgb *= mix(0.62, 1.0, smoothstep(0.0, 1.5, vSeeWorld.y));`,
      );
    }
  };
  material.customProgramCacheKey = () => `see-through:${opts.baseShade ? 1 : 0}`;
}
