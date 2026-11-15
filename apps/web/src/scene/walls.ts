import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { WALL_THICKNESS, type MapDef, type Wall } from "@infinity/world";

/**
 * Paredes com a cor de cada sala em cada face, vidro, e janelas para o espaço no casco.
 *
 * Shader compartilhado por todas as paredes:
 * - corte de altura (`uCut`): no 2D isométrico as paredes ficam baixinhas para ver dentro das salas;
 * - parede vazada (`uSee`): no 3D, some em volta da linha câmera → avatar;
 * - sombra falsa na base, para tirar o aspecto chapado.
 */

export const wallUniforms = {
  uCut: { value: 100 },
  uSee: { value: 0 },
  uCam: { value: new THREE.Vector3() },
  uTarget: { value: new THREE.Vector3() },
  uRadius: { value: 1.9 },
};

export function patch(material: THREE.Material, key: string, baseShade: boolean): void {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, wallUniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWallW;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWallW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWallW;\nuniform float uCut;\nuniform float uSee;\nuniform vec3 uCam;\nuniform vec3 uTarget;\nuniform float uRadius;")
      .replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>
if (vWallW.y > uCut) discard;
if (uSee > 0.5) {
  vec3 seg = uTarget - uCam;
  float L2 = max(dot(seg, seg), 1e-4);
  float t = clamp(dot(vWallW - uCam, seg) / L2, 0.0, 1.0);
  float d = distance(vWallW, uCam + seg * t);
  float fade = (1.0 - smoothstep(uRadius * 0.55, uRadius, d)) * (1.0 - smoothstep(0.86, 0.96, t));
  float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  if (fade > n) discard;
}`,
      );
    if (baseShade) {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_fragment>",
        "#include <color_fragment>\ndiffuseColor.rgb *= mix(0.7, 1.0, smoothstep(0.0, 1.2, vWallW.y));",
      );
    }
  };
  material.customProgramCacheKey = () => `wall:${key}`;
}

/** Caixa alinhada ao segmento da parede, deslocada `offset` metros para a esquerda (normal (d.z, -d.x)). */
function box(w: Wall, height: number, thickness: number, baseY: number, offset: number, from = 0, to = 1): THREE.BufferGeometry {
  const dx = w.b.x - w.a.x;
  const dz = w.b.z - w.a.z;
  const len = Math.hypot(dx, dz);
  const nx = dz / len;
  const nz = -dx / len;
  const a = { x: w.a.x + dx * from, z: w.a.z + dz * from };
  const b = { x: w.a.x + dx * to, z: w.a.z + dz * to };
  const seg = len * (to - from);
  const g = new THREE.BoxGeometry(seg + thickness * 0.0, height, thickness);
  g.applyMatrix4(
    new THREE.Matrix4().compose(
      new THREE.Vector3((a.x + b.x) / 2 + nx * offset, baseY + height / 2, (a.z + b.z) / 2 + nz * offset),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.atan2(dz, dx), 0)),
      new THREE.Vector3(1, 1, 1),
    ),
  );
  return g.toNonIndexed();
}

export function buildWalls(map: MapDef): THREE.Group {
  const group = new THREE.Group();
  group.name = "walls";
  const T = WALL_THICKNESS;
  const byColor = new Map<string, THREE.BufferGeometry[]>();
  const glass: THREE.BufferGeometry[] = [];
  const frames: THREE.BufferGeometry[] = [];
  const add = (color: string, g: THREE.BufferGeometry) => {
    const list = byColor.get(color) ?? [];
    list.push(g);
    byColor.set(color, list);
  };

  for (const w of map.walls) {
    const [left, right] = w.colors ?? ["#E9E5DF", "#E9E5DF"];
    if (w.kind === "solid") {
      // Duas metades, uma com a cor de cada sala.
      add(left, box(w, w.height, T / 2, 0, T / 4));
      add(right, box(w, w.height, T / 2, 0, -T / 4));
      frames.push(box(w, 0.04, T + 0.02, w.height, 0));
    } else if (w.kind === "glass") {
      glass.push(box(w, w.height - 0.1, T * 0.4, 0.05, 0));
      frames.push(box(w, 0.06, T * 0.8, w.height - 0.06, 0), box(w, 0.06, T * 0.8, 0, 0));
    } else {
      // Janela do casco: peitoril, vidro com montantes e verga.
      const sill = 0.85;
      const top = w.height - 0.35;
      add(left, box(w, sill, T / 2, 0, T / 4));
      add(right, box(w, sill, T / 2, 0, -T / 4));
      add(left, box(w, w.height - top, T / 2, top, T / 4));
      add(right, box(w, w.height - top, T / 2, top, -T / 4));
      glass.push(box(w, top - sill, T * 0.3, sill, 0));
      const len = Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z);
      const n = Math.max(1, Math.round(len / 2.6));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const half = 0.05 / len;
        frames.push(box(w, top - sill, T * 0.7, sill, 0, Math.max(0, t - half), Math.min(1, t + half)));
      }
      frames.push(box(w, 0.05, T + 0.04, sill, 0));
    }
  }

  for (const [color, list] of byColor) {
    const merged = mergeGeometries(list, false);
    list.forEach((g) => g.dispose());
    if (!merged) continue;
    const m = new THREE.MeshToonMaterial({ color });
    patch(m, `solid:${color}`, true);
    const mesh = new THREE.Mesh(merged, m);
    mesh.name = `wall:${color}`;
    group.add(mesh);
  }
  const glassMerged = mergeGeometries(glass, false);
  if (glassMerged) {
    const m = new THREE.MeshBasicMaterial({ color: "#9FDCFF", transparent: true, opacity: 0.18, depthWrite: false });
    patch(m, "glass", false);
    const mesh = new THREE.Mesh(glassMerged, m);
    mesh.name = "glass";
    mesh.renderOrder = 2;
    group.add(mesh);
  }
  const frameMerged = mergeGeometries(frames, false);
  if (frameMerged) {
    const m = new THREE.MeshToonMaterial({ color: "#C9D2DE" });
    patch(m, "frame", false);
    const mesh = new THREE.Mesh(frameMerged, m);
    mesh.name = "frames";
    group.add(mesh);
  }
  glass.forEach((g) => g.dispose());
  frames.forEach((g) => g.dispose());
  return group;
}
