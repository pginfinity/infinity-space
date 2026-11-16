import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { OrbiFace } from "./OrbiFace.tsx";
import { closeShortcuts, startTour, toggleShortcuts, TOUCH, useTour } from "./store.ts";

/**
 * Lista de atalhos (tecla ? ou "Atalhos" na busca e nos ajustes). Só teclas que existem de verdade:
 * ao criar um atalho novo, acrescente aqui.
 */

const MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

type Row = { item: string; keys: string[] };
const GROUPS: { key: string; rows: Row[] }[] = [
  {
    key: "move",
    rows: [
      { item: "walk", keys: ["W A S D", "↑ ← ↓ →"] },
      { item: "run", keys: ["Shift"] },
      { item: "click", keys: ["@click"] },
      { item: "rotate", keys: ["Q", "R"] },
      { item: "drag", keys: ["@drag"] },
    ],
  },
  {
    key: "voice",
    rows: [
      { item: "mic", keys: ["M"] },
      { item: "cam", keys: ["V"] },
      { item: "whisper", keys: ["B"] },
    ],
  },
  {
    key: "use",
    rows: [
      { item: "use", keys: ["E", "F"] },
      { item: "drop", keys: ["G"] },
      { item: "emotes", keys: ["1 – 8"] },
      { item: "greet", keys: ["T"] },
      { item: "call", keys: ["I"] },
    ],
  },
  {
    key: "nav",
    rows: [
      { item: "search", keys: [MAC ? "⌘ K" : "Ctrl K"] },
      { item: "chat", keys: ["C"] },
      { item: "lens", keys: ["L"] },
      { item: "esc", keys: ["Esc"] },
      { item: "help", keys: ["?"] },
    ],
  },
  {
    key: "games",
    rows: [
      { item: "play", keys: ["← →", "Espaço"] },
      { item: "pause", keys: ["P"] },
      { item: "leaveGame", keys: ["Esc"] },
    ],
  },
];

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-grid min-w-[22px] place-items-center rounded-md bg-offwhite/8 px-1.5 py-0.5 font-sans text-[11px] font-medium leading-4 text-offwhite ring-1 ring-offwhite/12">{children}</kbd>;
}

/** Tecla ? abre e fecha a lista (em qualquer layout de teclado; fora de campos de texto). */
export function useShortcutsKey(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (e.key === "?" && !e.repeat) {
        e.preventDefault();
        toggleShortcuts();
      } else if (e.key === "Escape" && useTour.getState().sheet) {
        closeShortcuts();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

export function ShortcutsSheet() {
  const open = useTour((s) => s.sheet);
  const { t } = useTranslation();
  useShortcutsKey();
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="sheet"
          className="pointer-events-auto absolute inset-0 z-40 grid place-items-center bg-deep/55 p-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={(e) => e.target === e.currentTarget && closeShortcuts()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="atalhos-titulo"
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.99 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            className="glass flex max-h-[min(720px,calc(100dvh-24px))] w-[min(780px,100%)] flex-col overflow-hidden rounded-[var(--radius-panel)] text-offwhite"
          >
            <header className="flex items-center gap-3 border-b border-offwhite/8 px-5 py-3.5">
              <h2 id="atalhos-titulo" className="font-display text-sm font-bold uppercase tracking-[0.12em]">
                {t("shortcuts.title")}
              </h2>
              {!TOUCH && <p className="hidden text-xs text-slate sm:block">{t("shortcuts.hint")}</p>}
              <button type="button" onClick={closeShortcuts} autoFocus aria-label={t("tour.close")} title={`${t("tour.close")} (Esc)`} className="ml-auto grid size-8 place-items-center rounded-lg text-slate transition-colors hover:bg-offwhite/8 hover:text-offwhite">
                <X className="size-4" />
              </button>
            </header>

            <div className="min-h-0 overflow-y-auto px-5 py-4">
              {TOUCH && (
                <section className="mb-5">
                  <h3 className="label-caps mb-2">{t("shortcuts.touchTitle")}</h3>
                  <ul className="space-y-1.5 text-sm text-offwhite/85">
                    {(t("shortcuts.touch", { returnObjects: true }) as string[]).map((line) => (
                      <li key={line} className="flex gap-2">
                        <span className="mt-2 size-1 shrink-0 rounded-full bg-signal" aria-hidden />
                        {line}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
                {GROUPS.map((g) => (
                  <section key={g.key}>
                    <h3 className="label-caps mb-1.5">{t(`shortcuts.groups.${g.key}`)}</h3>
                    <dl className="divide-y divide-offwhite/6">
                      {g.rows.map((r) => (
                        <div key={r.item} className="flex items-center justify-between gap-3 py-1.5">
                          <dt className="text-[13px] text-offwhite/85">{t(`shortcuts.items.${r.item}`)}</dt>
                          <dd className="flex shrink-0 items-center gap-1">
                            {r.keys.map((k, i) => (
                              <span key={k} className="flex items-center gap-1">
                                {i > 0 && <span className="text-[11px] text-slate">/</span>}
                                {k.startsWith("@") ? <span className="text-[11px] text-slate">{t(`shortcuts.keys.${k.slice(1)}`)}</span> : <Kbd>{k}</Kbd>}
                              </span>
                            ))}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ))}
              </div>
            </div>

            <footer className="flex items-center gap-3 border-t border-offwhite/8 px-5 py-3">
              <OrbiFace size={30} still />
              <p className="min-w-0 flex-1 text-xs text-slate">{t("tour.replayHint")}</p>
              <button
                type="button"
                onClick={() => {
                  closeShortcuts();
                  startTour();
                }}
                className="rounded-xl bg-offwhite/10 px-3.5 py-2 text-sm font-medium transition-colors hover:bg-offwhite/16"
              >
                {t("tour.replay")}
              </button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
