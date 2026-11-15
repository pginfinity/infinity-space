import { Builder, C, T, lit, mix, pick, poly, rng, trs, type ModelFn, type Paint } from "./core.ts";
import { at, postit, trophy } from "./kit.ts";

/**
 * Telas e objetos de parede. Base em y = 0 (o index sobe até a altura de montagem),
 * fundo em z = -d/2 encostado na parede, frente para +Z.
 */

/** Traço reto no plano da parede (rabiscos, setas, gráficos). */
function stroke(b: Builder, p: Paint, x1: number, y1: number, x2: number, y2: number, z: number, w = 0.022): void {
  const len = Math.hypot(x2 - x1, y2 - y1);
  b.box(p, len + w * 0.6, w, 0.006, (x1 + x2) / 2, (y1 + y2) / 2, z, { rz: Math.atan2(y2 - y1, x2 - x1), r: 0 });
}

/** Contorno de retângulo no plano da parede. */
function outline(b: Builder, p: Paint, x: number, y: number, w: number, h: number, z: number, t = 0.022): void {
  stroke(b, p, x - w / 2, y - h / 2, x + w / 2, y - h / 2, z, t);
  stroke(b, p, x - w / 2, y + h / 2, x + w / 2, y + h / 2, z, t);
  stroke(b, p, x - w / 2, y - h / 2, x - w / 2, y + h / 2, z, t);
  stroke(b, p, x + w / 2, y - h / 2, x + w / 2, y + h / 2, z, t);
}

/** Disco voltado para a frente (sol, ímãs, botões de parede). */
function disc(b: Builder, p: Paint, r: number, x: number, y: number, z: number, depth = 0.008): void {
  b.cyl(p, r, depth, x, y, z, { rx: Math.PI / 2, seg: Math.max(12, Math.round(r * 120)) });
}

export const tv: ModelFn = ({ b, separateScreen }) => {
  const W = 1.7;
  const H = 0.96;
  b.box(C.graphite, 0.5, 0.3, 0.03, 0, H / 2, -0.025, { r: 0.01 });
  b.box(C.ink, W, H, 0.05, 0, H / 2, -0.005, { r: 0.022 });
  b.box(C.graphite, W - 0.2, 0.02, 0.012, 0, 0.012, 0.016, { r: 0 });
  b.box(lit(C.signal), 0.04, 0.012, 0.008, W / 2 - 0.1, 0.018, 0.022, { r: 0 });
  if (separateScreen) b.screen = { w: W - 0.08, h: H - 0.08, m: trs(0, H / 2, 0.022), kind: "tv" };
  else b.box(lit(T.screen), W - 0.08, H - 0.08, 0.004, 0, H / 2, 0.021, { r: 0 });
};

export const leaderboard: ModelFn = ({ b }) => {
  const W = 2.6;
  const H = 1.3;
  b.box(C.navy, W, H, 0.07, 0, H / 2, -0.015, { r: 0.03 });
  b.box(T.navyMid, W - 0.06, H - 0.06, 0.02, 0, H / 2, 0.02, { r: 0.012 });
  b.screen = { w: W - 0.14, h: H - 0.16, m: trs(0, H / 2 - 0.01, 0.032), kind: "leaderboard" };
  // filetes de luz em cima e embaixo
  b.box(lit(C.signal), W - 0.3, 0.018, 0.01, 0, H - 0.025, 0.026, { r: 0 });
  b.box(lit(C.signal), W - 0.3, 0.018, 0.01, 0, 0.025, 0.026, { r: 0 });
  // troféu no topo
  b.box(C.navy, 0.3, 0.05, 0.12, 0, H - 0.02, 0.06, { r: 0.02 });
  trophy(b, 0, H, 0.06, 1.6);
};

