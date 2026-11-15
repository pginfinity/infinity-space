import { create } from "zustand";
import { MonitorDown } from "lucide-react";

/**
 * Instalar como app (PWA): o Chrome/Edge avisa que dá para instalar com o evento
 * `beforeinstallprompt`, que chega logo no carregamento; guardamos para oferecer o botão.
 */

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const useInstall = create<{ event: InstallEvent | null }>(() => ({ event: null }));

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  useInstall.setState({ event: e as InstallEvent });
});
window.addEventListener("appinstalled", () => useInstall.setState({ event: null }));

/** Botão "Instalar o app", só quando o navegador permite e ainda não está instalado. */
export function InstallApp({ className }: { className?: string }) {
  const event = useInstall((s) => s.event);
  if (!event || window.matchMedia("(display-mode: standalone)").matches) return null;
  return (
    <button
      type="button"
      onClick={() => {
        void event.prompt();
        void event.userChoice.finally(() => useInstall.setState({ event: null }));
      }}
      className={`flex items-center gap-2 rounded-full border border-offwhite/12 px-3.5 py-2 text-xs text-offwhite/85 transition-colors hover:border-signal hover:text-offwhite ${className ?? ""}`}
    >
      <MonitorDown className="size-4" />
      Instalar o app no computador
    </button>
  );
}
