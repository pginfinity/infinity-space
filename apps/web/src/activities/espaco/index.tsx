import { Suspense, lazy } from "react";
import { AnimatePresence } from "motion/react";
import { create } from "zustand";
import { Orbit, Waypoints } from "lucide-react";
import i18n from "../../i18n/index.ts";
import { registerActivity } from "../registry.ts";
import { registerCommand } from "../../presence/store.ts";
import { useSkyPick } from "../../scene/sky/pick.ts";
import { toggleConstellations } from "../../scene/sky/constellations.ts";

/**
 * "Agora no espaço": painel pequeno com o céu real do momento (fase da Lua, a estação no Sol ou na
 * sombra da Terra, chuva de meteoros, próximos eclipses e planetas). Abre pela busca (Ctrl+K).
 * Só cliente: nada passa pelo servidor. O painel (e a astronomia) só baixa quando abre.
 * Clicar num astro no céu (nas duas lentes) abre o cartão dele; clicar num meteoro faz um pedido.
 */

const useSpaceNow = create<{ open: boolean }>(() => ({ open: false }));

export function openSpaceNow(): void {
  useSpaceNow.setState({ open: true });
}

export function closeSpaceNow(): void {
  useSpaceNow.setState({ open: false });
}

const Panel = lazy(() => import("./Panel.tsx"));
const Astro = lazy(() => import("./Astro.tsx"));
const closeAstro = () => useSkyPick.setState({ pick: null });

function SpaceNowOverlay() {
  const open = useSpaceNow((s) => s.open);
  return (
    <AnimatePresence>
      {open && (
        <Suspense key="agora-no-espaco" fallback={null}>
          <Panel onClose={closeSpaceNow} />
        </Suspense>
      )}
    </AnimatePresence>
  );
}

function AstroOverlay() {
  const pick = useSkyPick((s) => s.pick);
  return (
    <AnimatePresence>
      {pick && (
        <Suspense key={pick.at} fallback={null}>
          <Astro pick={pick} onClose={closeAstro} />
        </Suspense>
      )}
    </AnimatePresence>
  );
}

registerActivity({ name: "espaco/agora", Overlay: SpaceNowOverlay });
registerActivity({ name: "espaco/astro", Overlay: AstroOverlay });
registerCommand({
  key: "agora-no-espaco",
  label: i18n.t("espaco.command"),
  hint: i18n.t("espaco.commandHint"),
  keywords: "espaco ceu lua sol estrela estrelas planeta planetas eclipse meteoro meteoros chuva astronomia terra sombra fase",
  icon: Orbit,
  run: openSpaceNow,
});
registerCommand({
  key: "constelacoes",
  label: i18n.t("espaco.commandConstelacoes"),
  hint: i18n.t("espaco.commandConstelacoesHint"),
  keywords: "constelacoes constelacao estrelas ceu nomes linhas orion cruzeiro escorpiao",
  icon: Waypoints,
  run: toggleConstellations,
});
