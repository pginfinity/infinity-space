import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import { Footprints, X } from "lucide-react";
import { useApp } from "../state/store.ts";
import { sampleRemote, self } from "../world/registry.ts";
import { placeName } from "../world/zoneLabel.ts";
import { STATUS_COLOR } from "../world/theme.ts";
import { walkTo } from "../engine/movement.ts";
import { AvatarFace } from "./AvatarFace.tsx";

/** Quem está no escritório, onde está e um atalho para ir até a pessoa. */
export function PeoplePanel() {
  const { t } = useTranslation();
  const players = useApp((s) => s.players);
  const selfId = useApp((s) => s.selfId);
  const close = () => useApp.getState().togglePeople(false);
  const [, tick] = useState(0);

  // Atualiza os lugares uma vez por segundo.
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const list = Object.values(players).sort((a, b) => (a.id === selfId ? -1 : b.id === selfId ? 1 : a.name.localeCompare(b.name, "pt-BR")));

  return (
    <motion.aside
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="glass pointer-events-auto absolute right-3 top-16 bottom-24 flex w-[min(340px,calc(100vw-24px))] flex-col overflow-hidden rounded-[var(--radius-panel)]"
      aria-label={t("hud.people")}
    >
      <header className="flex items-center justify-between border-b border-offwhite/8 px-5 py-4">
        <div>
          <h2 className="font-display text-sm font-medium uppercase tracking-[0.1em]">{t("hud.people")}</h2>
          <p className="mt-0.5 text-xs text-slate">{t("hud.online", { count: list.length })}</p>
        </div>
        <button type="button" onClick={close} className="rounded-lg p-2 text-slate hover:bg-offwhite/8 hover:text-offwhite" aria-label="Fechar">
          <X className="size-4" />
        </button>
      </header>
      <ul className="flex-1 overflow-y-auto px-2 py-2">
        {list.map((p) => {
          const isSelf = p.id === selfId;
          const pos = isSelf ? self : sampleRemote(p.id);
          return (
            <li key={p.id} className="group flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-offwhite/5">
              <div className="relative shrink-0">
                <AvatarFace look={p.look} size={36} className="rounded-full" />
                <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full ring-2 ring-space" style={{ background: STATUS_COLOR[p.status] }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {p.name}
                  {isSelf && <span className="ml-1.5 text-xs font-normal text-slate">({t("hud.you")})</span>}
                </p>
                <p className="truncate text-xs text-slate">
                  {t(`status.${p.status}`)} · {pos ? placeName(pos) : "—"} · {p.lens.toUpperCase()}
                </p>
              </div>
              {!isSelf && pos && (
                <button
                  type="button"
                  onClick={() => walkTo(pos)}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-offwhite/10 px-2.5 py-1.5 text-xs text-offwhite/90 opacity-80 transition hover:border-signal hover:text-signal group-hover:opacity-100"
                >
                  <Footprints className="size-3.5" />
                  {t("hud.goTo")}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </motion.aside>
  );
}
