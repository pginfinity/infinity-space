import * as THREE from "three";
import type { MapObject } from "@infinity/world";
import { objectMatrix } from "../../scene/furniture/index.ts";
import { faceMatrix, type Face } from "../../scene/furniture/vivo.ts";

/**
 * Plano com textura desenhada em canvas, encaixado na face de um móvel (quadro de giz, plaquinha).
 * Redesenha só quando o conteúdo muda.
 */
export class FaceBoard {
  readonly mesh: THREE.Mesh;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly tex: THREE.CanvasTexture;
  private key = "";

  constructor(o: MapObject, face: Face, px: number, opts: { lit?: boolean } = {}) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = Math.round(px);
    this.canvas.height = Math.round((px * face.h) / face.w);
    this.ctx = this.canvas.getContext("2d") as CanvasRenderingContext2D;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    const mat = opts.lit
      ? new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, toneMapped: false })
      : new THREE.MeshToonMaterial({ map: this.tex, transparent: true });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(face.w, face.h), mat);
    this.mesh.name = `vivo:quadro:${o.id}`;
    const m = objectMatrix(o).multiply(faceMatrix(face));
    m.decompose(this.mesh.position, this.mesh.quaternion, this.mesh.scale);
    this.mesh.renderOrder = 1;
  }

  /** Desenha de novo se `key` mudou. */
  draw(key: string, fn: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): void {
    if (key === this.key) return;
    this.key = key;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    fn(this.ctx, this.canvas.width, this.canvas.height);
    this.tex.needsUpdate = true;
  }

  /** Força o próximo draw (fontes que chegaram depois). */
  invalidate(): void {
    this.key = "";
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.tex.dispose();
  }
}

/** Texto com cara de giz: leve tremido e um pouco de transparência. */
export function chalkText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, opts: { align?: CanvasTextAlign; weight?: number; font?: string } = {}): void {
  ctx.save();
  ctx.textAlign = opts.align ?? "left";
  ctx.textBaseline = "middle";
  ctx.font = `${opts.weight ?? 600} ${size}px ${opts.font ?? "Geist, 'Segoe UI', sans-serif"}`;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.9;
  ctx.fillText(text, x, y);
  ctx.globalAlpha = 0.25;
  ctx.fillText(text, x + 1.2, y - 0.8);
  ctx.restore();
}
