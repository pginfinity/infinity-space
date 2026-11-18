import { Timer } from "lucide-react";
import { FOCO_ID, FOCO_KIND } from "@infinity/world";
import { registerActivity, sendAct } from "../registry.ts";
import { registerSynth } from "../../audio/sfx.ts";
import { registerCommand } from "../../presence/store.ts";
import { FocoHud } from "./hud.tsx";
import { FocoScene } from "./scene.tsx";
import { autoFocusOn, goToTable, mySeat, mySeatOnServer, startFocoTable } from "./mesa.ts";
import { T } from "./strings.ts";

/**
 * Pacote "foco": a mesa de foco do corredorzinho Foco, com Pomodoro compartilhado
 * (servidor: apps/server/src/activities/foco; regras: packages/world/src/activities/foco).
 * Sentar numa cadeira da mesa entra no ciclo do grupo; levantar sai.
 */

registerActivity({
  name: "foco/pomodoro",
  kinds: [FOCO_KIND],
  Overlay: FocoHud,
  Scene: FocoScene,
});

startFocoTable();

registerCommand({ key: "mesa-de-foco", label: T.command, hint: T.commandHint, keywords: "pomodoro foco concentrar silencio timer relogio mesa estudar", icon: Timer, run: goToTable });

// Volta ao foco: dois toques suaves subindo (a pausa usa o "daily-tempo", que já existe).
// Sintetizado de propósito, sem arquivo: não entra no sounds.json.
registerSynth("foco-volta", (c, out) => {
  const t = c.currentTime;
  [587, 880].forEach((f, i) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.value = f;
    const at = t + i * 0.16;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.2, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.7);
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + 0.75);
  });
});

// Gancho de testes, só em desenvolvimento.
if (import.meta.env.DEV) {
  Object.assign(window, {
    __foco: {
      mySeat,
      mySeatOnServer,
      autoFocus: autoFocusOn,
      /** Pula para 2 s antes do fim da fase (o servidor só aceita fora de produção). */
      skip: () => sendAct(FOCO_ID, "dev-skip"),
    },
  });
}
