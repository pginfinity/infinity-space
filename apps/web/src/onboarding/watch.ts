import { useEffect } from "react";
import { useApp } from "../state/store.ts";
import { useMedia } from "../media/rtc.ts";
import { useChat } from "../activities/chat/store.ts";
import { usePresence } from "../presence/store.ts";
import { callsQuiet } from "../activities/presenca/events.ts";
import { currentEmote, self } from "../world/registry.ts";
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

    // Andar: 3 m a partir de onde estava quando a lista abriu. Emote, sentar e foco: olhados junto.
    const from = { x: self.x, z: self.z };
    const poll = window.setInterval(() => {
      if (walked(from, self)) completeStep("andar");
      const me = useApp.getState().selfId;
      if (me && currentEmote(me)) completeStep("emote");
      if (self.anim === "sit") completeStep("sentar");
      if (callsQuiet()) completeStep("status");
    }, 250);
    offs.push(() => window.clearInterval(poll));

    // Microfone e tela.
    const media = (s: { mic: boolean; screen: boolean }) => {
      if (s.mic) completeStep("mic");
      if (s.screen) completeStep("tela");
    };
    media(useMedia.getState());
    offs.push(useMedia.subscribe(media));

    // Chat.
    offs.push(useChat.subscribe((s) => s.open && completeStep("chat")));

    // Chamar alguém (o chamado saiu).
    offs.push(usePresence.subscribe((s) => s.callOut && completeStep("chamar")));

    // Abrir um jogo de mesa.
    offs.push(useApp.subscribe((s) => s.activeGame && completeStep("jogo")));

    // Trocar de lente.
    const lens = useApp.getState().lens;
    offs.push(useApp.subscribe((s) => s.lens !== lens && completeStep("lente")));

    return () => offs.forEach((f) => f());
  }, [active]);
}
