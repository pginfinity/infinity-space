import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { HEARING, type AvatarLook, type Status } from "@infinity/world";
import { STATUS_COLOR } from "../world/theme.ts";

/** Avatar visto de cima: ombros na cor da roupa, cabeça, cabelo atrás, olhos para frente. */
export class Avatar2D {
  readonly root = new Container();
  private readonly body = new Container();
  private readonly figure = new Graphics();
  private readonly ring = new Graphics();
  private readonly tag = new Container();
  private readonly nameText: Text;
  private readonly dot = new Graphics();
  private readonly hearing?: Graphics;
  private look: AvatarLook;
  private status: Status;

  constructor(name: string, look: AvatarLook, status: Status, isSelf: boolean) {
    this.look = look;
    this.status = status;
    if (isSelf) {
      this.hearing = new Graphics();
      drawHearing(this.hearing);
      this.root.addChild(this.hearing);
    }
    this.root.addChild(this.ring);
    this.body.addChild(this.figure);
    this.root.addChild(this.body);

    this.nameText = new Text({
      text: name,
      style: new TextStyle({ fontFamily: "Geist", fontWeight: "600", fontSize: 12, fill: "#F2F0EF", letterSpacing: 0.2 }),
      resolution: 2,
    });
    this.nameText.anchor.set(0, 0.5);
    this.tag.addChild(this.dot, this.nameText);
    this.root.addChild(this.tag);
    this.redraw();
    this.root.alpha = status === "away" ? 0.55 : 1;
  }

  setName(name: string): void {
    if (this.nameText.text !== name) {
      this.nameText.text = name;
      this.layoutTag(!!this.hearing);
    }
  }

  setLook(look: AvatarLook): void {
    const l = this.look;
    if (l.color === look.color && l.skin === look.skin && l.hair === look.hair && l.hairColor === look.hairColor) return;
    this.look = look;
    this.redraw();
  }

  setStatus(status: Status): void {
    if (status === this.status) return;
    this.status = status;
    this.redraw();
    this.root.alpha = status === "away" ? 0.55 : 1;
  }

  /** Posição em metros, yaw em radianos, zoom em px/m (a etiqueta mantém tamanho fixo na tela). */
  update(x: number, z: number, yaw: number, walking: boolean, t: number, zoom: number): void {
    this.root.position.set(x, z);
    this.body.rotation = yaw;
    const bob = walking ? 1 + Math.sin(t * 0.018) * 0.035 : 1;
    this.body.scale.set(bob);
    this.tag.scale.set(1 / zoom);
    this.tag.position.set(0, 0.62);
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }

  private layoutTag(isSelf: boolean): void {
    const w = this.nameText.width;
    const pad = 7;
    const dotR = 3.5;
    const total = dotR * 2 + 5 + w;
    this.dot.clear();
    const bg = new Graphics();
    bg.roundRect(-total / 2 - pad, -10, total + pad * 2, 20, 10).fill({ color: isSelf ? "#0A2547" : "#00112A", alpha: 0.82 });
    if (isSelf) bg.roundRect(-total / 2 - pad, -10, total + pad * 2, 20, 10).stroke({ width: 1, color: "#00B7FF", alpha: 0.7 });
    // Remove fundo antigo, se houver.
    const old = this.tag.getChildByLabel("tag-bg");
    if (old) old.destroy();
    bg.label = "tag-bg";
    this.tag.addChildAt(bg, 0);
    this.dot.circle(-total / 2 + dotR, 0, dotR).fill({ color: STATUS_COLOR[this.status] });
    this.nameText.position.set(-total / 2 + dotR * 2 + 5, 0);
  }

  private redraw(): void {
    const g = this.figure;
    const { color, skin, hairColor } = this.look;
    g.clear();
    g.ellipse(0.05, 0.07, 0.4, 0.38).fill({ color: "#000000", alpha: 0.32 });
    g.circle(0, 0, 0.34).fill({ color });
    g.circle(0, 0, 0.34).stroke({ width: 0.035, color: "#000000", alpha: 0.25, alignment: 1 });
    g.circle(0, -0.02, 0.2).fill({ color: skin });
    // Cabelo cobrindo a metade de trás da cabeça (a frente aponta para cima da tela quando yaw = 0).
    g.arc(0, -0.02, 0.205, 0, Math.PI).fill({ color: hairColor });
    g.circle(-0.065, -0.12, 0.028).fill({ color: "#1A1A1A" });
    g.circle(0.065, -0.12, 0.028).fill({ color: "#1A1A1A" });
    this.ring.clear();
    this.ring.circle(0, 0, 0.42).stroke({ width: 0.05, color: STATUS_COLOR[this.status], alpha: 0.9 });
    this.layoutTag(!!this.hearing);
  }
}

/** Anel "quem te ouve": raio da conversa nítida, e pontinhos no limite do som ambiente. */
function drawHearing(g: Graphics): void {
  g.circle(0, 0, HEARING.conversation).fill({ color: "#00B7FF", alpha: 0.035 });
  g.circle(0, 0, HEARING.conversation).stroke({ width: 0.04, color: "#00B7FF", alpha: 0.35 });
  const n = 72;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    g.circle(Math.cos(a) * HEARING.ambient, Math.sin(a) * HEARING.ambient, 0.045).fill({ color: "#00B7FF", alpha: 0.22 });
  }
}
