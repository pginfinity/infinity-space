import { registerActivity } from "../registry.ts";
import { registerChatInterceptor } from "../chat/intercept.ts";
import "./sounds.ts";
import { easterClient } from "./client.tsx";
import { konamiReward, startKonami } from "./konami.ts";
import { chatSpell, setTvNow, testing, useParchment } from "./state.ts";

/**
 * Pacote "easter": homenagens discretas a filmes e séries (arte original, sem personagens nem logos).
 * Tudo é do próprio cliente: nada passa pelo servidor e ninguém é interrompido.
 * Onde fica cada uma está em `packages/world/src/map/estacao.ts` (bloco "Homenagens").
 */
registerActivity(easterClient);
startKonami();
registerChatInterceptor(chatSpell);

// Gancho de testes, só em desenvolvimento: forçar sorteios, adiantar o relógio das TVs, ver o pergaminho.
if (import.meta.env.DEV) {
  Object.assign(window, {
    __easter: {
      parchment: useParchment,
      seed: testing.seed,
      force: testing.force,
      tvNow: setTvNow,
      konami: konamiReward,
    },
  });
}
