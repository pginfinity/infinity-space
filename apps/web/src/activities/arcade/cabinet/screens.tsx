import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CAB_GAMES, CAB_ID, CAB_ORDER, cabGameOfVariant, type CabState, type MapObject, CATALOG } from "@infinity/world";
import { world } from "../../../world/world.ts";
import { objectMatrix } from "../../../scene/furniture/index.ts";
import { BOARD_SCREEN } from "../../../scene/furniture/arcade.ts";
import { trs } from "../../../scene/furniture/core.ts";
import { actState } from "../../registry.ts";
import { PX, pixelText, textWidth } from "./pixel.ts";
import { GAME_COLOR } from "./Cabinet.tsx";
import { T } from "../strings.ts";
import { useWallFacing, wallHidden } from "../../../scene/wallFacing.ts";

/**
 * Telas dos fliperamas e o placar do Arcade no mundo (2D e 3D): textura de pixel pequena,
 * redesenhada duas vezes por segundo (o pisca-pisca) e quando o ranking muda.
 */

const MW = 128;
const MH = 96;
const BWID = 288;
const BHEI = 138;

/** Onde fica a tela inclinada do fliperama no modelo (ver games.ts). */
const MACHINE_SCREEN = trs(0, 1.26, 0.21, { rx: -0.2 }).multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.0055));

export function CabinetScreens() {
  const built = useMemo(() => build(world().map.objects), []);
  useEffect(() => () => built.dispose(), [built]);
  useFrame(() => built.update(performance.now()));
  return <primitive object={built.root} />;
}

interface Screen {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  draw(ctx: CanvasRenderingContext2D, st: CabState | undefined, blink: boolean): void;
}

function build(objects: readonly MapObject[]) {
  const root = new THREE.Group();
  root.name = "arcade:telas";
  const owned: Array<{ dispose(): void }> = [];
  const screens: Screen[] = [];
  const _m = new THREE.Matrix4();

  const add = (o: MapObject, local: THREE.Matrix4, w: number, h: number, cw: number, ch: number, draw: Screen["draw"]) => {
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    const geo = new THREE.PlaneGeometry(w, h);
    owned.push(tex, mat, geo);
    const mesh = new THREE.Mesh(geo, mat);
    _m.multiplyMatrices(objectMatrix(o), local).decompose(mesh.position, mesh.quaternion, mesh.scale);
    mesh.name = `arcade:tela:${o.id}`;
    root.add(mesh);
    // Placar na parede: no 2D some quando está de costas para a câmera (ver scene/wallFacing.ts).
    if (CATALOG[o.type]?.wallMounted) {
      mesh.visible = !wallHidden(o.id);
      const off = useWallFacing.subscribe((s) => (mesh.visible = !s.hidden.has(o.id)));
      owned.push({ dispose: off });
    }
    screens.push({ canvas, ctx, tex, draw });
  };

  for (const o of objects) {
    if (o.type === "arcade") {
      const game = cabGameOfVariant(o.variant);
      add(o, MACHINE_SCREEN, 0.56, 0.42, MW, MH, (ctx, st, blink) => drawMachine(ctx, o.id, game, st, blink));
    } else if (o.type === "arcade-board") {
      add(o, trs(0, BOARD_SCREEN.y, BOARD_SCREEN.z + 0.002), BOARD_SCREEN.w, BOARD_SCREEN.h, BWID, BHEI, (ctx, st, blink) => drawBoard(ctx, st, blink));
    }
  }

  let lastState: CabState | undefined;
  let lastBlink = -1;
  return {
    root,
    update(now: number) {
      const st = actState<CabState>(CAB_ID);
      const blink = Math.floor(now / 500) % 2;
      if (st === lastState && blink === lastBlink) return;
      lastState = st;
      lastBlink = blink;
      for (const s of screens) {
        s.draw(s.ctx, st, blink === 0);
        s.tex.needsUpdate = true;
      }
    },
    dispose() {
      for (const x of owned) x.dispose();
      root.clear();
    },
  };
}

