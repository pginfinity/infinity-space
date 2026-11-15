import { Container, FillGradient, Graphics, Text, TextStyle } from "pixi.js";
import { WALL_THICKNESS, objectFootprint, polygonCentroid, type MapDef, type Vec2 } from "@infinity/world";
import { SPARKLE, SPARKLE_STOPS } from "../brand/sparkle.ts";
import { OBJECT_2D, PLAN } from "../world/theme.ts";

const flat = (poly: readonly Vec2[]) => poly.flatMap((p) => [p.x, p.z]);

/** Desenha a planta estática uma vez. Coordenadas em metros (x = leste, y da tela = z = sul). */
export function drawMap(map: MapDef): Container {
  const root = new Container({ label: "map" });

  // Pisos.
  const floors = new Graphics();
  for (const f of [...map.floors].sort((a, b) => (a.elevation ?? 0) - (b.elevation ?? 0))) {
    floors.poly(flat(f.polygon)).fill({ color: PLAN.floor[f.material] });
  }
  root.addChild(floors);

  // Tons das salas.
  const tints = new Graphics();
  for (const z of map.zones) {
    const tint = PLAN.zoneTint[z.kind as keyof typeof PLAN.zoneTint];
    if (tint) tints.poly(flat(z.polygon)).fill({ color: tint.color, alpha: tint.alpha });
  }
  root.addChild(tints);

  // Inicial da etapa no piso de cada ala, bem discreta.
  for (const w of map.wings) {
    const p = { x: Math.sin(w.yaw) * 21.5, z: -Math.cos(w.yaw) * 21.5 };
    const letter = new Text({
      text: w.letter,
      style: new TextStyle({ fontFamily: "NORD", fontWeight: "900", fontSize: 220, fill: PLAN.letter }),
      resolution: 1,
    });
    letter.anchor.set(0.5);
    letter.alpha = 0.035;
    letter.scale.set(5.5 / 220);
    letter.position.set(p.x, p.z);
    letter.rotation = upright(w.yaw);
    root.addChild(letter);
  }

  // Móveis.
  const furniture = new Graphics();
  for (const o of map.objects) {
    const style = OBJECT_2D[o.type];
    if (o.type === "sculpture" || (style.alpha ?? 1) === 0) continue;
    if (style.round === 1) {
      furniture.circle(o.pos.x, o.pos.z, Math.max(o.size.w, o.size.d) / 2).fill({ color: style.fill, alpha: style.alpha ?? 1 });
      continue;
    }
    const corners = objectFootprint(o);
    furniture.poly(flat(corners)).fill({ color: style.fill, alpha: style.alpha ?? 1 });
    if (style.stroke) furniture.poly(flat(corners)).stroke({ width: 0.04, color: style.stroke, alpha: 0.9, alignment: 1 });
  }
  root.addChild(furniture);

  // Paredes: vidro mais fino e translúcido.
  const walls = new Graphics();
  for (const w of map.walls) {
    walls.moveTo(w.a.x, w.a.z).lineTo(w.b.x, w.b.z);
    if (w.kind === "glass") walls.stroke({ width: WALL_THICKNESS * 0.55, color: PLAN.glass, alpha: 0.85, cap: "round" });
    else walls.stroke({ width: WALL_THICKNESS, color: PLAN.wall, alpha: 0.95, cap: "round" });
  }
  root.addChild(walls);

  // A estrela da Infinity no centro do átrio, com o gradiente oficial.
  const sculpture = map.objects.find((o) => o.type === "sculpture");
  if (sculpture) {
    const pedestal = new Graphics();
    pedestal.circle(sculpture.pos.x, sculpture.pos.z, 1.3).fill({ color: "#1B3A66", alpha: 0.9 });
    pedestal.circle(sculpture.pos.x, sculpture.pos.z, 1.3).stroke({ width: 0.05, color: "#5FD0FF", alpha: 0.85 });
    root.addChild(pedestal);
    root.addChild(drawSparkle(sculpture.pos, 2.6));
  }

  // Nomes das alas e das salas.
  for (const l of map.labels) root.addChild(label(l.text, l.sub, l.pos, l.kind, l.yaw));

  return root;
}

/** Gira o texto para acompanhar a ala sem nunca ficar de cabeça para baixo. */
function upright(yaw: number): number {
  let r = yaw;
  while (r > Math.PI) r -= Math.PI * 2;
  while (r < -Math.PI) r += Math.PI * 2;
  if (r > Math.PI / 2) r -= Math.PI;
  if (r < -Math.PI / 2) r += Math.PI;
  return r;
}

function label(text: string, sub: string | undefined, pos: Vec2, kind: "wing" | "room" | "hub", yaw = 0): Container {
  const c = new Container();
  const big = kind === "wing";
  const title = new Text({
    text: text.toUpperCase(),
    style: new TextStyle({
      fontFamily: "NORD",
      fontWeight: big ? "700" : "500",
      fontSize: 64,
      fill: PLAN.label,
      letterSpacing: big ? 6 : 3,
    }),
    resolution: 2,
  });
  title.anchor.set(0.5, big ? 1 : 0.5);
  title.alpha = big ? 0.92 : 0.6;
  title.scale.set((big ? 0.62 : 0.34) / 64);
  c.addChild(title);
  if (sub) {
    const s = new Text({
      text: sub,
      style: new TextStyle({ fontFamily: "Geist", fontWeight: "500", fontSize: 64, fill: PLAN.labelSub }),
      resolution: 2,
    });
    s.anchor.set(0.5, 0);
    s.scale.set(0.4 / 64);
    s.position.set(0, 0.14);
    c.addChild(s);
  }
  c.position.set(pos.x, pos.z);
  if (big) c.rotation = upright(yaw);
  return c;
}

export function drawSparkle(center: Vec2, size: number): Graphics {
  const g = new Graphics();
  const k = size;
  const [sx, sy] = SPARKLE.start;
  g.moveTo(sx * k, sy * k);
  for (const [c1x, c1y, c2x, c2y, x, y] of SPARKLE.curves) g.bezierCurveTo(c1x * k, c1y * k, c2x * k, c2y * k, x * k, y * k);
  g.closePath();
  // Coordenadas do gradiente no espaço do próprio desenho (a estrela vai de -k/2 a k/2).
  const gradient = new FillGradient({
    type: "linear",
    start: { x: -k / 2, y: -k * 0.12 },
    end: { x: k / 2, y: k * 0.12 },
    textureSpace: "global",
    colorStops: SPARKLE_STOPS.map((s) => ({ offset: s.offset, color: s.color })),
  });
  g.fill(gradient);
  g.stroke({ width: 0.035, color: "#F2F0EF", alpha: 0.35, alignment: 1 });
  g.position.set(center.x, center.z);
  return g;
}

export function centroidOf(poly: readonly Vec2[]): Vec2 {
  return polygonCentroid(poly);
}
