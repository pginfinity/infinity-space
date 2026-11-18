import { Suspense, lazy } from "react";
import { AnimatePresence } from "motion/react";
import { create } from "zustand";
import { Orbit } from "lucide-react";
import i18n from "../../i18n/index.ts";
import { registerActivity } from "../registry.ts";
import { registerCommand } from "../../presence/store.ts";

/**
 * "Agora no espaço": painel pequeno com o céu real do momento (fase da Lua, a estação no Sol ou na
 * sombra da Terra, chuva de meteoros, próximos eclipses e planetas). Abre pela busca (Ctrl+K).
 * Só cliente: nada passa pelo servidor. O painel (e a astronomia) só baixa quando abre.
 */

const useSpaceNow = create<{ open: boolean }>(() => ({ open: false }));

export function openSpaceNow(): void {
  useSpaceNow.setState({ open: true });
}

export function closeSpaceNow(): void {
  useSpaceNow.setState({ open: false });
}

const Panel = lazy(() => import("./Panel.tsx"));

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

registerActivity({ name: "espaco/agora", Overlay: SpaceNowOverlay });
registerCommand({
  key: "agora-no-espaco",
  label: i18n.t("espaco.command"),
  hint: i18n.t("espaco.commandHint"),
  keywords: "espaco ceu lua sol estrela estrelas planeta planetas eclipse meteoro meteoros chuva astronomia terra sombra fase",
  icon: Orbit,
  run: openSpaceNow,
});