export const whiteboard: ModelFn = ({ b, variant }) => {
  const W = 2.0;
  const H = 1.1;
  b.box(T.steel, W, H, 0.035, 0, H / 2, -0.012, { r: 0.015 });
  b.box(C.offwhite, W - 0.06, H - 0.06, 0.02, 0, H / 2, 0.0, { r: 0.006 });
  const z = 0.013;
  // bandeja com marcadores
  b.box(T.steel, 1.5, 0.025, 0.07, 0, 0.03, 0.035, { r: 0.008 });
  [C.signal, C.orange, C.green, C.navy].forEach((c, i) => b.cyl(c, 0.014, 0.13, -0.5 + i * 0.17, 0.056, 0.04, { rz: Math.PI / 2, seg: 8 }));
  b.box(C.graphite, 0.12, 0.04, 0.05, 0.55, 0.062, 0.04, { r: 0.01 });
  if (variant === 1) {
    // mapa mental: círculo central e ramos
    b.torus(C.signal, 0.15, 0.012, -0.25, 0.6, z, { seg: 28, tseg: 5 });
    const branches: [number, number, string][] = [
      [-0.75, 0.88, C.orange],
      [-0.78, 0.36, C.green],
      [0.25, 0.86, C.navy],
      [0.26, 0.34, C.signal],
    ];
    for (const [x, y, col] of branches) {
      stroke(b, col, -0.25 + Math.sign(x + 0.25) * 0.15, 0.6, x, y, z, 0.018);
      stroke(b, C.navy, x - 0.12, y, x + 0.12, y, z, 0.022);
      stroke(b, mix(C.navy, C.offwhite, 0.4), x - 0.12, y - 0.05, x + 0.06, y - 0.05, z, 0.018);
    }
    postit(b, 0.6, 0.82, z, C.gold, 0.05);
    postit(b, 0.78, 0.8, z, C.pink, -0.08);
    postit(b, 0.66, 0.6, z, C.sky, 0.04);
    postit(b, 0.82, 0.6, z, C.gold, -0.03);
    return;
  }
  // fluxo: três caixas com setas
  const ys = 0.78;
  [-0.72, -0.3, 0.12].forEach((x, i) => {
    outline(b, i === 2 ? C.orange : C.signal, x, ys, 0.28, 0.16, z, 0.02);
    stroke(b, C.navy, x - 0.08, ys, x + 0.08, ys, z, 0.022);
    if (i < 2) {
      stroke(b, C.navy, x + 0.15, ys, x + 0.27, ys, z, 0.016);
      stroke(b, C.navy, x + 0.27, ys, x + 0.23, ys + 0.03, z, 0.016);
      stroke(b, C.navy, x + 0.27, ys, x + 0.23, ys - 0.03, z, 0.016);
    }
  });
  // gráfico de linha
  stroke(b, C.navy, -0.86, 0.22, -0.86, 0.56, z, 0.016);
  stroke(b, C.navy, -0.86, 0.22, -0.1, 0.22, z, 0.016);
  const pts: [number, number][] = [
    [-0.82, 0.28],
    [-0.62, 0.36],
    [-0.46, 0.31],
    [-0.3, 0.45],
    [-0.14, 0.52],
  ];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i] as [number, number];
    const [x2, y2] = pts[i + 1] as [number, number];
    stroke(b, C.green, x1, y1, x2, y2, z, 0.02);
  }
  // linhas de texto
  [0.5, 0.42, 0.34].forEach((y, i) => stroke(b, mix(C.navy, C.offwhite, i * 0.2), 0.08, y, 0.08 + 0.36 - i * 0.08, y, z, 0.022));
  postit(b, 0.68, 0.8, z, C.gold, 0.06);
  postit(b, 0.75, 0.55, z, C.pink, -0.08);
  postit(b, 0.58, 0.36, z, C.sky, 0.05);
};

