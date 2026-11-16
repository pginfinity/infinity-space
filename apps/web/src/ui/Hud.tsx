import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "motion/react";
import { clsx } from "clsx";
import { Bot, Box, CircleHelp, LocateFixed, LogOut, Map as MapIcon, MoreHorizontal, Settings2, Smile, Users } from "lucide-react";
import { EMOTES, type Lens } from "@infinity/world";
import { useApp } from "../state/store.ts";
import { doEmote, EMOTE_INFO } from "../engine/emotes.ts";
import { Logo } from "./Logo.tsx";
import { PeoplePanel } from "./PeoplePanel.tsx";
import { AvatarFace } from "./AvatarFace.tsx";
import { Minimap } from "./Minimap.tsx";
import { InteractPrompt, Toasts } from "./WorldOverlays.tsx";
import { MediaControls } from "./MediaControls.tsx";
import { ScreenShares } from "./ScreenShares.tsx";
import { ActivitiesOverlay } from "../activities/index.tsx";
import { SettingsPanel } from "./SettingsPanel.tsx";
import { ChatDockButton, setChatOpen, useChatOpen } from "../activities/chat/dock.tsx";
import { PresenceDock } from "../presence/Dock.tsx";
import { openShortcuts, ShortcutsSheet, startTour, Tutorial } from "../onboarding/index.ts";
import { HudStacks } from "./HudStack.tsx";

