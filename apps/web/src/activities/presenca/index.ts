import { CHAMADO_KIND, SEGUIR_KIND } from "@infinity/world";
import { registerActivity } from "../registry.ts";
import { Palette } from "../../presence/Palette.tsx";
import { PipLayer } from "../../presence/PipView.tsx";
import { startPip, usePip } from "../../presence/pip.ts";
import { awayIsAuto, setAwayMinuteMs, startPresenceStatus } from "../../presence/status.ts";
import { usePresence } from "../../presence/store.ts";
import { controlMode } from "../../presence/controller.ts";
import { onCallEvent, onFollowEvent, resetOnReconnect } from "./events.ts";
import { PresenceOverlay } from "./Overlay.tsx";
import "./synth.ts";

/**
 * Pacote "presenca": achar e chamar pessoas. Chamar (com teleporte só depois do convite aceito),
 * seguir com aceite, busca e comandos (Ctrl+K), "Ausente" automático escolhido por cada um e a
 * janela flutuante com os vídeos. A lógica fica em `apps/web/src/presence/`; aqui só se liga
 * ao registro de atividades.
 */
registerActivity({ name: "presenca/chamado", kinds: [CHAMADO_KIND], onEvent: onCallEvent, Overlay: PresenceOverlay });
registerActivity({ name: "presenca/seguir", kinds: [SEGUIR_KIND], onEvent: onFollowEvent });
registerActivity({ name: "presenca/busca", Overlay: Palette });
registerActivity({ name: "presenca/janela", Overlay: PipLayer });

// Uma vez só (o recarregamento a quente do Vite reavalia o módulo).
const flag = window as unknown as { __presencaOn?: boolean };
if (!flag.__presencaOn) {
  flag.__presencaOn = true;
  startPresenceStatus();
  startPip();
  resetOnReconnect();
}

// Gancho de inspeção para testes automatizados, só em desenvolvimento.
if (import.meta.env.DEV) {
  Object.assign(window, {
    __presenca: { store: usePresence, pip: usePip, setAwayMinuteMs, awayIsAuto, controlMode },
  });
}