function drawMachine(ctx: CanvasRenderingContext2D, id: string, game: keyof typeof CAB_GAMES, st: CabState | undefined, blink: boolean): void {
  const color = GAME_COLOR[game];
  ctx.fillStyle = PX.black;
  ctx.fillRect(0, 0, MW, MH);
  // moldura de luz na cor do jogo
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, MW, 2);
  ctx.fillRect(0, MH - 2, MW, 2);
  const words = CAB_GAMES[game].name.toUpperCase().split(" ");
  words.forEach((w, i) => pixelText(ctx, w, MW / 2, 6 + i * 10, { color, align: "center" }));
  const y0 = 8 + words.length * 10;
  const busy = st?.busy[id];
  if (busy) {
    pixelText(ctx, fit(busy.toUpperCase(), MW - 8), MW / 2, y0 + 14, { color: PX.white, align: "center" });
    if (blink) pixelText(ctx, T.cab.worldPlaying, MW / 2, y0 + 28, { color: PX.gold, align: "center" });
    // faíscas de jogo rolando
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 ? color : PX.white;
      ctx.fillRect(12 + ((i * 37 + (blink ? 9 : 0)) % (MW - 24)), y0 + 44 + ((i * 13) % 10), 2, 2);
    }
    return;
  }
  const board = st?.boards[game] ?? [];
  if (!board.length) pixelText(ctx, T.cab.attractEmpty, MW / 2, y0 + 16, { color: PX.slate, align: "center" });
  board.slice(0, 3).forEach((e, i) => {
    const y = y0 + 6 + i * 11;
    const c = i === 0 ? PX.gold : PX.white;
    pixelText(ctx, `${i + 1}`, 6, y, { color: c });
    pixelText(ctx, fit(e.name.toUpperCase(), 52), 16, y, { color: c });
    pixelText(ctx, String(e.score), MW - 6, y, { color: c, align: "right" });
  });
  if (blink) pixelText(ctx, T.cab.worldPress, MW / 2, MH - 12, { color: PX.sky, align: "center" });
}

function drawBoard(ctx: CanvasRenderingContext2D, st: CabState | undefined, blink: boolean): void {
  ctx.fillStyle = PX.black;
  ctx.fillRect(0, 0, BWID, BHEI);
  pixelText(ctx, "RECORDES DO ARCADE", BWID / 2, 6, { color: PX.white, scale: 2, align: "center" });
  const colW = BWID / 3;
  CAB_ORDER.forEach((g, k) => {
    const x0 = k * colW;
    const color = GAME_COLOR[g];
    if (k > 0) {
      ctx.fillStyle = PX.navy;
      ctx.fillRect(x0, 28, 1, BHEI - 34);
    }
    pixelText(ctx, fit(CAB_GAMES[g].name.toUpperCase(), colW - 4), x0 + colW / 2, 29, { color, align: "center" });
    ctx.fillStyle = color;
    ctx.fillRect(x0 + 6, 39, colW - 12, 1);
    const board = st?.boards[g] ?? [];
    if (!board.length) pixelText(ctx, T.cab.attractEmpty, x0 + colW / 2, 52, { color: PX.slate, align: "center" });
    board.slice(0, 6).forEach((e, i) => {
      const y = 45 + i * 15;
      const c = i === 0 ? (blink ? PX.gold : PX.white) : PX.white;
      pixelText(ctx, `${i + 1}`, x0 + 4, y, { color: i === 0 ? PX.gold : PX.slate });
      pixelText(ctx, fit(e.name.toUpperCase(), 44), x0 + 12, y, { color: c });
      pixelText(ctx, String(e.score), x0 + colW - 4, y, { color: c, align: "right" });
    });
  });
}

/** Corta o texto para caber em `w` pixels. */
function fit(text: string, w: number): string {
  let t = text;
  while (t.length > 1 && textWidth(t) > w) t = t.slice(0, -1);
  return t;
}
