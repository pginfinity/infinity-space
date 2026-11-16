import { useEffect, useRef } from "react";
import { wallBetween, type Vec2 } from "@infinity/world";
import { self } from "../../world/registry.ts";
import { sitAt, walkTo } from "../../engine/movement.ts";
import { world } from "../../world/world.ts";
import type { MesasDesk } from "@infinity/world";

/** Utilidades pequenas do pacote "mesas" no cliente. */

/** Você está a até `range` metros do ponto, sem parede no meio? (mesma conta do servidor) */
export function selfNear(p: Vec2, range: number): boolean {
  return Math.hypot(p.x - self.x, p.z - self.z) <= range && !wallBetween(world().map.walls, self, p);
}

/** Anda até a cadeira da mesa e senta. */
export function goSit(d: MesasDesk): void {
  const sit = () => {
    if (d.chairId) sitAt(d.seat, d.seatYaw, d.chairId);
  };
  if (Math.hypot(d.seat.x - self.x, d.seat.z - self.z) < 0.45) sit();
  else walkTo(d.seat, sit);
}

/** Esc fecha o painel mesmo com o foco fora dele. */
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

/** Foca depois que a tecla que abriu o painel terminou (senão o "e" do E vai parar no campo). */
export function focusSoon(el: HTMLElement | null | undefined): () => void {
  const id = window.setTimeout(() => el?.focus(), 40);
  return () => window.clearTimeout(id);
}
