import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./i18n/index.ts";
import "./styles.css";
import { App } from "./App.tsx";

// Gancho de inspeção para testes automatizados, só em desenvolvimento.
if (import.meta.env.DEV) {
  void Promise.all([import("./state/store.ts"), import("./world/registry.ts")]).then(([store, registry]) => {
    Object.assign(window, { __infinity: { store: store.useApp, self: registry.self, sampleRemote: registry.sampleRemote } });
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
