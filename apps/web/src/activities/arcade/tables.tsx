import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { GAME_OF_TABLE, type MapObject } from "@infinity/world";
import { world } from "../../world/world.ts";
import { objectMatrix } from "../../scene/furniture/index.ts";
import { liveTopPlane } from "../../scene/furniture/arcade.ts";
import { boardTexture } from "../../games/boardTextures.ts";

/**
 * Tabuleiro ao vivo no tampo das mesas de jogo (xadrez, Lig 4, jogo da velha): quem passa vê a
 * partida nas duas lentes. Os móveis são instanciados, então cada mesa ganha um plano próprio
 * com a textura da partida (`boardTexture`, que se redesenha sozinha quando o estado muda).
 */
export function TableBoards() {
  const group = useMemo(() => buildBoards(world().map.objects), []);
  useEffect(() => () => group.dispose(), [group]);
  return <primitive object={group.root} />;
}

const _m = new THREE.Matrix4();

function buildBoards(objects: readonly MapObject[]): { root: THREE.Group; dispose(): void } {
  const root = new THREE.Group();
  root.name = "arcade:tabuleiros";
  const owned: Array<THREE.BufferGeometry | THREE.Material> = [];
  for (const o of objects) {
    if (!o.gameId || !(o.type in GAME_OF_TABLE)) continue;
    const plane = liveTopPlane(o.type);
    if (!plane) continue;
    const mat = new THREE.MeshBasicMaterial({
      map: boardTexture(o.gameId),
      toneMapped: false,
      // madeira e grade recebem um tom abaixo do branco para não parecerem telas; o acrílico brilha
      color: o.type === "tictactoe-table" ? 0xffffff : 0xe2e2e2,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    mat.name = `arcade:tampo:${o.gameId}`;
    owned.push(mat);
    const faces = plane.both ? [1, -1] : [1];
    for (const side of faces) {
      const geo = new THREE.PlaneGeometry(plane.w, plane.h);
      if (plane.crop) cropUv(geo, plane.crop, side < 0);
      owned.push(geo);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = `arcade:tampo:${o.gameId}`;
      if (plane.both) {
        // grade em pé: as duas faces, a de trás espelhada (como a grade de verdade vista por trás)
        _m.multiplyMatrices(objectMatrix(o), plane.m);
        if (side < 0) _m.multiply(new THREE.Matrix4().makeTranslation(0, 0, -plane.m.elements[14]! * 2)).multiply(new THREE.Matrix4().makeRotationY(Math.PI));
        _m.decompose(mesh.position, mesh.quaternion, mesh.scale);
      } else {
        // tampo deitado: a parte de baixo da imagem (brancas, xis) fica do lado do lugar 0
        const seat0 = objects.find((c) => c.gameId === o.gameId && c.gameSeat === 0);
        const yaw = seat0 ? Math.atan2(seat0.pos.x - o.pos.x, seat0.pos.z - o.pos.z) : o.rot;
        mesh.position.set(o.pos.x, plane.m.elements[13]!, o.pos.z);
        mesh.rotation.set(-Math.PI / 2, yaw, 0, "YXZ");
      }
      mesh.renderOrder = 1;
      root.add(mesh);
    }
  }
  return {
    root,
    dispose() {
      for (const x of owned) x.dispose();
      root.clear();
    },
  };
}

/** Recorta a textura no plano (u0, v0, u1, v1); `mirror` espelha na horizontal. */
function cropUv(geo: THREE.PlaneGeometry, [u0, v0, u1, v1]: [number, number, number, number], mirror: boolean): void {
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const u = mirror ? 1 - uv.getX(i) : uv.getX(i);
    uv.setXY(i, u0 + u * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  }
  uv.needsUpdate = true;
}
