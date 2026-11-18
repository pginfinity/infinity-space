import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { motion, useReducedMotion } from "motion/react";
import { clsx } from "clsx";
import { Eclipse, Orbit, Sun, MoonStar, Telescope, X, type LucideIcon } from "lucide-react";
import { altitudeOf, azimuthOf, EARTH_ANGULAR_RADIUS, upcoming, type Sky, type Upcoming } from "../../scene/astro/astro.ts";
import { activeShowers, nextShower } from "../../scene/astro/meteors.ts";
import { getSky, retainSky } from "../../scene/astro/live.ts";
import { skyNow } from "../../scene/astro/clock.ts";

/**
 * Painel "Agora no espaço" (UI de ferramenta: denso, discreto). Atualiza a cada 30 s enquanto aberto;
 * eclipses e a próxima troca de luz da estação são recalculados no máximo a cada 10 min.
 * Laranja só num destaque, quando há algo acontecendo agora (pico de chuva hoje, eclipse em andamento).
 */

const TZ = "America/Sao_Paulo";
const dayFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: TZ });
const fullFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: TZ });
const timeFmt = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const keyFmt = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: TZ });

function useTick(ms: number): number {
  const [now, setNow] = useState(() => skyNow());
  useEffect(() => {
    const id = window.setInterval(() => setNow(skyNow()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

export default function Panel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const now = useTick(30_000);
  const closeBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => retainSky(), []);
  useEffect(() => {
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Eclipses e trocas de luz: contas mais pesadas, fora do primeiro quadro e no máximo a cada 10 min.
  const bucket = Math.floor(now / 600_000);
  const [up, setUp] = useState<Upcoming | null>(null);
  useEffect(() => {
    const id = window.setTimeout(() => setUp(upcoming(new Date(skyNow()))), 60);
    return () => window.clearTimeout(id);
  }, [bucket]);
  // Passou da troca de luz prevista: recalcula já.
  useEffect(() => {
    if (up?.stationChange && now > up.stationChange.at.getTime()) setUp(upcoming(new Date(now)));
  }, [now, up]);

  const sky = getSky();
  const date = (d: Date | number) => (keyFmt.format(d).slice(0, 4) === keyFmt.format(now).slice(0, 4) ? dayFmt : fullFmt).format(d);

  return (
    <motion.aside
      initial={{ opacity: 0, y: reduce ? 0 : -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: reduce ? 0 : -6 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="glass pointer-events-auto absolute right-2 top-16 z-20 flex max-h-[calc(100dvh-160px)] w-[min(340px,calc(100vw-16px))] flex-col overflow-hidden rounded-[var(--radius-panel)] text-offwhite sm:right-3"
      role="dialog"
      aria-labelledby="agora-no-espaco"
      data-painel="agora-no-espaco"
    >
      <header className="flex items-center justify-between gap-3 border-b border-offwhite/8 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Orbit className="size-4 shrink-0 text-slate" aria-hidden />
          <div className="min-w-0">
            <h2 id="agora-no-espaco" className="truncate font-display text-sm font-medium uppercase tracking-[0.1em]">
              {t("espaco.title")}
            </h2>
            <p className="truncate text-[11px] text-slate">{t("espaco.sub")}</p>
          </div>
        </div>
        <button ref={closeBtn} type="button" onClick={onClose} className="rounded-lg p-2 text-slate hover:bg-offwhite/8 hover:text-offwhite" aria-label={`${t("espaco.close")} (Esc)`}>
          <X className="size-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <MoonRow sky={sky} up={up} date={date} />
        <StationRow sky={sky} up={up} />
        <MeteorRow now={now} sky={sky} date={date} />
        <EclipseRow up={up} date={date} />
        <PlanetRow sky={sky} />
      </div>
      <p className="border-t border-offwhite/8 px-4 py-2 text-[11px] text-slate">{t("espaco.footer")}</p>
    </motion.aside>
  );
}

function Row({ icon: Icon, label, children, iconNode }: { icon?: LucideIcon; label: string; children: ReactNode; iconNode?: ReactNode }) {
  return (
    <section className="flex gap-3 border-b border-offwhite/6 px-4 py-2.5 last:border-b-0" aria-label={label}>
      <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-offwhite/6 text-slate" aria-hidden>
        {iconNode ?? (Icon && <Icon className="size-4" />)}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="label-caps leading-4">{label}</h3>
        {children}
      </div>
    </section>
  );
}

const main = "text-[13px] leading-5 text-offwhite";
const sub = "text-[11px] leading-4 text-slate";
const hot = "rounded-md bg-orange/15 px-1.5 py-px text-[11px] font-medium text-orange";

function MoonRow({ sky, up, date }: { sky: Sky; up: Upcoming | null; date: (d: Date) => string }) {
  const { t } = useTranslation();
  const m = sky.moon;
  // Mostra a próxima das duas (cheia ou nova).
  const next = up ? (up.fullMoon < up.newMoon ? t("espaco.moon.nextFull", { date: date(up.fullMoon) }) : t("espaco.moon.nextNew", { date: date(up.newMoon) })) : null;
  return (
    <Row label={t("espaco.moon.label")} iconNode={<MoonIcon phase={m.phase} />}>
      <p className={main}>
        {t(`espaco.moon.phases.${m.phaseKey}`)} <span className="text-slate">· {t("espaco.moon.lit", { pct: Math.round(m.fraction * 100) })}</span>
      </p>
      {next && <p className={sub}>{next}</p>}
    </Row>
  );
}

/**
 * Lua desenhada como se vê de São Paulo (hemisfério sul): crescendo, o lado aceso fica à esquerda.
 * A borda da sombra é uma elipse: curva para o lado aceso no crescente/minguante e para fora na gibosa.
 */
function MoonIcon({ phase }: { phase: number }) {
  const p = ((phase % 360) + 360) % 360;
  const r = 8;
  const rx = Math.abs(Math.cos((p * Math.PI) / 180)) * r;
  const leftLit = p < 180;
  const crescent = p < 90 || p > 270;
  // Aceso: meia borda do lado aceso (de cima para baixo) e volta pela borda da sombra.
  const limbSweep = leftLit ? 0 : 1;
  const termSweep = leftLit ? (crescent ? 1 : 0) : crescent ? 0 : 1;
  const d = `M12 4 A${r} ${r} 0 0 ${limbSweep} 12 20 A${rx.toFixed(2)} ${r} 0 0 ${termSweep} 12 4 Z`;
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <circle cx="12" cy="12" r={r} fill="currentColor" opacity="0.18" />
      <path d={d} fill="#F2F0EF" />
    </svg>
  );
}

/** Risco de meteoro (a estrela de quatro pontas é da marca: não entra como ícone genérico). */
function MeteorIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <path d="M20 4 9.5 14.5" />
      <path d="M15 4 8 11" opacity="0.55" />
      <path d="M20 9l-7 7" opacity="0.55" />
      <circle cx="7" cy="17" r="3" fill="currentColor" stroke="none" />
    </svg>
  );
}

function StationRow({ sky, up }: { sky: Sky; up: Upcoming | null }) {
  const { t } = useTranslation();
  const lit = sky.station.light > 0.5;
  const change = up?.stationChange;
  return (
    <Row icon={lit ? Sun : MoonStar} label={t("espaco.station.label")}>
      <p className={main}>{t(lit ? "espaco.station.sun" : "espaco.station.shadow")}</p>
      {change && <p className={sub}>{t(change.toLight ? "espaco.station.toLight" : "espaco.station.toShadow", { time: timeFmt.format(change.at) })}</p>}
    </Row>
  );
}

function MeteorRow({ now, sky, date }: { now: number; sky: Sky; date: (d: Date) => string }) {
  const { t } = useTranslation();
  const act = useMemo(() => activeShowers(now).filter((a) => a.activity >= 0.02), [now]);
  const top = act[0];
  if (!top) {
    const n = nextShower(now);
    return (
      <Row iconNode={<MeteorIcon />} label={t("espaco.meteors.label")}>
        <p className={main}>{t("espaco.meteors.none")}</p>
        <p className={sub}>{t("espaco.meteors.next", { name: t(`espaco.meteors.showers.${n.shower.key}`), date: date(new Date(n.peak)) })}</p>
      </Row>
    );
  }
  const s = top.shower;
  const today = keyFmt.format(now);
  const peakDay = keyFmt.format(top.peak);
  const tomorrow = keyFmt.format(now + 86_400_000);
  const isToday = peakDay === today;
  const when = isToday
    ? t("espaco.meteors.peakToday")
    : peakDay === tomorrow
      ? t("espaco.meteors.peakTomorrow")
      : top.peak > now
        ? t("espaco.meteors.peakOn", { date: date(new Date(top.peak)) })
        : t("espaco.meteors.peakWas", { date: date(new Date(top.peak)) });
  // Radiante: acima do horizonte de São Paulo = é hora de olhar.
  const m = sky.eqjToScene;
  const ra = (s.ra * 15 * Math.PI) / 180;
  const dec = (s.dec * Math.PI) / 180;
  const e: [number, number, number] = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
  const radiantY = m[3]! * e[0] + m[4]! * e[1] + m[5]! * e[2];
  const where = t(`espaco.meteors.radiants.${s.key}`);
  return (
    <Row iconNode={<MeteorIcon />} label={t("espaco.meteors.label")}>
      <p className={clsx(main, "flex flex-wrap items-center gap-x-1.5")}>
        {t(`espaco.meteors.showers.${s.key}`)}
        <span className={isToday ? hot : "text-slate"}>{isToday ? when : `· ${when}`}</span>
      </p>
      <p className={sub}>{t(radiantY > 0 ? "espaco.meteors.radiantUp" : "espaco.meteors.radiantDown", { where })}</p>
      {act.length > 1 && <p className={sub}>+ {act.slice(1).map((a) => t(`espaco.meteors.showers.${a.shower.key}`)).join(", ")}</p>}
    </Row>
  );
}

function EclipseRow({ up, date }: { up: Upcoming | null; date: (d: Date) => string }) {
  const { t } = useTranslation();
  if (!up) {
    return (
      <Row icon={Eclipse} label={t("espaco.eclipse.label")}>
        <p className={sub}>{t("espaco.loading")}</p>
      </Row>
    );
  }
  const lunarFirst = up.lunar.peak < up.solar.peak;
  const solar = (
    <p key="s" className={main}>
      {t("espaco.eclipse.solar", { kind: t(`espaco.eclipse.kinds.${up.solar.kind}`) })} <span className="text-slate">· {date(up.solar.peak)}</span>
    </p>
  );
  const lunar = (
    <p key="l" className={clsx(main, "flex flex-wrap items-center gap-x-1.5")}>
      {t("espaco.eclipse.lunar", { kind: t(`espaco.eclipse.kinds.${up.lunar.kind}`) })}
      {up.lunar.now ? <span className={hot}>{t("espaco.eclipse.now")}</span> : <span className="text-slate">· {date(up.lunar.peak)}</span>}
      <span className="text-[11px] text-slate">({t(up.lunar.visibleHere ? "espaco.eclipse.here" : "espaco.eclipse.notHere")})</span>
    </p>
  );
  return (
    <Row icon={Eclipse} label={t("espaco.eclipse.label")}>
      {lunarFirst ? [lunar, solar] : [solar, lunar]}
    </Row>
  );
}

function PlanetRow({ sky }: { sky: Sky }) {
  const { t } = useTranslation();
  const compass = t("espaco.compass", { returnObjects: true }) as string[];
  const sun = sky.sun.dir;
  return (
    <Row icon={Telescope} label={t("espaco.planets.label")}>
      <ul className="mt-0.5 grid grid-cols-2 gap-x-3 gap-y-0.5">
        {sky.planets.map((p) => {
          const alt = altitudeOf(p.dir);
          const dir = compass[Math.round(azimuthOf(p.dir) / 45) % 8] ?? "";
          const glare = Math.acos(Math.min(1, p.dir[0] * sun[0] + p.dir[1] * sun[1] + p.dir[2] * sun[2])) < (10 * Math.PI) / 180;
          // Visto da estação, o que está acima da borda da Terra aparece (até ~20° abaixo do horizonte de SP).
          const hidden = alt < -(90 - EARTH_ANGULAR_RADIUS);
          const where = hidden ? t("espaco.planets.hidden") : glare ? t("espaco.planets.glare") : alt > 0 ? t("espaco.planets.up", { dir, alt: Math.round(alt) }) : t("espaco.planets.low", { dir });
          return (
            <li key={p.key} className="flex min-w-0 items-baseline gap-1.5 text-[12px] leading-5">
              <span className={clsx("size-1.5 shrink-0 translate-y-[-1px] rounded-full", hidden ? "bg-offwhite/20" : "bg-signal")} aria-hidden />
              <span className="text-offwhite">{t(`espaco.planets.names.${p.key}`)}</span>
              <span className="truncate text-[11px] text-slate">{where}</span>
            </li>
          );
        })}
      </ul>
    </Row>
  );
}
