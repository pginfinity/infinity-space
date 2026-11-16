import { useEffect } from "react";
import { useApp } from "../state/store.ts";
import { useMedia } from "../media/rtc.ts";
import { useChat } from "../activities/chat/store.ts";
import { usePresence } from "../presence/store.ts";
import { onActivate } from "../engine/interact.ts";
import { self } from "../world/registry.ts";
import { completeStep } from "./store.ts";
import { walked } from "./steps.ts";

/**
 * Observa o que a pessoa faz enquanto a lista de primeiros passos está na tela e marca os passos.
 * Nada disso sai do navegador (presença, não vigilância): é só para o checklist se marcar sozinho.
 */
export function useTourWatch(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const offs: Array<() => void> = [];

    // Andar: 3 m a partir de onde estava quando a lista abriu.
    const from = { x: self.x, z: self.z };
    const walk = window.setInterval(() => {
      if (walked(from, self)) completeStep("andar");
    }, 250);
    offs.push(() => window.clearInterval(walk));

    // Usar algo (E, F ou o botão do aviso).
    offs.push(onActivate(() => completeStep("usar")));

    // Microfone.
    const mic = (on: boolean) => on && completeStep("mic");
    mic(useMedia.getState().mic);
    offs.push(useMedia.subscribe((s) => mic(s.mic)));

    // Chat.
    offs.push(useChat.subscribe((s) => s.open && completeStep("chat")));

    // Encontrar alguém: lista de pessoas ou busca (Ctrl+K).
    offs.push(useApp.subscribe((s) => s.peopleOpen && completeStep("pessoas")));
    offs.push(usePresence.subscribe((s) => s.paletteOpen && completeStep("pessoas")));

    // Mapa ampliado (com o guia).
    const map = () => completeStep("mapa");
    window.addEventListener("infinity:map-opened", map);
    offs.push(() => window.removeEventListener("infinity:map-opened", map));

    // Trocar de lente.
    const lens = useApp.getState().lens;
    offs.push(useApp.subscribe((s) => s.lens !== lens && completeStep("lente")));

    return () => offs.forEach((f) => f());
  }, [active]);
}
