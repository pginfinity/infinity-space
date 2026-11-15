import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useApp } from "../state/store.ts";
import { useMedia } from "../media/rtc.ts";
import { sampleRemote, self } from "../world/registry.ts";
import { screenMesh, tvFor } from "./tvs.ts";

/** Projeta cada tela compartilhada na TV da sala de quem compartilha (com aviso se a janela foi minimizada). */
export function ScreenTVs() {
  const screens = useMedia((s) => s.screens);
  const active = useRef(new Map<string, { mesh: THREE.Mesh; original: THREE.Material | THREE.Material[]; tex: THREE.VideoTexture; mat: THREE.MeshBasicMaterial; owner: string }>());
  const paused = useRef(new Map<string, THREE.MeshBasicMaterial>());

  useEffect(
    () => () => {
      for (const a of active.current.values()) {
        a.mesh.material = a.original;
        a.tex.dispose();
        a.mat.dispose();
      }
      active.current.clear();
    },
    [],
  );

  useFrame(() => {
    const selfId = useApp.getState().selfId;
    const players = useApp.getState().players;
    const want = new Map<string, string>(); // screenId -> dono
    for (const id of Object.keys(screens)) {
      const pos = id === selfId ? self : sampleRemote(id);
      const tv = pos ? tvFor(pos) : null;
      if (tv) want.set(tv.screenId, id);
    }
    // Solta TVs que não têm mais tela.
    for (const [screenId, a] of active.current) {
      if (want.get(screenId) !== a.owner || !screens[a.owner]) {
        a.mesh.material = a.original;
        a.tex.dispose();
        a.mat.dispose();
        active.current.delete(screenId);
      }
    }
    // Liga as novas.
    for (const [screenId, owner] of want) {
      const el = screens[owner];
      const mesh = screenMesh(screenId);
      if (!el || !mesh) continue;
      let a = active.current.get(screenId);
      if (!a) {
        const tex = new THREE.VideoTexture(el);
        tex.colorSpace = THREE.SRGBColorSpace;
        const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
        a = { mesh, original: mesh.material, tex, mat, owner };
        active.current.set(screenId, a);
        mesh.material = mat;
      }
      // Janela minimizada: TV mostra o aviso no lugar da imagem congelada.
      const isPaused = !!players[owner]?.screenPaused;
      mesh.material = isPaused ? pausedMaterial(paused.current, players[owner]?.name ?? "") : a.mat;
    }
  });

  return null;
}

function pausedMaterial(cache: Map<string, THREE.MeshBasicMaterial>, name: string): THREE.MeshBasicMaterial {
  let m = cache.get(name);
  if (m) return m;
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 576;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0A1B33";
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#F2F0EF";
  g.textAlign = "center";
  g.font = '600 46px Geist, sans-serif';
  g.fillText(`${name} minimizou a janela`, c.width / 2, c.height / 2 - 10);
  g.fillStyle = "#8A93A3";
  g.font = '400 32px Geist, sans-serif';
  g.fillText("A imagem volta assim que a janela for reaberta.", c.width / 2, c.height / 2 + 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  m = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  cache.set(name, m);
  return m;
}
