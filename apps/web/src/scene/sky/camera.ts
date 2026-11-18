import * as THREE from "three";

/**
 * "Câmera do céu": o céu fica no infinito, então só a rotação da câmera importa. Cada objeto do céu
 * projeta com esta matriz (rotação da câmera + perspectiva) e fica no fundo do buffer de profundidade:
 * a estação sempre passa na frente, sem depender do near/far da câmera nem da posição dela.
 *
 * No 3D e no telescópio é a própria câmera (perspectiva). No 2D isométrico (ortográfico) uma perspectiva
 * virtual com a mesma direção da câmera: a Terra aparece embaixo/atrás da estação, como de verdade.
 *
 * A matriz é calculada no `onBeforeRender` do primeiro objeto do céu desenhado, com a câmera daquele
 * desenho (depois de todos os `useFrame`): nunca fica um quadro atrasada em relação à estação.
 */

export const SKY_VP = { value: new THREE.Matrix4() };
/** Tamanho do buffer de desenho (px) e pixels por pixel CSS: espessura dos meteoros e tamanho das estrelas. */
export const SKY_RES = { value: new THREE.Vector2(1, 1) };
export const SKY_PX = { value: 1 };

/** Lente 2D: campo de visão e quanto a vista do céu sobe em relação à câmera isométrica (que olha 33° para baixo). */
const ISO_FOV = 60;
const ISO_TILT = THREE.MathUtils.degToRad(13);

const rot = new THREE.Matrix4();
const tilt = new THREE.Matrix4().makeRotationX(ISO_TILT);
const virtual = new THREE.PerspectiveCamera(ISO_FOV, 1, 0.1, 10);
let lastGl: THREE.WebGLRenderer | null = null;
let lastCam: THREE.Camera | null = null;
let lastFrame = -1;

export function updateSkyCamera(gl: THREE.WebGLRenderer, camera: THREE.Camera): void {
  const frame = gl.info.render.frame;
  if (gl === lastGl && camera === lastCam && frame === lastFrame) return;
  lastGl = gl;
  lastCam = camera;
  lastFrame = frame;

  rot.extractRotation(camera.matrixWorld);
  const vp = SKY_VP.value;
  if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
    vp.copy(camera.projectionMatrix);
  } else {
    const o = camera as THREE.OrthographicCamera;
    virtual.aspect = Math.abs((o.right - o.left) / (o.top - o.bottom)) || 1;
    virtual.updateProjectionMatrix();
    vp.copy(virtual.projectionMatrix);
    rot.multiply(tilt);
  }
  // view = rotação inversa (transposta); VP = P · V
  vp.multiply(rot.transpose());
  gl.getDrawingBufferSize(SKY_RES.value);
  SKY_PX.value = gl.getPixelRatio();
}

/** Prepara um objeto do céu: sem recorte por frustum, ordem fixa e a matriz do céu antes de desenhar. */
export function skyObject<T extends THREE.Object3D>(o: T, order: number): T {
  o.frustumCulled = false;
  o.renderOrder = order;
  o.onBeforeRender = (gl, _scene, camera) => updateSkyCamera(gl, camera);
  return o;
}

/** Projeção comum aos shaders do céu: direção (ou ponto perto da estação) → recorte, no fundo do buffer. */
export const SKY_GLSL = /* glsl */ `
uniform mat4 uSkyVP;
vec4 skyClip(vec3 p) {
  vec4 c = uSkyVP * vec4(p, 1.0);
  c.z = c.w * 0.99999;
  return c;
}
`;
