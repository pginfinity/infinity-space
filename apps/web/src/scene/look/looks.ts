/**
 * Direção de arte do mundo. O visual oficial é o **Cinema** (escolhido pelo time em 18/11/2026):
 * luz física, sombras do Sol, reflexos, brilho nas telas e gradação de cor de cinema. Os outros ficam
 * para comparação em desenvolvimento com `?visual=atual | retro70 | maquete | ilustracao`.
 * Cada visual muda o modelo de material, a luz e o tratamento da imagem, sem mexer na geometria.
 * O modo de qualidade "leve" (ajustes) tira as partes caras: sombras, oclusão, brilho e suavização.
 */

export type LookId = "atual" | "retro70" | "maquete" | "cinema" | "ilustracao";

/** Como os objetos recebem luz. */
export type MaterialModel =
  /** Cel shading de 4 tons (o atual). */
  | "toon"
  /** Cel shading com rampa macia (parece guache). */
  | "soft"
  /** Luz física (PBR) fosca: maquete e cinema. */
  | "standard"
  /** Cel shading duro de 3 tons (quadrinho). */
  | "ink";

/** Faixa de matiz remapeada pela paleta (graus). */
export interface HueBand {
  /** Centro e meia-largura da faixa, em graus. */
  center: number;
  width: number;
  /** Para onde a faixa vai (graus de deslocamento) e quanto da saturação fica. */
  shift: number;
  sat: number;
}

/** Tratamento de cor de tela inteira (feito depois da cena, igual para tudo). */
export interface Grade {
  bands?: HueBand[];
  /** Saturação geral (1 = igual). */
  saturation?: number;
  contrast?: number;
  /** Brilho somado (-1..1, pequeno). */
  brightness?: number;
  /** Tinta nas sombras e nas luzes (split toning), como cor hex e força. */
  shadows?: [string, number];
  highlights?: [string, number];
  /** Pretos levantados (filme desbotado), 0..0.2. */
  lift?: number;
  /** Cores parecidas com branco puxadas para esta cor (papel, creme), e força. */
  paper?: [string, number];
  /** Quanto as cores muito saturadas (a estrela da marca, o laranja, neon) ficam fora da gradação (0..1). */
  protect?: number;
}

export interface PostSpec {
  grade?: Grade;
  bloom?: { intensity: number; threshold: number; radius?: number };
  /** Oclusão de ambiente (sombras de contato): o que mais dá cara de maquete. */
  ao?: { radius: number; intensity: number };
  /** Foco seletivo em faixa (tilt-shift). */
  tiltShift?: { focus: number; blur: number };
  vignette?: number;
  grain?: number;
  /** Contorno de quadrinho a partir da profundidade, e posterização dos tons. */
  ink?: { color: string; strength: number; posterize: number };
  chromatic?: number;
}

export interface LookLights {
  /** Multiplicadores sobre as luzes atuais. */
  key: number;
  sky: number;
  ambient: number;
  /** Cores no lugar das atuais (opcional). */
  keyColor?: string;
  skyColor?: string;
  groundColor?: string;
  /** Luz de recorte vinda do outro lado (azulada no cinema, quente no retrô). */
  rim?: { color: string; intensity: number };
}

export interface Look {
  id: LookId;
  name: string;
  material: MaterialModel;
  /** Aspereza do material físico (0 = espelho, 1 = fosco). */
  roughness?: number;
  lights: LookLights;
  /** Sombras projetadas pelo Sol (custa desempenho). */
  shadows: boolean;
  /** Reflexos de ambiente (mapa de ambiente gerado na hora). */
  env: number;
  exposure: number;
  post3d: PostSpec;
  post2d: PostSpec;
}

const ATUAL: Look = {
  id: "atual",
  name: "Atual",
  material: "toon",
  lights: { key: 1, sky: 1, ambient: 1 },
  shadows: false,
  env: 0,
  exposure: 1,
  post3d: {},
  post2d: {},
};

/**
 * Retrofuturismo anos 70: as pinturas de colônias espaciais da NASA. Creme no lugar do branco,
 * azuis viram petróleo, laranjas e madeiras esquentam, filme levemente desbotado e com grão.
 */
const RETRO70: Look = {
  id: "retro70",
  name: "Retrofuturismo anos 70",
  material: "soft",
  lights: { key: 1.05, sky: 0.95, ambient: 1.1, keyColor: "#FFD9A6", skyColor: "#FFE9CC", groundColor: "#5B3B2A", rim: { color: "#FF9A5A", intensity: 0.35 } },
  shadows: false,
  env: 0,
  exposure: 1.02,
  post3d: {
    grade: {
      bands: [
        { center: 215, width: 45, shift: -32, sat: 0.72 },
        { center: 265, width: 30, shift: -40, sat: 0.6 },
        { center: 25, width: 25, shift: 4, sat: 1.18 },
        { center: 330, width: 30, shift: 30, sat: 0.8 },
      ],
      saturation: 0.95,
      contrast: 1.04,
      shadows: ["#3A2418", 0.18],
      highlights: ["#FFE2B8", 0.22],
      lift: 0.05,
      paper: ["#F1E3C6", 0.55],
    },
    bloom: { intensity: 0.35, threshold: 1.1 },
    vignette: 0.42,
    grain: 0.06,
  },
  post2d: {
    grade: {
      bands: [
        { center: 215, width: 45, shift: -32, sat: 0.72 },
        { center: 265, width: 30, shift: -40, sat: 0.6 },
        { center: 25, width: 25, shift: 4, sat: 1.18 },
        { center: 330, width: 30, shift: 30, sat: 0.8 },
      ],
      saturation: 0.95,
      contrast: 1.04,
      shadows: ["#3A2418", 0.18],
      highlights: ["#FFE2B8", 0.2],
      lift: 0.04,
      paper: ["#F1E3C6", 0.55],
    },
    vignette: 0.3,
  },
};