export const kanbanBoard: ModelFn = ({ b, accent }) => {
  const W = 2.8;
  const H = 1.3;
  b.box(C.graphite, W, H, 0.035, 0, H / 2, -0.012, { r: 0.018 });
  b.box(C.offwhite, W - 0.07, H - 0.07, 0.02, 0, H / 2, 0, { r: 0.006 });
  const z = 0.013;
  const cols = [C.slate, accent ?? C.signal, C.gold, C.green];
  const cw = (W - 0.12) / 4;
  const r = rng(11);
  const notes = [C.gold, C.pink, C.sky, C.gold, C.green, C.offwhite, C.sky];
  cols.forEach((col, i) => {
    const cx = -W / 2 + 0.06 + cw * (i + 0.5);
    b.box(col, cw - 0.08, 0.07, 0.012, cx, H - 0.1, z, { r: 0.004 });
    if (i > 0) stroke(b, mix(C.slate, C.offwhite, 0.3), cx - cw / 2, 0.08, cx - cw / 2, H - 0.06, z, 0.012);
    const n = [6, 4, 3, 5][i] as number;
    for (let k = 0; k < n; k++) {
      const nx = cx + (k % 2 === 0 ? -0.15 : 0.15) + (r() - 0.5) * 0.03;
      const ny = H - 0.28 - Math.floor(k / 2) * 0.27 + (r() - 0.5) * 0.02;
      const nc = i === 3 ? C.green : pick(r, notes);
      postit(b, nx, ny, z, nc, (r() - 0.5) * 0.14, 1.3);
      stroke(b, mix(nc, C.navy, 0.45), nx - 0.06, ny + 0.03, nx + 0.06, ny + 0.03, z + 0.012, 0.018);
      stroke(b, mix(nc, C.navy, 0.3), nx - 0.06, ny - 0.02, nx + 0.02, ny - 0.02, z + 0.012, 0.018);
    }
  });
  // um cartão laranja de urgência
  postit(b, -W / 2 + 0.06 + cw * 1.5 + 0.15, H - 0.82, z + 0.002, C.orange, 0.08, 1.3);
};

export const moodboard: ModelFn = ({ b, variant }) => {
  const W = 2.2;
  const H = 1.3;
  b.box(C.wood, W, H, 0.04, 0, H / 2, -0.005, { r: 0.018 });
  b.box(mix(C.woodLight, C.gold, 0.15), W - 0.08, H - 0.08, 0.02, 0, H / 2, 0.006, { r: 0.006 });
  const z = 0.02;
  const r = rng(5 + variant * 17);
  const pin = (x: number, y: number) => b.sph(pick(r, [C.red, C.orange, C.signal]), 0.018, x, y, z + 0.02, { seg: 8 });
  // polaroides com imagens simples
  const photo = (x: number, y: number, rz: number, kind: number) => {
    b.at(x, y, z, { rz }, () => {
      b.box(C.offwhite, 0.3, 0.34, 0.008, 0, 0, 0.002, { r: 0 });
      const bg = [C.sky, C.navy, C.pink, C.cream][kind % 4] as string;
      b.box(bg, 0.26, 0.24, 0.006, 0, 0.03, 0.008, { r: 0 });
      if (kind % 4 === 0) {
        disc(b, C.gold, 0.04, 0.06, 0.08, 0.012, 0.004);
        b.front(C.green, poly([[-0.13, -0.09], [-0.03, 0.04], [0.04, -0.03], [0.08, 0.01], [0.13, -0.05], [0.13, -0.09]]), 0.004, 0, 0, 0.013);
      } else if (kind % 4 === 1) {
        disc(b, C.orange, 0.06, 0, 0.04, 0.012, 0.004);
        b.box(C.signal, 0.26, 0.03, 0.004, 0, -0.06, 0.012, { r: 0 });
      } else if (kind % 4 === 2) {
        b.box(C.offwhite, 0.1, 0.14, 0.004, -0.04, 0.03, 0.012, { r: 0.01 });
        b.box(C.orange, 0.08, 0.08, 0.004, 0.06, 0.0, 0.013, { r: 0.01 });
      } else {
        b.box(C.woodDark, 0.18, 0.04, 0.004, 0, -0.04, 0.012, { r: 0 });
        b.box(C.leaf, 0.06, 0.1, 0.004, -0.05, 0.04, 0.012, { r: 0.02 });
      }
    });
    pin(x, y + 0.14);
  };
  photo(-0.78, 0.86, 0.06, variant);
  photo(-0.36, 0.92, -0.05, variant + 1);
  photo(0.62, 0.38, -0.07, variant + 2);
  photo(-0.62, 0.38, 0.04, variant + 3);
  // amostras de cor (paleta da marca)
  [C.navy, C.signal, C.orange, C.cream, C.sky].forEach((c, i) => {
    b.box(C.offwhite, 0.12, 0.17, 0.006, 0.05 + i * 0.14, 0.92, z + 0.002, { r: 0 });
    b.box(c, 0.1, 0.12, 0.006, 0.05 + i * 0.14, 0.94, z + 0.006, { r: 0 });
  });
  stroke(b, C.navy, 0.0, 1.06, 0.66, 1.06, z + 0.004, 0.02);
  // amostras de tecido
  b.box(T.navySoft, 0.26, 0.26, 0.012, 0.0, 0.42, z + 0.002, { rz: 0.08, r: 0.004 });
  for (let i = 0; i < 3; i++) b.box(C.cream, 0.26, 0.03, 0.004, 0.0, 0.34 + i * 0.08, z + 0.01, { rz: 0.08, r: 0 });
  b.box(C.leather, 0.22, 0.2, 0.012, 0.28, 0.5, z + 0.003, { rz: -0.1, r: 0.004 });
  pin(0.0, 0.56);
  pin(0.28, 0.6);
  // fita e um post-it
  b.box(mix(C.offwhite, C.gold, 0.2), 0.14, 0.04, 0.004, 0.62, 0.56, z + 0.016, { rz: 0.5, r: 0 });
  postit(b, 0.82, 0.86, z, C.gold, -0.1);
};

