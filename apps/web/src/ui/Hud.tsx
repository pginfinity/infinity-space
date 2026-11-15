import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence } from "motion/react";
import { clsx } from "clsx";
import { Box, LocateFixed, LogOut, Map as MapIcon, Users } from "lucide-react";
import type { Lens } from "@infinity/world";
import { useApp } from "../state/store.ts";
import { Logo } from "./Logo.tsx";
import { PeoplePanel } from "./PeoplePanel.tsx";
import { AvatarFace } from "./AvatarFace.tsx";

/** Camada de interface sobre o mundo. */
export function Hud() {
  const { t } = useTranslation();
  const zoneName = useApp((s) => s.zoneName);
  const players = useApp((s) => s.players);
  const lens = useApp((s) => s.lens);
  const peopleOpen = useApp((s) => s.peopleOpen);
  const { setLens, togglePeople, leave } = useApp.getState();
  const list = Object.values(players);

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      {/* Topo: marca e onde você está. */}
      <div className="glass pointer-events-auto absolute left-3 top-3 flex items-center gap-3 rounded-full py-2 pl-3 pr-4">
        <Logo size="sm" />
        <span className="h-4 w-px bg-offwhite/15" />
        <span className="max-w-[40vw] truncate text-sm text-offwhite/90" aria-live="polite">{zoneName}</span>
      </div>

      {/* Topo direito: quem está online. */}
      <button
        type="button"
        onClick={() => togglePeople()}
        aria-expanded={peopleOpen}
        className="glass pointer-events-auto absolute right-3 top-3 flex items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-4 transition hover:border-offwhite/25"
      >
        <span className="flex -space-x-2">
          {list.slice(0, 4).map((p) => (
            <AvatarFace key={p.id} look={p.look} size={26} className="rounded-full ring-2 ring-space" />
          ))}
        </span>
        <span className="text-sm text-offwhite/90">{t("hud.online", { count: list.length })}</span>
      </button>

      <AnimatePresence>{peopleOpen && <PeoplePanel />}</AnimatePresence>

      {/* Doca inferior. */}
      <div
        className="glass pointer-events-auto absolute bottom-[max(12px,env(safe-area-inset-bottom))] left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-2xl p-1.5"
        role="toolbar"
        aria-label="Controles"
      >
        <LensSwitch lens={lens} onChange={setLens} label={t("hud.lensHint")} />
        <span className="mx-1 h-6 w-px bg-offwhite/12" />
        <DockButton label={t("hud.recenter")} onClick={() => window.dispatchEvent(new Event("infinity:recenter"))} hidden={lens !== "2d"}>
          <LocateFixed className="size-[18px]" />
        </DockButton>
        <DockButton label={t("hud.people")} onClick={() => togglePeople()} active={peopleOpen}>
          <Users className="size-[18px]" />
        </DockButton>
        <DockButton label={t("hud.leave")} onClick={leave}>
          <LogOut className="size-[18px]" />
        </DockButton>
      </div>

      <p className="absolute bottom-[max(18px,env(safe-area-inset-bottom))] left-4 hidden max-w-[28ch] text-xs leading-relaxed text-slate/90 lg:block">
        {lens === "3d" ? t("hud.controls3d") : t("hud.controls")}
      </p>
    </div>
  );
}

function LensSwitch({ lens, onChange, label }: { lens: Lens; onChange: (l: Lens) => void; label: string }) {
  return (
    <div className="flex rounded-xl bg-deep/60 p-0.5" role="radiogroup" aria-label={label} title={label}>
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

function DockButton({ label, onClick, active, hidden, children }: { label: string; onClick: () => void; active?: boolean; hidden?: boolean; children: ReactNode }) {
  if (hidden) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={clsx("grid size-10 place-items-center rounded-xl transition-colors", active ? "bg-offwhite/12 text-offwhite" : "text-offwhite/80 hover:bg-offwhite/8 hover:text-offwhite")}
    >
      {children}
    </button>
  );
}
