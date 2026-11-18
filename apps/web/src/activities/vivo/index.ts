import { Tv } from "lucide-react";
import { registerActivity } from "../registry.ts";
import { registerCommand } from "../../presence/store.ts";
import { sendInfo } from "../../net/session.ts";
import { avatarRig } from "../../avatar/hands.ts";
import "./clock.ts";
import "./sounds.ts";
import { heldClient } from "./held.tsx";
import { copaClient } from "./copa.tsx";
import { plantsClient, wiltOverride } from "./plants.tsx";
import { orbiClient } from "./orbi.tsx";
import { jukeboxClient } from "./jukebox.tsx";
import { telescopeClient } from "./telescope.tsx";
import { goToTv, tvClient } from "./tv.tsx";
import { music } from "./music.ts";
import { T } from "./strings.ts";

/** Pacote "vivo": a estação viva (itens na mão, copa, plantas, Orbi, jukebox, telescópio, TV do lounge). */
registerActivity(heldClient);
registerActivity(copaClient);
registerActivity(plantsClient);
registerActivity(orbiClient);
registerActivity(jukeboxClient);
registerActivity(telescopeClient);
registerActivity(tvClient);
registerCommand({ key: "tv-lounge", label: T.tv.command, hint: T.tv.commandHint, keywords: "tv video youtube assistir junto lounge filme happy hour", icon: Tv, run: goToTv });

// Gancho de testes, só em desenvolvimento: põe qualquer item da lista na mão e inspeciona avatares.
if (import.meta.env.DEV) {
  Object.assign(window, {
    __vivo: {
      hold: (item: string) => sendInfo({ held: item }),
      rig: avatarRig,
      wilt: (id: string, w: number | null) => (w === null ? wiltOverride.delete(id) : wiltOverride.set(id, w)),
      musicLevel: () => music.level,
    },
  });
}
