import { useEffect, useRef } from "react";
import { clsx } from "clsx";
import { UserRound } from "lucide-react";
import type { Status } from "@infinity/world";
import { setMediaSettings, useMediaSettings } from "../media/settings.ts";
import { useApp } from "../state/store.ts";
import { STATUS_COLOR } from "../world/theme.ts";
import { AWAY_CHOICES, awayChoice } from "./away.ts";
import { setMyStatus } from "./status.ts";
import { usePresence } from "./store.ts";
import { T } from "./strings.ts";

const STATUSES: Status[] = ["available", "listening", "focus", "away"];

/** Seção "Presença" do painel de ajustes: seu status e o "Ausente" automático por inatividade. */
export function PresenceSettings() {
  const awayAfter = awayChoice(useMediaSettings((s) => s.awayAfter));
  const status = useApp((s) => (s.selfId ? s.players[s.selfId]?.status : undefined)) ?? "available";
  const focus = usePresence((s) => s.focusSettings);
  const ref = useRef<HTMLElement>(null);

  // Aberto pela busca ("Ajustes de presença"): rola até aqui.
  useEffect(() => {
    if (!focus) return;
    // Espera o painel entrar (a animação de entrada leva 250 ms); rola sem animação, que um scroll
    // suave em andamento é cancelado por qualquer nova medida do painel. Confere de novo logo depois.
    // Rola só a lista do painel (scrollIntoView rolava também os ancestrais com overflow escondido: o
    // painel inteiro subia e o cabeçalho com o "fechar" saía da tela).
    const container = ref.current?.closest(".overflow-y-auto") as HTMLElement | null;
    const go = () => {
      const sec = ref.current;
      if (!sec || !container) return;
      const offset = sec.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 16;
      container.scrollTop = Math.max(0, offset);
    };
    // O que fica acima (lista de dispositivos, prévia da câmera) carrega depois e empurra a seção para
    // baixo: enquanto o painel muda de tamanho nos primeiros 2 s, rola de novo até aqui.
    const ro = typeof ResizeObserver !== "undefined" && container ? new ResizeObserver(() => go()) : null;
    const t1 = window.setTimeout(() => {
      go();
      if (ro && container) for (const child of Array.from(container.children)) ro.observe(child);
    }, 280);
    const t2 = window.setTimeout(() => {
      go();
      ro?.disconnect();
      usePresence.setState({ focusSettings: false });
    }, 2000);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      ro?.disconnect();
    };
  }, [focus]);

  return (
    <section ref={ref} className="scroll-mt-4 space-y-3" aria-labelledby="ajustes-presenca">
      <h3 id="ajustes-presenca" className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate">
        <UserRound className="size-4" />
        {T.away.title}
      </h3>
      <div>
        <p className="mb-2 text-xs font-medium text-offwhite/85">{T.away.status}</p>
        <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label={T.away.status}>
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={status === s}
              onClick={() => setMyStatus(s)}
              className={clsx(
                "flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors",
                status === s ? "border-signal bg-signal/10" : "border-offwhite/10 hover:border-offwhite/25",
              )}
            >
              <span className="size-2 rounded-full" style={{ background: STATUS_COLOR[s] }} />
              {T.status[s]}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-medium text-offwhite/85">{T.away.auto}</p>
        <p className="mb-2 mt-0.5 text-[11px] leading-snug text-slate">{T.away.autoHint}</p>
        <div className="flex rounded-xl bg-deep/60 p-0.5" role="radiogroup" aria-label={T.away.auto}>
          {AWAY_CHOICES.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={awayAfter === n}
              onClick={() => setMediaSettings({ awayAfter: n })}
              className={clsx("flex-1 rounded-[10px] px-1.5 py-1.5 text-xs transition-colors", awayAfter === n ? "bg-offwhite/12 text-offwhite" : "text-slate hover:text-offwhite")}
            >
              {n === 0 ? T.away.off : T.away.minutes(n)}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] leading-snug text-slate">{T.away.privacy}</p>
      </div>
    </section>
  );
}
