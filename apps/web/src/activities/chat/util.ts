import { useEffect, useRef } from "react";
import { addAfterEffect, useThree, type RootState } from "@react-three/fiber";
import { pointInPolygon, type Vec2 } from "@infinity/world";
import { useApp } from "../../state/store.ts";
import { sampleRemote, self, type Pose } from "../../world/registry.ts";
import { world } from "../../world/world.ts";

/** Utilidades do pacote "chat" no cliente. */

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

/** Altura do piso (o palco do auditório é mais alto). Mesma regra dos avatares. */
let raised: Array<{ poly: Vec2[]; y: number }> | null = null;
export function groundY(x: number, z: number): number {
  raised ??= world().map.floors.filter((f) => (f.elevation ?? 0) > 0.05).map((f) => ({ poly: f.polygon, y: f.elevation! }));
  for (const r of raised) if (pointInPolygon({ x, z }, r.poly)) return r.y;
  return 0;
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

/** Digitando num campo? (atalhos de tecla não valem) */
export function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
}

/** Foca depois que a tecla que abriu o painel terminou (senão o "c" vai parar no campo). */
export function focusSoon(el: HTMLElement | null | undefined): () => void {
  const id = window.setTimeout(() => el?.focus({ preventScroll: true }), 40);
  return () => window.clearTimeout(id);
}

const timeFmt = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const fullFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeStyle: "short" });
const dayFmt = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "numeric", month: "short" });
const shortDayFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });

/** "14:32" */
export const timeOf = (at: number) => timeFmt.format(at);
/** "domingo, 16 de novembro de 2026 às 14:32" */
export const fullTimeOf = (at: number) => fullFmt.format(at);

/** Dia local (para separar as mensagens por dia). */
export function dayKey(at: number): number {
  const d = new Date(at);
  return d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate();
}

/** "Hoje", "Ontem" ou "seg., 10 de nov." */
export function dayLabel(at: number, now: number, today: string, yesterday: string): string {
  const k = dayKey(at);
  if (k === dayKey(now)) return today;
  if (k === dayKey(now - 86_400_000)) return yesterday;
  return dayFmt.format(at);
}

/** Na lista de conversas: hora se for hoje, "Ontem" ou a data curta. */
export function whenShort(at: number, now: number, yesterday: string): string {
  const k = dayKey(at);
  if (k === dayKey(now)) return timeOf(at);
  if (k === dayKey(now - 86_400_000)) return yesterday;
  return shortDayFmt.format(at);
}

/** Link seguro: só http e https. */
export function safeHref(href: string): string | null {
  try {
    const u = new URL(href);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}
