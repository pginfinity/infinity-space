import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useApp } from "../state/store.ts";
import { useMedia } from "../media/rtc.ts";
import { sampleRemote, self } from "../world/registry.ts";
import { screenMesh, tvFor } from "./tvs.ts";
import { world } from "../world/world.ts";

/** Projeta cada tela compartilhada na TV da sala de quem compartilha (com aviso se a janela foi minimizada). */
export function ScreenTVs() {
  const screens = useMedia((s) => s.screens);
  const active = useRef(new Map<string, { mesh: THREE.Mesh; original: THREE.Material | THREE.Material[]; tex: THREE.VideoTexture; mat: THREE.MeshBasicMaterial; owner: string }>());
  const paused = useRef(new Map<string, THREE.MeshBasicMaterial>());
  // TV parada: nome da sala e hora (Brasília), no lugar da tela genérica.
  const idle = useRef(new Map<string, IdleScreen>());
  const lastClock = useRef(-Infinity);

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

  useEffect(
    () => () => {
      for (const i of idle.current.values()) i.dispose();
      idle.current.clear();
    },
    [],
  );

  useFrame((state) => {
    // Telas de espera: criadas quando as TVs já existem; hora redesenhada a cada 30 s.
    if (!idle.current.size) {
      const { map, zones } = world();
      for (const o of map.objects) {
        if (o.type !== "tv" || !o.screenId) continue;
        const mesh = screenMesh(o.screenId);
        if (!mesh) continue;
        const room = (o.zoneId ? map.zones.find((z) => z.id === o.zoneId) : zones.zoneAt(o.pos))?.name ?? "Infinity Space";
        const scr = new IdleScreen(room);
        idle.current.set(o.screenId, scr);
        mesh.material = scr.material;
      }
    }
    if (state.clock.elapsedTime - lastClock.current > 30) {
      lastClock.current = state.clock.elapsedTime;
      for (const i of idle.current.values()) i.draw();
    }
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

const CLOCK = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const DAY = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long" });

/** Tela de espera de uma TV: nome da sala, hora e data, no visual da marca. */
class IdleScreen {
  readonly material: THREE.MeshBasicMaterial;
  private readonly canvas = document.createElement("canvas");
  private readonly tex: THREE.CanvasTexture;

  constructor(private readonly room: string) {
    this.canvas.width = 640;
    this.canvas.height = 360;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.material = new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false });
    this.draw();
  }

  draw(): void {
    const g = this.canvas.getContext("2d")!;
    const { width: w, height: h } = this.canvas;
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#051326");
    bg.addColorStop(1, "#0B2A4D");
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    const glow = g.createRadialGradient(w * 0.5, h * 0.62, 10, w * 0.5, h * 0.62, w * 0.6);
    glow.addColorStop(0, "rgba(0,183,255,0.16)");
    glow.addColorStop(1, "rgba(0,183,255,0)");
    g.fillStyle = glow;
    g.fillRect(0, 0, w, h);
    const now = new Date();
    g.textAlign = "center";
    g.fillStyle = "#8A93A3";
    g.font = '500 26px NORD, "Arial Black", sans-serif';
    (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "4px";
    g.fillText(this.room.toUpperCase(), w / 2, 78);
    (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "0px";
    g.fillStyle = "#F2F0EF";
    g.font = '600 132px Geist, system-ui, sans-serif';
    g.fillText(CLOCK.format(now), w / 2, 222);
    g.fillStyle = "#8A93A3";
    g.font = '400 26px Geist, system-ui, sans-serif';
    g.fillText(DAY.format(now), w / 2, 280);
    this.tex.needsUpdate = true;
  }

  dispose(): void {
    this.tex.dispose();
    this.material.dispose();
  }
}
