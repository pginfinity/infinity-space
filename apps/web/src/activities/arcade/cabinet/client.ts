import { CAB_GAMES, CAB_KIND, cabFmt, cabGameOfVariant, type CabGameId } from "@infinity/world";
import { world } from "../../../world/world.ts";
import { self } from "../../../world/registry.ts";
import { useApp } from "../../../state/store.ts";
import { toast } from "../../../ui/toasts.ts";
import { sfx } from "../../../audio/sfx.ts";
import type { ActivityClient } from "../../registry.ts";
import { CabinetOverlay } from "./Cabinet.tsx";
import { CabinetScreens } from "./screens.tsx";
import { openBoard, openCabinet, useCabUi, type CabResult } from "./store.ts";
import { T } from "../strings.ts";

/** Fliperamas: E na máquina abre a tela do jogo; E no placar abre os recordes. */
export const cabinets: ActivityClient = {
  name: "arcade/fliperamas",
  kinds: [CAB_KIND],
  objects: ["arcade", "arcade-board"],
  label: (o) => (o.type === "arcade" ? T.cab.play(CAB_GAMES[cabGameOfVariant(o.variant)].name) : T.cab.seeRecords),
  use: (o) => {
    if (o.type === "arcade") openCabinet(o.id);
    else openBoard(true);
  },
  onEvent: (e) => {
    const d = (e.data ?? {}) as Record<string, unknown>;
    if (e.ev === "run" && typeof d.token === "string" && typeof d.machine === "string") {
      useCabUi.setState({ run: { token: d.token, game: d.game as CabGameId, machine: d.machine } });
    } else if (e.ev === "busy" && typeof d.machine === "string") {
      useCabUi.setState({ busy: { machine: d.machine, name: String(d.name ?? ""), at: Date.now() } });
    } else if (e.ev === "result") {
      useCabUi.setState({ result: d as unknown as CabResult });
    } else if (e.ev === "record") {
      // recorde novo: avisa quem está no Arcade (quem bateu já vê na tela do jogo)
      if (e.from === useApp.getState().selfId) return;
      if (world().zones.zoneAt(self)?.id !== "arcade") return;
      toast(T.cab.recordToast(String(d.name ?? ""), String(d.title ?? ""), cabFmt(Number(d.score) || 0)));
      sfx("cab-record", { volume: 0.4 });
    }
  },
  Overlay: CabinetOverlay,
  Scene: CabinetScreens,
};

// Gancho de inspeção para os testes de ponta a ponta (só em desenvolvimento).
if (import.meta.env.DEV) {
  const w = window as unknown as { __arcade?: Record<string, unknown> };
  w.__arcade = { ...(w.__arcade ?? {}), cab: () => useCabUi.getState() };
}
