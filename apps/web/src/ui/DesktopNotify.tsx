import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "motion/react";
import { BellRing } from "lucide-react";
import { setMediaSettings, useMediaSettings } from "../media/settings.ts";
import { callsQuiet } from "../activities/presenca/events.ts";
import { useTour } from "../onboarding/store.ts";
import { InStack } from "./HudStack.tsx";

/**
 * Aviso do computador (fora do navegador) quando o Space está em segundo plano: aba escondida, janela
 * minimizada ou outra janela na frente. Vale para chamado, menção, conversa e batida na porta. Com a
 * janela na frente, os avisos de dentro bastam; em Foco ou numa sala de Não perturbe, nada aparece.
 */

/** No celular o `new Notification` não existe (só pelo service worker), então fica de fora. */
export const desktopSupported = typeof Notification !== "undefined" && !(typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches);

export function desktopPermission(): NotificationPermission | "unsupported" {
  return desktopSupported ? Notification.permission : "unsupported";
}

/** Liga (o navegador só pergunta a permissão depois de um clique) ou desliga. Devolve se ficou ligado. */
export async function setDesktopNotify(on: boolean): Promise<boolean> {
  if (!on || !desktopSupported) {
    setMediaSettings({ notify: false });
    return false;
  }
  const p = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  setMediaSettings({ notify: p === "granted" });
  return p === "granted";
}

export function notifyDesktop(tag: string, body: string): void {
  if (!desktopSupported || Notification.permission !== "granted" || useMediaSettings.getState().notify !== true) return;
  if ((document.visibilityState === "visible" && document.hasFocus()) || callsQuiet()) return;
  try {
    // Sem som: o Space já toca o dele. A mesma `tag` troca o aviso anterior em vez de empilhar.
    const n = new Notification("Infinity Space", { body, tag, icon: "/icons/icon-192.png", silent: true });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // navegador que só avisa pelo service worker: fica sem
  }
}

/** Pergunta uma vez, um tempo depois de entrar e fora dos primeiros passos, se a pessoa quer os avisos. */
export function NotifyOffer() {
  const { t } = useTranslation();
  const notify = useMediaSettings((s) => s.notify);
  const touring = useTour((s) => s.phase === "intro" || s.phase === "steps");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setReady(true), 30_000);
    return () => window.clearTimeout(id);
  }, []);
  const show = ready && !touring && notify === null && desktopSupported && Notification.permission !== "denied";
  return (
    <InStack side="top-left" order={3}>
      <AnimatePresence>
        {show && (
          <motion.div
            role="dialog"
            aria-labelledby="oferta-avisos"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="pointer-events-auto w-80 max-w-full rounded-2xl border border-offwhite/10 bg-space p-3.5 shadow-2xl"
          >
            <p id="oferta-avisos" className="flex items-center gap-2 text-sm font-medium">
              <BellRing className="size-4 shrink-0 text-slate" />
              {t("notify.title")}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-slate">{t("notify.body")}</p>
            <p className="mt-1 text-[11px] leading-snug text-slate/80">{t("notify.where")}</p>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => void setDesktopNotify(false)} className="rounded-lg px-3 py-1.5 text-xs text-slate hover:bg-offwhite/8 hover:text-offwhite">
                {t("notify.no")}
              </button>
              <button type="button" onClick={() => void setDesktopNotify(true)} className="rounded-lg bg-orange px-3 py-1.5 text-xs font-semibold text-offwhite transition hover:brightness-110">
                {t("notify.yes")}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </InStack>
  );
}