export const neonSign: ModelFn = ({ b, accent }) => {
  const W = 1.6;
  const H = 0.6;
  const col = accent ?? C.signal;
  b.box(C.navyDeep, W, H, 0.02, 0, H / 2, -0.015, { r: 0.05 });
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) b.cyl(T.steel, 0.016, 0.03, sx * (W / 2 - 0.06), H / 2 + sy * (H / 2 - 0.06), 0.0, { rx: Math.PI / 2, seg: 8 });
  // borda em tubo neon (mais escura que o texto)
  const tube = lit(mix(col, C.navyDeep, 0.35));
  b.box(tube, W - 0.08, 0.016, 0.012, 0, 0.035, 0.0, { r: 0 });
  b.box(tube, W - 0.08, 0.016, 0.012, 0, H - 0.035, 0.0, { r: 0 });
  b.neon = { w: W - 0.1, h: H - 0.1, m: trs(0, H / 2, 0.006) };
};

export const artFrame: ModelFn = ({ b, variant, color }) => {
  const W = 1.0;
  const H = 0.7;
  const frame = color ?? ([C.woodDark, C.offwhite, C.navy][variant % 3] as string);
  b.box(frame, W, H, 0.04, 0, H / 2, 0, { r: 0.012 });
  b.box(C.offwhite, W - 0.08, H - 0.08, 0.01, 0, H / 2, 0.018, { r: 0 });
  const z = 0.024;
  const aw = W - 0.24;
  const ah = H - 0.24;
  const cy = H / 2;
  if (variant % 3 === 1) {
    // blocos de cor
    b.box(C.cream, aw, ah, 0.006, 0, cy, z, { r: 0 });
    b.box(C.navy, aw * 0.42, ah * 0.62, 0.006, -aw * 0.27, cy + ah * 0.17, z + 0.003, { r: 0 });
    b.box(C.signal, aw * 0.5, ah * 0.3, 0.006, aw * 0.22, cy - ah * 0.33, z + 0.003, { r: 0 });
    b.box(C.sky, aw * 0.28, ah * 0.5, 0.006, aw * 0.33, cy + ah * 0.22, z + 0.003, { r: 0 });
    b.box(C.orange, aw * 0.14, aw * 0.14, 0.006, -aw * 0.04, cy - ah * 0.25, z + 0.003, { r: 0 });
    return;
  }
  if (variant % 3 === 2) {
    // órbitas
    b.box(C.navyDeep, aw, ah, 0.006, 0, cy, z, { r: 0 });
    b.torus(C.signal, 0.2, 0.014, -0.05, cy - 0.04, z + 0.004, { arc: Math.PI * 1.3, rz: 0.4, seg: 30, tseg: 5 });
    b.torus(C.sky, 0.13, 0.014, -0.05, cy - 0.04, z + 0.004, { arc: Math.PI * 1.1, rz: 2.6, seg: 24, tseg: 5 });
    b.torus(C.cream, 0.28, 0.01, -0.05, cy - 0.04, z + 0.004, { arc: Math.PI * 0.7, rz: 4.0, seg: 30, tseg: 5 });
    disc(b, C.orange, 0.04, -0.05, cy - 0.04, z + 0.006, 0.006);
    disc(b, C.offwhite, 0.018, 0.18, cy + 0.12, z + 0.006, 0.006);
    return;
  }
  // sol sobre ondas
  b.box(C.navy, aw, ah, 0.006, 0, cy, z, { r: 0 });
  disc(b, C.orange, 0.09, aw * 0.2, cy + ah * 0.12, z + 0.003, 0.006);
  [C.signal, C.sky, C.cream].forEach((c, i) => {
    const y = cy - ah * 0.12 - i * 0.07;
    b.box(c, aw * (0.7 - i * 0.12), 0.04, 0.006, -aw * 0.12 + i * 0.07, y, z + 0.004, { r: 0.0 });
  });
};

