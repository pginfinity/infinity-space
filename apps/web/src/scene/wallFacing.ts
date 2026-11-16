import * as THREE from "three";
import { create } from "zustand";
import { CATALOG, dirOfYaw, type Vec2 } from "@infinity/world";
import { world } from "../world/world.ts";
import { mountedFurniture } from "./furniture/index.ts";

/**
 * Objetos de parede no 2D. As paredes do 2D são cortadas a 1 m; um quadro ou TV virado para longe
 * da câmera ficaria flutuando de costas. Como nos jogos isométricos, só as paredes "do fundo"
 * mostram objetos: os virados para longe somem (junto com o que as atividades desenham neles)
 * e voltam quando a câmera gira (Q/R). No 3D tudo aparece.
 */

interface WallFacingState {
  hidden: ReadonlySet<string>;
}

export const useWallFacing = create<WallFacingState>(() => ({ hidden: new Set() }));

const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);
let view: Vec2 | null = null;
let applied = new Set<string>();

/** Direção (x, z) de onde a câmera do 2D olha; null no 3D (tudo visível). */
export function setWallView(toCamera: Vec2 | null): void {
  view = toCamera;
  apply();
}

/** Reaplica (quando os móveis acabam de ser montados). */
export function reapplyWallView(): void {
  applied = new Set();
  apply();
}

/** O objeto de parede está escondido agora? (para atividades que desenham sobre ele) */
export function wallHidden(objectId: string): boolean {
  return useWallFacing.getState().hidden.has(objectId);
}

/** Hook: o objeto de parede aparece agora? */
export function useWallVisible(objectId: string | undefined): boolean {
  return useWallFacing((s) => !objectId || !s.hidden.has(objectId));
}

let wallObjects: Array<{ id: string; rot: number }> | null = null;
let wallIds: Set<string> | null = null;

function apply(): void {
  if (!wallObjects) {
    wallObjects = world().map.objects.filter((o) => CATALOG[o.type]?.wallMounted).map((o) => ({ id: o.id, rot: o.rot }));
    wallIds = new Set(wallObjects.map((o) => o.id));
  }
  const hidden = new Set<string>();
  if (view) {
    for (const o of wallObjects) {
      const f = dirOfYaw(o.rot);
      if (f.x * view.x + f.z * view.z < 0) hidden.add(o.id);
    }
  }
  const build = mountedFurniture().build;
  if (build) {
    for (const id of new Set([...applied, ...hidden])) build.setInstance(id, { shape: hidden.has(id) ? HIDE : null });
    // Partes fora do instancing (telas das TVs, texto dos neons).
    build.group.traverse((m) => {
      const id = m.userData.objectId as string | undefined;
      if (id && wallIds!.has(id)) m.visible = !hidden.has(id);
    });
    applied = hidden;
  }
  useWallFacing.setState({ hidden });
}
