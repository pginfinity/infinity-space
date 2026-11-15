import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./i18n/index.ts";
import "./styles.css";
import { App } from "./App.tsx";

// Gancho de inspeção para testes automatizados, só em desenvolvimento.
if (import.meta.env.DEV) {
  void Promise.all([
    import("./state/store.ts"),
    import("./world/registry.ts"),
    import("./engine/movement.ts"),
    import("./engine/interact.ts"),
    import("./world/world.ts"),
    import("./media/rtc.ts"),
  ]).then(
    ([store, registry, movement, interact, w, media]) => {
      Object.assign(window, {
        __infinity: {
          store: store.useApp,
          self: registry.self,
          sampleRemote: registry.sampleRemote,
          walkTo: movement.walkTo,
          interact: interact.useInteract,
          world: w.world,
          media: { state: media.useMedia, audio: media.subscribedAudio },
        },
      });
    },
  );
}

const root = createRoot(document.getElementById("root")!);

// Galeria de móveis, só em desenvolvimento: ?galeria=1
if (import.meta.env.DEV && new URLSearchParams(location.search).has("galeria")) {
  void import("./scene/furniture/Gallery.tsx").then(({ default: Gallery }) => root.render(<Gallery />));
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