export const directory: ModelFn = ({ b }) => {
  const W = 1.2;
  const D = 0.25;
  const H = 1.9;
  b.box(C.graphite, W, 0.08, D, 0, 0.04, 0, { r: 0.03 });
  b.box(C.navy, W - 0.1, H - 0.1, D - 0.06, 0, (H - 0.1) / 2 + 0.06, 0, { r: 0.06 });
  b.box(lit(C.signal), W - 0.3, 0.025, 0.02, 0, H - 0.08, D / 2 - 0.03, { r: 0 });
  // tela vertical com a planta do escritório
  const sz = D / 2 - 0.025;
  const sw = W - 0.3;
  const sh = 1.18;
  const sy = 1.04;
  b.box(lit(T.screen), sw, sh, 0.012, 0, sy, sz, { r: 0 });
  b.box(lit(C.offwhite), 0.36, 0.05, 0.004, -sw / 2 + 0.24, sy + sh / 2 - 0.08, sz + 0.008, { r: 0 });
  const room = lit(mix(T.screen, C.signal, 0.35));
  const roomHi = lit(mix(T.screen, C.sky, 0.6));
  const cy = sy - 0.05;
  // salas em volta de um átrio circular
  const rooms: [number, number, number, number, boolean][] = [
    [-0.3, 0.3, 0.26, 0.22, false],
    [0.0, 0.34, 0.22, 0.14, true],
    [0.3, 0.3, 0.26, 0.22, false],
    [-0.32, -0.02, 0.2, 0.26, true],
    [0.32, -0.02, 0.2, 0.26, false],
    [-0.3, -0.34, 0.26, 0.2, false],
    [0.02, -0.38, 0.26, 0.12, false],
    [0.3, -0.34, 0.26, 0.2, true],
  ];
  for (const [x, y, w, h, hi] of rooms) b.box(hi ? roomHi : room, w, h, 0.004, x, cy + y, sz + 0.008, { r: 0 });
  b.cyl(lit(C.signal), 0.11, 0.004, 0, cy, sz + 0.008, { rx: Math.PI / 2, seg: 24 });
  b.cyl(lit(T.screen), 0.07, 0.004, 0, cy, sz + 0.01, { rx: Math.PI / 2, seg: 20 });
  // "você está aqui": pino laranja pulsando
  b.anim(
    (s) => {
      s.cyl(lit(C.orange), 0.035, 0.006, 0, 0, 0, { rx: Math.PI / 2, seg: 14 });
    },
    {
      copies: [at(0.0, cy - 0.21, sz + 0.016)],
      pose: (t, seed, _k, out) => {
        const k = 1 + 0.35 * Math.max(0, Math.sin(t * 4 + seed * 6));
        out.makeScale(k, k, 1);
      },
    },
  );
};
