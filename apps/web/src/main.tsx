import { StrictMode } from "react";
import "./ui/install.tsx";
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
    import("./scene/tvs.ts"),
    import("./activities/registry.ts"),
    import("./net/session.ts"),
  ]).then(
    ([store, registry, movement, interact, w, media, tvs, acts, net]) => {
      Object.assign(window, {
        __infinity: {
          store: store.useApp,
          self: registry.self,
          sampleRemote: registry.sampleRemote,
          walkTo: movement.walkTo,
          interact: interact.useInteract,
          world: w.world,
          media: { state: media.useMedia, audio: media.subscribedAudio, debug: media.rtcDebug, processor: media.micProcessorName, screenStats: media.screenStats },
          tvs: { tvFor: tvs.tvFor, mesh: tvs.screenMesh },
          acts: { state: acts.useActs, send: acts.sendAct },
          // A mesma cópia do módulo que o app usa (importar /src/net/session.ts no teste pode criar outra).
          net: { sendInfo: net.sendInfo },
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
