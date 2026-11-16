import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useFrame, useThree, type Vector3 } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Rótulo de HTML preso a um ponto da cena (nomes, placas, avisos), no lugar do `<Html>` do drei.
 *
 * Por que um nosso: o do drei reaproveita o mesmo contêiner quando o efeito roda de novo e desmonta a
 * raiz React dele no meio da renderização da cena. Ao trocar de lente (a cena inteira desmonta), uma
 * raiz apagava os nós da outra e o React lançava "removeChild: The node to be removed is not a child
 * of this node", às vezes engolindo uma mudança de estado feita no mesmo instante. Aqui cada montagem
 * cria um contêiner novo e a raiz é desmontada logo depois, fora da renderização.
 *
 * Faz só o que usamos: posição, centralizar, faixa de z-index pela distância e estilo do conteúdo.
 */
export function Html({ position, center, zIndexRange = [16777271, 0], style, children }: { position?: Vector3; center?: boolean; zIndexRange?: [number, number]; style?: CSSProperties; children?: ReactNode }) {
  const group = useRef<THREE.Group>(null);
  const host = useRef<{ el: HTMLDivElement; root: Root } | null>(null);
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const last = useRef({ x: NaN, y: NaN, visible: false });

  // Contêiner e raiz próprios, novos a cada montagem.
  useLayoutEffect(() => {
    const target = gl.domElement.parentNode as HTMLElement | null;
    if (!target) return;
    const el = document.createElement("div");
    // Escondido até o primeiro quadro calcular a posição (senão pisca no canto da tela).
    el.style.cssText = "position:absolute;top:0;left:0;transform-origin:0 0;display:none;";
    target.appendChild(el);
    const root = createRoot(el);
    host.current = { el, root };
    last.current = { x: NaN, y: NaN, visible: false };
    return () => {
      host.current = null;
      el.remove();
      // Desmontar dentro da renderização da cena é o que dava erro: espera ela terminar.
      queueMicrotask(() => root.unmount());
    };
  }, [gl]);

  // Conteúdo: redesenha junto com o componente (as props mudam a cada renderização do pai).
  useLayoutEffect(() => {
    host.current?.root.render(<div style={{ position: "absolute", transform: center ? "translate3d(-50%,-50%,0)" : "none", ...style }}>{children}</div>);
  });

  useFrame(() => {
    const g = group.current;
    const h = host.current;
    if (!g || !h) return;
    g.updateWorldMatrix(true, false);
    P.setFromMatrixPosition(g.matrixWorld);
    // Atrás da câmera: some.
    C.setFromMatrixPosition(camera.matrixWorld);
    camera.getWorldDirection(D);
    const visible = Q.subVectors(P, C).dot(D) > 0;
    if (visible !== last.current.visible) {
      last.current.visible = visible;
      h.el.style.display = visible ? "block" : "none";
    }
    if (!visible) return;
    const dist = P.distanceTo(C);
    Q.copy(P).project(camera);
    const x = (Q.x * 0.5 + 0.5) * size.width;
    const y = (-Q.y * 0.5 + 0.5) * size.height;
    // (Escrito como "não está perto" para valer também na primeira vez, quando o anterior é NaN.)
    if (!(Math.abs(x - last.current.x) <= 0.01 && Math.abs(y - last.current.y) <= 0.01)) {
      last.current.x = x;
      last.current.y = y;
      h.el.style.transform = `translate3d(${x}px,${y}px,0)`;
    }
    // Mais perto da câmera, mais na frente (como o drei: linear entre near e far).
    const [zNear, zFar] = zIndexRange;
    const cam = camera as THREE.PerspectiveCamera | THREE.OrthographicCamera;
    const a = (zFar - zNear) / (cam.far - cam.near);
    h.el.style.zIndex = String(Math.round(a * dist + (zFar - a * cam.far)));
  });

  return <group ref={group} position={position} />;
}

const P = new THREE.Vector3();
const C = new THREE.Vector3();
const D = new THREE.Vector3();
const Q = new THREE.Vector3();