/**
 * Maquete premium: o escritório como maquete de museu. Luz física fosca, sombras de contato fortes,
 * cores um pouco esmaecidas (como tinta de maquete), foco seletivo em faixa.
 */
const MAQUETE: Look = {
  id: "maquete",
  name: "Maquete premium",
  material: "standard",
  roughness: 0.88,
  lights: { key: 1.15, sky: 0.3, ambient: 0.1, keyColor: "#FFF1E0", skyColor: "#E4EEFF", groundColor: "#2E333D" },
  shadows: true,
  env: 0.1,
  exposure: 1.0,
  post3d: {
    grade: { saturation: 0.9, contrast: 1.12, highlights: ["#FFF3E2", 0.1], paper: ["#F1EEE8", 0.2] },
    ao: { radius: 2.0, intensity: 4 },
    tiltShift: { focus: 0.6, blur: 0.18 },
    vignette: 0.38,
  },
  post2d: {
    grade: { saturation: 0.85, contrast: 1.05, paper: ["#F3F0EA", 0.25] },
    tiltShift: { focus: 0.7, blur: 0.12 },
    vignette: 0.28,
  },
};

/**
 * Cinema realista: luz física, reflexos, brilho forte nas luzes e telas, verde-azulado nas sombras e
 * laranja nas luzes (padrão de cinema), aberração cromática sutil.
 */
const CINEMA: Look = {
  id: "cinema",
  name: "Cinema realista",
  material: "standard",
  roughness: 0.65,
  lights: { key: 1.5, sky: 0.22, ambient: 0.06, keyColor: "#FFE0BC", skyColor: "#C4D2EA", groundColor: "#1E2532", rim: { color: "#8EC5FF", intensity: 0.22 } },
  shadows: true,
  env: 0.16,
  exposure: 0.92,
  post3d: {
    grade: { saturation: 1.08, contrast: 1.18, shadows: ["#0E3A4A", 0.22], highlights: ["#FFC48A", 0.16], protect: 0.85 },
    bloom: { intensity: 0.9, threshold: 1.15, radius: 0.7 },
    ao: { radius: 1.1, intensity: 2.2 },
    // Sem aberração cromática nem grão: duplicavam as bordas e tiravam a nitidez.
    vignette: 0.45,
  },
  post2d: {
    grade: { saturation: 1.05, contrast: 1.1, shadows: ["#0E3A4A", 0.2], highlights: ["#FFC48A", 0.14], protect: 0.85 },
    bloom: { intensity: 0.8, threshold: 1.1 },
    vignette: 0.4,
  },
};

/**
 * Ilustração autoral: quadrinho europeu de ficção científica. Cel shading duro, contorno de tinta,
 * tons posterizados, cores de gráfica (menos saturadas, papel creme).
 */
const ILUSTRACAO: Look = {
  id: "ilustracao",
  name: "Ilustração autoral",
  material: "ink",
  lights: { key: 1.1, sky: 1.05, ambient: 1.15 },
  shadows: false,
  env: 0,
  exposure: 1.0,
  post3d: {
    grade: { saturation: 0.86, contrast: 1.02, paper: ["#F4EAD5", 0.5], bands: [{ center: 220, width: 40, shift: -8, sat: 0.85 }] },
    ink: { color: "#1A1410", strength: 1, posterize: 6 },
    grain: 0.05,
  },
  post2d: {
    grade: { saturation: 0.86, paper: ["#F4EAD5", 0.5] },
    ink: { color: "#1A1410", strength: 1, posterize: 6 },
  },
};

export const LOOKS: Record<LookId, Look> = { atual: ATUAL, retro70: RETRO70, maquete: MAQUETE, cinema: CINEMA, ilustracao: ILUSTRACAO };

function resolve(): Look {
  if (!import.meta.env.DEV || typeof location === "undefined") return CINEMA;
  const id = new URLSearchParams(location.search).get("visual");
  return id && id in LOOKS ? LOOKS[id as LookId] : CINEMA;
}

/** O visual desta página (fixo durante a visita: trocar exige recarregar). */
export const LOOK: Look = resolve();

/** Tem algum tratamento de imagem para esta lente? (sem nada, nem cria a etapa extra) */
export function hasPost(spec: PostSpec): boolean {
  return Object.keys(spec).length > 0;
}
