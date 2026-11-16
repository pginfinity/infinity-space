import { create } from "zustand";
import { dist, rtSeatYaw, rtTableToWorld, type MapObject, type RtGameDef } from "@infinity/world";
import { currentPath, walkTo } from "../../../engine/movement.ts";
import { self } from "../../../world/registry.ts";
import { sendAct } from "../../registry.ts";
import { T } from "../strings.ts";

/**
 * Estado de interface das mesas de tempo real (o que não vem do servidor):
 * qual painel está aberto e o pedido de lugar em andamento (andando até a cabeceira).
 */
interface DuelUi {
  open: string | null;
  pending: { id: string; seat: number } | null;
  notice: string | null;
}

export const useDuelUi = create<DuelUi>(() => ({ open: null, pending: null, notice: null }));

let timer: number | undefined;
let token = 0;

export function openDuel(id: string | null): void {
  if (!id) cancelDuelSeat();
  useDuelUi.setState({ open: id, notice: null });
}

export function cancelDuelSeat(): void {
  token++;
  window.clearInterval(timer);
  timer = undefined;
  if (useDuelUi.getState().pending) useDuelUi.setState({ pending: null });
}

/** Onde fica em pé quem joga no lado `seat`, e para onde olha. */
export function duelStand(table: MapObject, def: RtGameDef<unknown>, seat: number) {
  const p = rtTableToWorld(table, 0, (seat === 0 ? 1 : -1) * (def.L / 2 + def.stand));
  return { point: p, yaw: rtSeatYaw(table, seat, def.L / 2) };
}

/** Pede o lugar: anda até a cabeceira daquele lado, vira para a mesa e avisa o servidor. */
export function requestDuelSeat(id: string, table: MapObject, def: RtGameDef<unknown>, seat: number): void {
  cancelDuelSeat();
  useDuelUi.setState({ notice: null });
  const { point, yaw } = duelStand(table, def, seat);
  const my = token;
  const arrive = () => {
    if (my !== token) return;
    cancelDuelSeat();
    self.yaw = yaw;
    sendAct(id, "sit", { seat });
  };
  if (dist(self, point) < 0.5) {
    arrive();
    return;
  }
  let arrived = false;
  const ok = walkTo(point, () => {
    arrived = true;
    arrive();
  });
  if (!ok && !arrived) {
    useDuelUi.setState({ notice: T.duel.noPath });
    return;
  }
  if (arrived) return;
  useDuelUi.setState({ pending: { id, seat } });
  const started = performance.now();
  timer = window.setInterval(() => {
    if (my !== token) return;
    if (!currentPath() || performance.now() - started > 25_000) {
      cancelDuelSeat();
      useDuelUi.setState({ notice: T.duel.tooFar });
    }
  }, 250);
}

export function leaveDuel(id: string): void {
  sendAct(id, "stand");
}
