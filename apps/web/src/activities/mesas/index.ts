import { registerActivity } from "../registry.ts";
import { mesasClient } from "./client.tsx";

/** Pacote "mesas": check-in nas mesas rotativas, mesas fixas, objetos pessoais e recados na mesa. */
registerActivity(mesasClient);

// Gancho de inspeção para os testes (só em desenvolvimento): o que é só seu e as cópias desenhadas.
if (import.meta.env.DEV) {
  void Promise.all([import("./state.ts"), import("./scene.tsx")]).then(([st, sc]) => {
    Object.assign(window, { __mesas: { ui: st.useMesas, counts: () => Object.fromEntries(sc.drawn) } });
  });
}
