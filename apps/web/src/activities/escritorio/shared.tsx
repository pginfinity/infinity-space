import { useEffect, useRef, useState, type ReactNode } from "react";
import { addAfterEffect, useThree, type RootState } from "@react-three/fiber";
import { pointInPolygon, wallBetween, type Vec2 } from "@infinity/world";
import { useApp } from "../../state/store.ts";
import { sampleRemote, self, type Pose } from "../../world/registry.ts";
import { world } from "../../world/world.ts";

/** Utilidades do pacote "escritorio" no cliente. */

const scratch: Pose = { x: 0, z: 0, yaw: 0, anim: "idle" };

/** Pose atual de uma pessoa (você ou alguém remoto). Reaproveita `out` (não aloca por quadro). */
export function poseOf(id: string, out: Pose = scratch): Pose | null {
  if (id === useApp.getState().selfId) {
    out.x = self.x;
    out.z = self.z;
    out.yaw = self.yaw;
    out.anim = self.anim;
    return out;
  }
  return sampleRemote(id, performance.now(), out);
}

export const myId = (): string | null => useApp.getState().selfId;
export const nameOf = (id: string): string => useApp.getState().players[id]?.name ?? "Alguém";

/** Altura do piso (o palco do auditório é mais alto). Mesma regra dos avatares. */
let raised: Array<{ poly: Vec2[]; y: number }> | null = null;
export function groundY(x: number, z: number): number {
  raised ??= world().map.floors.filter((f) => (f.elevation ?? 0) > 0.05).map((f) => ({ poly: f.polygon, y: f.elevation! }));
  for (const r of raised) if (pointInPolygon({ x, z }, r.poly)) return r.y;
  return 0;
}

/** Você está a até `range` metros do ponto, sem parede no meio? (mesma conta do servidor) */
export function selfNear(p: Vec2, range: number): boolean {
  return Math.hypot(p.x - self.x, p.z - self.z) <= range && !wallBetween(world().map.walls, self, p);
}

const KEY = "infinity-space:escritorio:chave";
let memKey: string | null = null;

/**
 * Chave secreta deste navegador (fica no localStorage). O servidor usa só para gerar marcas
 * anônimas: assim você reconhece e apaga os próprios recados mesmo depois de recarregar.
 */
export function browserKey(): string {
  if (memKey) return memKey;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && /^[A-Za-z0-9-]{16,64}$/.test(saved)) return (memKey = saved);
  } catch {
    /* sem armazenamento: chave só desta sessão */
  }
  memKey = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}-k`;
  try {
    localStorage.setItem(KEY, memKey);
  } catch {
    /* segue sem lembrar */
  }
  return memKey;
}

/** Digitando num campo? (atalhos de tecla não valem) */
export function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
}

/** Tecla sem modificadores, fora de campos de texto. */
export function plainKey(e: KeyboardEvent): boolean {
  return !typing(e) && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat;
}

/**
 * Roda `fn` depois de cada quadro desenhado, com a câmera já posicionada (para projetar coisas
 * do mundo na tela sem atraso em relação aos avatares). Fora do React: nada de estado por quadro.
 */
export function useAfterRender(fn: (state: RootState) => void): void {
  const get = useThree((s) => s.get);
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => addAfterEffect(() => ref.current(get())), [get]);
}

/** Tecla no visual da interface (mesmo estilo do botão de interação). */
export function Kbd({ children, light }: { children: ReactNode; light?: boolean }) {
  return (
    <kbd
      className={`inline-grid h-5 min-w-5 place-items-center rounded-md px-1 font-display text-[10px] font-bold ${light ? "bg-offwhite text-space" : "bg-offwhite/12 text-offwhite"}`}
    >
      {children}
    </kbd>
  );
}

/** "há 3 min", "há 2 h", "ontem"... a partir de dois instantes do mesmo relógio. */
export function timeAgo(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return "agora";
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
}

/**
 * Esc fecha o painel mesmo com o foco fora dele (depois de um clique num botão que sumiu, por
 * exemplo). Use em painéis e diálogos do pacote.
 */
export function useEscape(close: () => void, enabled = true): void {
  const ref = useRef(close);
  ref.current = close;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") ref.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}

/**
 * Foca depois que a tecla que abriu o painel terminou (senão o "e" do E vai parar no campo).
 */
export function focusSoon(el: HTMLElement | null | undefined): () => void {
  const id = window.setTimeout(() => el?.focus(), 40);
  return () => window.clearTimeout(id);
}

/**
 * Fica `true` um pouco depois de montar (quando o navegador folga). Usado para montar os extras
 * do pacote (foguete, mural) depois do primeiro quadro do escritório: abre mais leve em PC fraco.
 */
export function useDeferred(ms = 1200): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let idle = 0;
    const t = window.setTimeout(() => {
      const ric = (window as unknown as { requestIdleCallback?: (fn: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      if (ric) idle = ric(() => setReady(true), { timeout: 1500 });
      else setReady(true);
    }, ms);
    return () => {
      window.clearTimeout(t);
      const cic = (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
      if (idle && cic) cic(idle);
    };
  }, [ms]);
  return ready;
}

/** Cena de atividade montada só depois do primeiro instante (ver useDeferred). */
export function deferScene<P extends object>(Scene: (props: P) => ReactNode, ms?: number): (props: P) => ReactNode {
  return function Deferred(props: P) {
    return useDeferred(ms) ? <Scene {...props} /> : null;
  };
}