/** Camada de interface sobre o mundo. */
export function Hud() {
  const { t } = useTranslation();
  const zoneName = useApp((s) => s.zoneName);
  const players = useApp((s) => s.players);
  const lens = useApp((s) => s.lens);
  const peopleOpen = useApp((s) => s.peopleOpen);
  const { setLens, togglePeople, leave } = useApp.getState();
  const [emotesOpen, setEmotesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const chatOpen = useChatOpen();
  const openSettings = (v: boolean) => {
    setSettingsOpen(v);
    if (v) {
      togglePeople(false);
      setChatOpen(false);
    }
  };
  // Chat e ajustes ocupam o mesmo lugar: abrir o chat (doca ou tecla C) fecha os ajustes.
  useEffect(() => {
    if (chatOpen) setSettingsOpen(false);
  }, [chatOpen]);
  // A busca (Ctrl+K) e outros pacotes pedem os ajustes por evento.
  useEffect(() => {
    const open = () => {
      setSettingsOpen(true);
      useApp.getState().togglePeople(false);
      setChatOpen(false);
    };
    window.addEventListener("infinity:settings", open);
    return () => window.removeEventListener("infinity:settings", open);
  }, []);
  const list = Object.values(players);

  return (
    <div className="pointer-events-none absolute inset-0 z-10 select-none">
      {/* Topo: marca e onde você está. */}
      <div className="glass pointer-events-auto absolute left-3 top-3 flex items-center gap-3 rounded-full py-2 pl-3 pr-4">
        <Logo size="sm" />
        <span className="h-4 w-px bg-offwhite/15" />
        <span className="max-w-[40vw] truncate text-sm text-offwhite/90" aria-live="polite">
          {zoneName}
        </span>
      </div>

      {/* Topo direito: quem está online. */}
      <button
        type="button"
        onClick={() => togglePeople()}
        aria-expanded={peopleOpen}
        data-tour-target="pessoas"
        className="glass pointer-events-auto absolute right-3 top-3 flex items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-4 transition hover:border-offwhite/25"
      >
        <span className="flex -space-x-2">
          {list.slice(0, 4).map((p) => (
            <AvatarFace key={p.id} look={p.look} size={26} className="rounded-full ring-2 ring-space" />
          ))}
        </span>
        <span className="text-sm text-offwhite/90">{t("hud.online", { count: list.length })}</span>
      </button>

      {/* Pilhas da esquerda: avisos e cartões dos pacotes se empilham aqui sem se cobrir. */}
      <HudStacks />
      <AnimatePresence>{peopleOpen && !settingsOpen && <PeoplePanel />}</AnimatePresence>
      <AnimatePresence>{settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}</AnimatePresence>
      {!peopleOpen && !settingsOpen && !chatOpen && <Minimap />}
      <Toasts />
      <ScreenShares />
      <ActivitiesOverlay />
      <InteractPrompt />
      <Tutorial />
      <ShortcutsSheet />

      {/* Barra de emotes, aberta pela doca. */}
      <AnimatePresence>
        {emotesOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="glass pointer-events-auto absolute bottom-[calc(max(12px,env(safe-area-inset-bottom))+64px)] left-1/2 flex -translate-x-1/2 gap-1 rounded-2xl p-1.5"
            role="toolbar"
            aria-label="Emotes"
          >
            {EMOTES.map((e, i) => (
              <button
                key={e}
                type="button"
                onClick={() => doEmote(e)}
                title={`${EMOTE_INFO[e].label} (${i + 1})`}
                className="group flex w-14 flex-col items-center gap-0.5 rounded-xl py-1.5 transition-colors hover:bg-offwhite/10"
              >
                <span className="text-xl transition-transform group-hover:scale-125">{EMOTE_INFO[e].emoji}</span>
                <span className="text-[10px] text-slate">{EMOTE_INFO[e].label}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Doca inferior. */}
      <div
        className="glass pointer-events-auto absolute bottom-[max(12px,env(safe-area-inset-bottom))] left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-2xl p-1.5"
        role="toolbar"
        aria-label="Controles"
      >
        <MediaControls />
        <span className="mx-1 h-6 w-px bg-offwhite/12" />
        {/* No celular o escritório é 2D: a troca de lente fica no menu "Mais" das telas maiores. */}
        <div className="hidden items-center sm:flex">
          <LensSwitch lens={lens} onChange={setLens} label={t("hud.lensHint")} />
          <span className="mx-1 h-6 w-px bg-offwhite/12" />
        </div>
        <DockButton label="Emotes (1 a 8)" onClick={() => setEmotesOpen((v) => !v)} active={emotesOpen}>
          <Smile className="size-[18px]" />
        </DockButton>
        <PresenceDock />
        <div className="hidden sm:contents">
          <DockButton label={t("hud.recenter")} onClick={() => window.dispatchEvent(new Event("infinity:recenter"))}>
            <LocateFixed className="size-[18px]" />
          </DockButton>
        </div>
        <ChatDockButton />
        <DockButton
          tour="pessoas"
          label={t("hud.people")}
          onClick={() => {
            setSettingsOpen(false);
            togglePeople();
          }}
          active={peopleOpen && !settingsOpen}
        >
          <Users className="size-[18px]" />
        </DockButton>
        <div className="hidden sm:contents">
          <DockButton label="Áudio e vídeo" onClick={() => openSettings(!settingsOpen)} active={settingsOpen}>
            <Settings2 className="size-[18px]" />
          </DockButton>
          <DockButton label={t("hud.leave")} onClick={leave}>
            <LogOut className="size-[18px]" />
          </DockButton>
        </div>
        <MoreMenu
          items={[
            { label: lens === "3d" ? "Ver em 2D" : "Ver em 3D", icon: lens === "3d" ? <MapIcon className="size-4" /> : <Box className="size-4" />, run: () => setLens(lens === "3d" ? "2d" : "3d") },
            { label: t("hud.recenter"), icon: <LocateFixed className="size-4" />, run: () => window.dispatchEvent(new Event("infinity:recenter")) },
            { label: "Áudio e vídeo", icon: <Settings2 className="size-4" />, run: () => openSettings(true) },
            { label: t("tour.replay"), icon: <Bot className="size-4" />, run: startTour },
            { label: t("shortcuts.title"), icon: <CircleHelp className="size-4" />, run: openShortcuts },
            { label: t("hud.leave"), icon: <LogOut className="size-4" />, run: leave },
          ]}
        />
      </div>

      <div className="absolute bottom-[max(18px,env(safe-area-inset-bottom))] left-4 hidden max-w-[30ch] text-xs leading-relaxed text-slate/90 lg:block">
        <p>{lens === "3d" ? t("hud.controls3d") : t("hud.controls")}</p>
        <button type="button" onClick={openShortcuts} className="pointer-events-auto -ml-1 mt-1 flex items-center gap-1.5 rounded-md px-1 py-0.5 text-slate transition-colors hover:text-offwhite">
          <CircleHelp className="size-3.5" />
          {t("shortcuts.open")}
          <kbd className="rounded bg-offwhite/8 px-1 font-sans text-[10px] text-offwhite/80 ring-1 ring-offwhite/12">?</kbd>
        </button>
      </div>
    </div>
  );
}

function LensSwitch({ lens, onChange, label }: { lens: Lens; onChange: (l: Lens) => void; label: string }) {
  return (
    <div className="flex rounded-xl bg-deep/60 p-0.5" role="radiogroup" aria-label={label} title={label} data-tour-target="lente">
      {(["2d", "3d"] as const).map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={lens === l}
          onClick={() => onChange(l)}
          className={clsx(
            "flex items-center gap-1.5 rounded-[10px] px-3 py-2 font-display text-xs font-medium uppercase tracking-[0.08em] transition-colors",
            lens === l ? "bg-signal text-space" : "text-slate hover:text-offwhite",
          )}
        >
          {l === "2d" ? <MapIcon className="size-4" /> : <Box className="size-4" />}
          {l}
        </button>
      ))}
    </div>
  );
}

function DockButton({ label, onClick, active, tour, children }: { label: string; onClick: () => void; active?: boolean; tour?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-tour-target={tour}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={clsx("grid size-10 place-items-center rounded-xl transition-colors", active ? "bg-offwhite/12 text-offwhite" : "text-offwhite/80 hover:bg-offwhite/8 hover:text-offwhite")}
    >
      {children}
    </button>
  );
}

/** Menu "Mais" da doca em telas estreitas (celular). */
function MoreMenu({ items }: { items: { label: string; icon: ReactNode; run: () => void }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative sm:hidden">
      <DockButton label="Mais opções" onClick={() => setOpen((v) => !v)} active={open}>
        <MoreHorizontal className="size-[18px]" />
      </DockButton>
      {open && (
        <div role="menu" className="absolute bottom-12 right-0 w-52 rounded-2xl border border-offwhite/10 bg-space p-1.5 shadow-2xl">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                it.run();
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-offwhite/8"
            >
              <span className="text-slate">{it.icon}</span>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
