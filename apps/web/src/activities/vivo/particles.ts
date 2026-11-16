import * as THREE from "three";

/**
 * Partículas leves para os efeitos do pacote (vapor, gotas, corações, brilhos, pipoca, notas).
 * Um InstancedMesh por tipo, com um número fixo de vagas: nada é alocado por quadro.
 * As partículas somem encolhendo (sem transparência por instância).
 */

export interface Spawn {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  /** Vida em segundos. */
  life: number;
  size: number;
  /** Quanto cresce até o fim da vida (1 = dobra). */
  grow?: number;
  /** Aceleração vertical (m/s², negativo cai). */
  gravity?: number;
  /** Arrasto (1/s). */
  drag?: number;
  /** Giro (rad/s) em torno do eixo vertical. */
  spin?: number;
  color?: THREE.ColorRepresentation;
  /** Altura do chão: a partícula quica e para aqui. */
  floor?: number;
}

const _o = new THREE.Object3D();
const _c = new THREE.Color();

export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private readonly max: number;
  private n = 0;
  private readonly f: Float32Array;
  private static readonly S = 16;
  /** Vira as partículas para a câmera (corações e notas, que são planas). */
  billboard = false;

  constructor(geometry: THREE.BufferGeometry, material: THREE.Material, max: number) {
    this.max = max;
    this.mesh = new THREE.InstancedMesh(geometry, material, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, _c.set(1, 1, 1));
    this.f = new Float32Array(max * Particles.S);
  }

  get active(): number {
    return this.n;
  }

  spawn(p: Spawn): void {
    if (this.n >= this.max) return;
    const i = this.n++;
    const f = this.f;
    const o = i * Particles.S;
    f[o] = p.x;
    f[o + 1] = p.y;
    f[o + 2] = p.z;
    f[o + 3] = p.vx ?? 0;
    f[o + 4] = p.vy ?? 0;
    f[o + 5] = p.vz ?? 0;
    f[o + 6] = 0; // idade
    f[o + 7] = p.life;
    f[o + 8] = p.size;
    f[o + 9] = p.grow ?? 0;
    f[o + 10] = p.gravity ?? 0;
    f[o + 11] = p.drag ?? 0;
    f[o + 12] = p.spin ?? 0;
    f[o + 13] = Math.random() * Math.PI * 2; // ângulo
    f[o + 14] = p.floor ?? -1e9;
    this.mesh.setColorAt(i, _c.set(p.color ?? 0xffffff));
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number, camera?: THREE.Camera): void {
    const f = this.f;
    const k = Math.min(dt, 1 / 20);
    let i = 0;
    while (i < this.n) {
      const o = i * Particles.S;
      f[o + 6]! += k;
      if (f[o + 6]! >= f[o + 7]!) {
        this.kill(i);
        continue;
      }
      const drag = 1 - Math.min(1, f[o + 11]! * k);
      f[o + 4]! += f[o + 10]! * k;
      f[o + 3]! *= drag;
      f[o + 4]! *= drag;
      f[o + 5]! *= drag;
      f[o]! += f[o + 3]! * k;
      f[o + 1]! += f[o + 4]! * k;
      f[o + 2]! += f[o + 5]! * k;
      if (f[o + 1]! < f[o + 14]!) {
        f[o + 1] = f[o + 14]!;
        f[o + 4] = Math.abs(f[o + 4]!) * 0.35;
        f[o + 3]! *= 0.6;
        f[o + 5]! *= 0.6;
      }
      f[o + 13]! += f[o + 12]! * k;
      const t = f[o + 6]! / f[o + 7]!;
      // nasce rápido e some encolhendo no último terço
      const fade = Math.min(1, t * 8) * (t > 0.66 ? 1 - (t - 0.66) / 0.34 : 1);
      const s = f[o + 8]! * (1 + f[o + 9]! * t) * fade;
      _o.position.set(f[o]!, f[o + 1]!, f[o + 2]!);
      if (this.billboard && camera) {
        _o.quaternion.copy(camera.quaternion);
        _o.rotateZ(Math.sin(f[o + 13]!) * 0.35);
      } else _o.rotation.set(0, f[o + 13]!, 0);
      _o.scale.setScalar(Math.max(1e-4, s));
      _o.updateMatrix();
      this.mesh.setMatrixAt(i, _o.matrix);
      i++;
    }
    this.mesh.count = this.n;
    if (this.n > 0) this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    this.n = 0;
    this.mesh.count = 0;
  }

  /** Libera a malha e o material (as geometrias são compartilhadas e ficam). */
  dispose(): void {
    this.mesh.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }

  /** Remove a partícula i trazendo a última para o lugar dela. */
  private kill(i: number): void {
    const last = --this.n;
    if (i === last) return;
    const S = Particles.S;
    this.f.copyWithin(i * S, last * S, last * S + S);
    this.mesh.getColorAt(last, _c);
    this.mesh.setColorAt(i, _c);
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

// ---- geometrias e materiais compartilhados ---------------------------------------------------

let heart: THREE.BufferGeometry | null = null;
/** Coração plano (para carinho no Orbi), de 1 m de altura: escale com `size`. */
export function heartGeometry(): THREE.BufferGeometry {
  if (heart) return heart;
  const s = new THREE.Shape();
  s.moveTo(0, -0.5);
  s.bezierCurveTo(-0.15, -0.32, -0.55, -0.12, -0.5, 0.15);
  s.bezierCurveTo(-0.45, 0.45, -0.08, 0.5, 0, 0.22);
  s.bezierCurveTo(0.08, 0.5, 0.45, 0.45, 0.5, 0.15);
  s.bezierCurveTo(0.55, -0.12, 0.15, -0.32, 0, -0.5);
  heart = new THREE.ShapeGeometry(s, 8);
  return heart;
}

let note: THREE.BufferGeometry | null = null;
/** Nota musical plana (colcheia), de ~1 m: escale com `size`. */
export function noteGeometry(): THREE.BufferGeometry {
  if (note) return note;
  const head = new THREE.Shape();
  head.absellipse(-0.12, -0.32, 0.2, 0.14, 0, Math.PI * 2, false, -0.4);
  const stem = new THREE.Shape();
  stem.moveTo(0.04, -0.3);
  stem.lineTo(0.1, -0.3);
  stem.lineTo(0.1, 0.42);
  stem.bezierCurveTo(0.2, 0.3, 0.42, 0.22, 0.36, -0.02);
  stem.bezierCurveTo(0.34, 0.16, 0.2, 0.2, 0.1, 0.24);
  stem.lineTo(0.04, 0.5);
  stem.lineTo(0.04, -0.3);
  note = new THREE.ShapeGeometry([head, stem], 6);
  return note;
}

let ball: THREE.BufferGeometry | null = null;
export function ballGeometry(): THREE.BufferGeometry {
  return (ball ??= new THREE.IcosahedronGeometry(0.5, 1));
}

let drop: THREE.BufferGeometry | null = null;
/** Gota alongada (esfera esticada para baixo). */
export function dropGeometry(): THREE.BufferGeometry {
  if (drop) return drop;
  drop = new THREE.SphereGeometry(0.5, 8, 6);
  drop.scale(0.7, 1.4, 0.7);
  return drop;
}

let glint: THREE.BufferGeometry | null = null;
/** Brilho em losango (octaedro achatado). */
export function glintGeometry(): THREE.BufferGeometry {
  if (glint) return glint;
  glint = new THREE.OctahedronGeometry(0.5, 0);
  glint.scale(0.55, 1, 0.55);
  return glint;
}

/** Material que brilha sem luz (cor por instância). */
export function flatMaterial(opts: { opacity?: number; side?: THREE.Side } = {}): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: 0xffffff,
    toneMapped: false,
    transparent: (opts.opacity ?? 1) < 1,
    opacity: opts.opacity ?? 1,
    depthWrite: (opts.opacity ?? 1) >= 1,
    side: opts.side ?? THREE.FrontSide,
  });
}
