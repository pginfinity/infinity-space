import * as THREE from "three";
import { dirOfYaw, type MapDef } from "@infinity/world";
import { patch } from "./walls.ts";

/** Placas luminosas acima das portas, com o nome da sala e a cor de destaque dela. */

function signTexture(text: string, accent: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 192;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0A1B33";
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = accent;
  g.fillRect(0, 0, 22, c.height);
  g.fillRect(0, c.height - 10, c.width, 10);
  g.fillStyle = "#F2F0EF";
  g.font = `700 ${text.length > 16 ? 70 : 84}px NORD, "Arial Black", sans-serif`;
  g.textBaseline = "middle";
  g.fillText(text.toUpperCase(), 64, c.height / 2 + 4, c.width - 96);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function buildSigns(map: MapDef): THREE.Group {
  const group = new THREE.Group();
  group.name = "signs";
  const plate = new THREE.BoxGeometry(1.9, 0.36, 0.06);
  for (const s of map.signs) {
    const tex = signTexture(s.text, s.accent);
    const front = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    const side = new THREE.MeshBasicMaterial({ color: "#0A1B33" });
    // Placas também se dissolvem quando ficam entre a câmera e você.
    patch(front, "sign-front", false);
    patch(side, "sign-side", false);
    // A face +Z da caixa recebe a textura.
    const mesh = new THREE.Mesh(plate, [side, side, side, side, front, side]);
    const f = dirOfYaw(s.yaw);
    mesh.position.set(s.pos.x + f.x * 0.06, 2.42, s.pos.z + f.z * 0.06);
    mesh.rotation.y = Math.PI - s.yaw;
    mesh.name = `sign:${s.zoneId}`;
    group.add(mesh);
  }
  return group;
}
