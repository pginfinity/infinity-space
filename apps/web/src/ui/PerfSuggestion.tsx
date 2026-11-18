import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "motion/react";
import { Gauge } from "lucide-react";
import { acceptLight, keepQuality, usePerf } from "../scene/perfWatch.ts";
import { InStack } from "./HudStack.tsx";

/** Sugestão do modo leve quando o computador não aguenta o visual completo (ver scene/perfWatch.ts). */
export function PerfSuggestion() {
  const { t } = useTranslation();
  const suggest = usePerf((s) => s.suggest);
  return (
    <InStack side="top-left" order={2}>
      <AnimatePresence>
        {suggest && (
          <motion.div
            role="dialog"
            aria-labelledby="sugestao-leve"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="pointer-events-auto w-80 max-w-full rounded-2xl border border-offwhite/10 bg-space p-3.5 shadow-2xl"
          >
            <p id="sugestao-leve" className="flex items-center gap-2 text-sm font-medium">
              <Gauge className="size-4 shrink-0 text-slate" />
              {t("perf.title")}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-slate">{suggest.reason === "software" ? t("perf.software") : t("perf.slow", { fps: suggest.fps ?? "?" })}</p>
            <p className="mt-1 text-[11px] leading-snug text-slate/80">{t("perf.where")}</p>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={keepQuality} className="rounded-lg px-3 py-1.5 text-xs text-slate hover:bg-offwhite/8 hover:text-offwhite">
                {t("perf.keep")}
              </button>
              <button type="button" autoFocus onClick={acceptLight} className="rounded-lg bg-orange px-3 py-1.5 text-xs font-semibold text-offwhite transition hover:brightness-110">
                {t("perf.accept")}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </InStack>
  );
}
