import { useEffect, useRef } from "react";
import { Application, Container, Graphics } from "pixi.js";
import type { PlayerInfo } from "@infinity/world";
import { useApp } from "../state/store.ts";
import { world } from "../world/world.ts";
import { sampleRemote, self, type Pose } from "../world/registry.ts";
import { currentPath, onPathChange, setHeading, walkTo } from "../engine/movement.ts";
import { SPACE } from "../world/theme.ts";
import { drawMap } from "./drawMap.ts";
import { Avatar2D } from "./avatar2d.ts";

const MIN_ZOOM = 9;
const MAX_ZOOM = 90;

/** Lente 2D: a planta vista de cima, desenhada com PixiJS. */
export function Lens2D() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current!;
    let disposed = false;
    const app = new Application();
    const cleanups: Array<() => void> = [];

    void (async () => {
      await Promise.all([document.fonts.load('700 16px "NORD"'), document.fonts.load('600 16px "Geist"')]).catch(() => undefined);
      await app.init({
        resizeTo: host,
        background: SPACE,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        preference: "webgl",
      });
      if (disposed) {
        app.destroy(true, { children: true });
        return;
      }
      host.appendChild(app.canvas);
      app.canvas.style.touchAction = "none";

      const { map } = world();
      const scene = new Container({ label: "scene" });
      const stars = starfield(app.screen.width, app.screen.height);
      app.stage.addChild(stars, scene);
      scene.addChild(drawMap(map));
      const fx = new Graphics();
      scene.addChild(fx);
      const avatarLayer = new Container({ label: "avatars" });
      scene.addChild(avatarLayer);

      // Câmera.
      let zoom = 30;
      let camX = self.x;
      let camZ = self.z;
      let follow = true;
      setHeading(0); // no 2D, "para cima" é sempre o norte

      const toWorld = (sx: number, sy: number) => ({ x: (sx - app.screen.width / 2) / zoom + camX, z: (sy - app.screen.height / 2) / zoom + camZ });

      // Arrastar move a câmera; clique sem arrastar anda até o ponto.
      let drag: { x: number; y: number; camX: number; camZ: number; moved: boolean; id: number } | null = null;
      const pointers = new Map<number, { x: number; y: number }>();
      let pinch: { dist: number; zoom: number } | null = null;
      const canvas = app.canvas;

      const onDown = (e: PointerEvent) => {
        canvas.setPointerCapture(e.pointerId);
        pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
        if (pointers.size === 2) {
          const [a, b] = [...pointers.values()];
          pinch = { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), zoom };
          drag = null;
          return;
        }
        drag = { x: e.offsetX, y: e.offsetY, camX, camZ, moved: false, id: e.pointerId };
      };
      const onMove = (e: PointerEvent) => {
        if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
        if (pinch && pointers.size === 2) {
          const [a, b] = [...pointers.values()];
          const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
          zoom = clampZoom((pinch.zoom * d) / pinch.dist);
          return;
        }
        if (!drag || drag.id !== e.pointerId) return;
        const dx = e.offsetX - drag.x;
        const dy = e.offsetY - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) > 6) drag.moved = true;
        if (drag.moved) {
          follow = false;
          camX = drag.camX - dx / zoom;
          camZ = drag.camZ - dy / zoom;
        }
      };
      const onUp = (e: PointerEvent) => {
        pointers.delete(e.pointerId);
        if (pointers.size < 2) pinch = null;
        if (drag && drag.id === e.pointerId && !drag.moved && e.button === 0) {
          if (walkTo(toWorld(e.offsetX, e.offsetY))) follow = true;
        }
        if (drag?.id === e.pointerId) drag = null;
      };
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        const before = toWorld(e.offsetX, e.offsetY);
        zoom = clampZoom(zoom * Math.exp(-e.deltaY * 0.0015));
        const after = toWorld(e.offsetX, e.offsetY);
        camX += before.x - after.x;
        camZ += before.z - after.z;
        if (Math.abs(before.x - self.x) > 3 || Math.abs(before.z - self.z) > 3) follow = false;
      };
      canvas.addEventListener("pointerdown", onDown);
      canvas.addEventListener("pointermove", onMove);
      canvas.addEventListener("pointerup", onUp);
      canvas.addEventListener("pointercancel", onUp);
      canvas.addEventListener("wheel", onWheel, { passive: false });
      cleanups.push(() => {
        canvas.removeEventListener("pointerdown", onDown);
        canvas.removeEventListener("pointermove", onMove);
        canvas.removeEventListener("pointerup", onUp);
        canvas.removeEventListener("pointercancel", onUp);
        canvas.removeEventListener("wheel", onWheel);
      });

      const recenter = () => {
        follow = true;
      };
      window.addEventListener("infinity:recenter", recenter);
      cleanups.push(() => window.removeEventListener("infinity:recenter", recenter));

      // Destino da rota.
      let pathEnd: { x: number; z: number; born: number } | null = null;
      cleanups.push(
        onPathChange(() => {
          const p = currentPath();
          const end = p?.at(-1);
          pathEnd = end ? { x: end.x, z: end.z, born: performance.now() } : null;
          if (end) follow = true;
        }),
      );

      // Avatares.
      const avatars = new Map<string, Avatar2D>();
      const sync = (players: Record<string, PlayerInfo>, selfId: string | null) => {
        for (const [id, av] of avatars) {
          if (!players[id]) {
            av.destroy();
            avatars.delete(id);
          }
        }
        for (const p of Object.values(players)) {
          let av = avatars.get(p.id);
          if (!av) {
            av = new Avatar2D(p.name, p.look, p.status, p.id === selfId);
            avatars.set(p.id, av);
            avatarLayer.addChild(av.root);
          } else {
            av.setName(p.name);
            av.setLook(p.look);
            av.setStatus(p.status);
          }
        }
      };
      const initial = useApp.getState();
      sync(initial.players, initial.selfId);
      cleanups.push(useApp.subscribe((s, prev) => s.players !== prev.players && sync(s.players, s.selfId)));

      const scratch: Pose = { x: 0, z: 0, yaw: 0, anim: "idle" };
      app.ticker.add((ticker) => {
        const now = performance.now();
        const dt = ticker.deltaMS / 1000;
        if (follow) {
          const k = 1 - Math.exp(-dt * 9);
          camX += (self.x - camX) * k;
          camZ += (self.z - camZ) * k;
        }
        scene.scale.set(zoom);
        scene.position.set(app.screen.width / 2 - camX * zoom, app.screen.height / 2 - camZ * zoom);
        stars.position.set((-camX * zoom * 0.05) % 512, (-camZ * zoom * 0.05) % 512);

        const selfId = useApp.getState().selfId;
        for (const [id, av] of avatars) {
          if (id === selfId) {
            av.update(self.x, self.z, self.yaw, self.anim !== "idle", now, zoom);
            continue;
          }
          const p = sampleRemote(id, now, scratch);
          if (p) av.update(p.x, p.z, p.yaw, p.anim === "walk" || p.anim === "run", now, zoom);
        }
        // Avatares mais ao sul por cima (profundidade da vista de cima).
        avatarLayer.children.sort((a, b) => a.position.y - b.position.y);

        fx.clear();
        if (pathEnd) {
          const age = (now - pathEnd.born) / 1000;
          const pulse = 0.22 + (Math.sin(age * 5) + 1) * 0.06;
          fx.circle(pathEnd.x, pathEnd.z, pulse).stroke({ width: 0.05, color: "#00B7FF", alpha: 0.9 });
          fx.circle(pathEnd.x, pathEnd.z, 0.06).fill({ color: "#00B7FF" });
        }
      });
    })();

    return () => {
      disposed = true;
      for (const fn of cleanups) fn();
      if (app.renderer) app.destroy(true, { children: true });
    };
  }, []);

  return <div ref={hostRef} className="absolute inset-0" aria-label="Planta do escritório em 2D" role="application" />;
}

function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

/** Estrelas de fundo (o lado de fora da estação), em uma camada com leve paralaxe. */
function starfield(w: number, h: number): Graphics {
  const g = new Graphics();
  const size = 512;
  const cols = Math.ceil(w / size) + 2;
  const rows = Math.ceil(h / size) + 2;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const tile: Array<[number, number, number, number]> = [];
  for (let i = 0; i < 70; i++) tile.push([rnd() * size, rnd() * size, rnd() * 0.9 + 0.3, rnd() * 0.5 + 0.15]);
  for (let r = -1; r < rows; r++) {
    for (let c = -1; c < cols; c++) {
      for (const [x, y, rad, a] of tile) g.circle(c * size + x, r * size + y, rad).fill({ color: "#CFE6FF", alpha: a });
    }
  }
  return g;
}
