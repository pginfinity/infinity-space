import { create } from "zustand";
import type { CabGameId } from "@infinity/world";

/** Interface dos fliperamas (o que não vem no estado da atividade). */
export interface CabResult {
  game: CabGameId;
  score: number;
  rank: number | null;
  personalBest: boolean;
  record: boolean;
  rejected?: boolean;
}

interface CabUi {
  /** Máquina aberta (id do objeto). */
  open: string | null;
  /** Painel de recordes aberto. */
  board: boolean;
  run: { token: string; game: CabGameId; machine: string } | null;
  result: CabResult | null;
  busy: { machine: string; name: string; at: number } | null;
}

export const useCabUi = create<CabUi>(() => ({ open: null, board: false, run: null, result: null, busy: null }));

export function openCabinet(machine: string | null): void {
  useCabUi.setState({ open: machine, board: false, result: null, busy: null });
}

export function openBoard(open: boolean): void {
  useCabUi.setState({ board: open, open: open ? null : useCabUi.getState().open });
}
