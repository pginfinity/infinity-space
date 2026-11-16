import { Bot, Keyboard } from "lucide-react";
import i18n from "../i18n/index.ts";
import { registerCommand } from "../presence/store.ts";
import { openShortcuts, startTour } from "./store.ts";

/** Primeiros passos e atalhos também pela busca (Ctrl+K). */
registerCommand({ key: "primeiros-passos", label: i18n.t("tour.replay"), hint: i18n.t("tour.replayHint"), keywords: "tutorial ajuda orbi comecar inicio boas vindas", icon: Bot, run: startTour });
registerCommand({ key: "atalhos", label: i18n.t("shortcuts.open"), keywords: "teclas teclado ajuda comandos atalho", icon: Keyboard, shortcut: "?", run: openShortcuts });

export { Tutorial } from "./Tutorial.tsx";
export { ShortcutsSheet } from "./Shortcuts.tsx";
export { openShortcuts, startTour } from "./store.ts";
