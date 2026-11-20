import { useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { motion, useReducedMotion } from "motion/react";
import { Body, GeoVector } from "astronomy-engine";
import { Earth, Moon, Orbit, Satellite, Star, Sun, Telescope, Waypoints, X, type LucideIcon } from "lucide-react";
import { altitudeOf, apply, azimuthOf, EARTH_ANGULAR_RADIUS, type Sky, type Vec3 } from "../../scene/astro/astro.ts";
import { getSky, retainSky } from "../../scene/astro/live.ts";
import { skyNow } from "../../scene/astro/clock.ts";
import { namedStars, toggleConstellations, useConstellations } from "../../scene/sky/constellations.ts";
import type { SkyPick, SkyTarget } from "../../scene/sky/pick.ts";
import { openTelescopeOn } from "../vivo/telescope.tsx";
import { MoonIcon, useTick } from "./Panel.tsx";

/**
 * Cartão de um astro clicado no céu (UI de ferramenta: pequeno, denso). Distância e posição são as de
 * agora (atualiza a cada 5 s). Clicar num meteoro que acabou de passar vira um pedido: só um aviso que
 * some sozinho, nada guardado nem enviado.
 */

const KM_PER_AU = 149_597_870.7;
const C_KM_S = 299_792.458;
const BODY = { sol: Body.Sun, venus: Body.Venus, marte: Body.Mars, jupiter: Body.Jupiter, saturno: Body.Saturn } as const;
const int = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
// "negative": magnitude -0,01 (Alfa Centauri) arredonda para "0", não "-0".
const one = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, signDisplay: "negative" });

/** Do centro da Terra até o corpo, agora (km). */
function distanceKm(b: Body): number {
  const v = GeoVector(b, new Date(skyNow()), true);
  return Math.hypot(v.x, v.y, v.z) * KM_PER_AU;
}

/** Quanto a luz leva para chegar: "1,3 s", "8 min 19 s", "1 h 12 min". */
function lightTime(km: number): string {
  const s = km / C_KM_S;
  if (s < 60) return `${one.format(s)} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
  return `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`;
}

/** Direção de agora do alvo (o céu gira; o satélite e a Terra ficam onde foram clicados). */
function liveDir(target: SkyTarget, sky: Sky, fallback: Vec3): Vec3 {
  switch (target.kind) {
    case "sol":
      return sky.sun.dir;
    case "lua":
      return sky.moon.dir;
    case "planeta":
      return sky.planets.find((p) => p.key === target.key)?.dir ?? fallback;
    case "estrela": {
      const st = namedStars.find((s) => s.key === target.key);
      return st ? apply(sky.eqjToScene, st.eqj) : fallback;
    }
    default:
      return fallback;
  }
}

const ICON: Record<SkyTarget["kind"], LucideIcon> = { sol: Sun, lua: Moon, terra: Earth, planeta: Orbit, estrela: Star, satelite: Satellite, meteoro: Star };
/** Campo de visão do telescópio para cada tipo (graus). */
const TELE_FOV: Partial<Record<SkyTarget["kind"], number>> = { sol: 24, lua: 10, planeta: 6, estrela: 8 };

export default function AstroCard({ pick, onClose }: { pick: SkyPick; onClose: () => void }) {
  return pick.target.kind === "meteoro" ? <Wish onClose={onClose} /> : <Card pick={pick} onClose={onClose} />;
}

function Card({ pick, onClose }: { pick: SkyPick; onClose: () => void }) {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const closeBtn = useRef<HTMLButtonElement>(null);
  const constellations = useConstellations((s) => s.on);
  useTick(5000);
  useEffect(() => retainSky(), []);
  useEffect(() => {
    closeBtn.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const target = pick.target;
  const sky = getSky();
  const dir = liveDir(target, sky, pick.dir);
  const base = target.kind === "planeta" ? `espaco.astro.planetas` : target.kind === "estrela" ? `espaco.astro.estrelas.${target.key}` : `espaco.astro.${target.kind}`;
  const name = target.kind === "planeta" ? t(`espaco.planets.names.${target.key}`) : t(`${base}.name`);
  const sub = t(`${base}.sub`);
  const fact = target.kind === "planeta" ? t(`${base}.${target.key}`) : t(`${base}.fact`);
  const Icon = ICON[target.kind];

  const rows: Array<[string, ReactNode]> = [];
  const dirs = t("espaco.astro.dirs", { returnObjects: true }) as string[];
  const compass = dirs[Math.round(azimuthOf(dir) / 45) % 8] ?? "";
  const alt = altitudeOf(dir);
  const aboveLimb = alt + (90 - EARTH_ANGULAR_RADIUS);
  const where =
    target.kind === "terra"
      ? t("espaco.astro.terra.where")
      : alt >= 0
        ? t("espaco.astro.up", { alt: Math.round(alt), dir: compass })
        : aboveLimb >= 3
          ? t("espaco.astro.aboveLimb", { alt: Math.round(aboveLimb), dir: compass })
          : t("espaco.astro.low", { dir: compass });

  if (target.kind === "lua") {
    rows.push([
      t("espaco.astro.phase"),
      <span className="flex items-center gap-1.5">
        <MoonIcon phase={sky.moon.phase} />
        <span>
          {t(`espaco.moon.phases.${sky.moon.phaseKey}`)} <span className="text-slate">· {t("espaco.moon.lit", { pct: Math.round(sky.moon.fraction * 100) })}</span>
        </span>
      </span>,
    ]);
    const km = sky.moon.distanceKm;
    rows.push([t("espaco.astro.distance"), `${t("espaco.astro.km", { n: int.format(Math.round(km / 10) * 10) })} · ${t("espaco.astro.light", { time: lightTime(km) })}`]);
  } else if (target.kind === "sol" || target.kind === "planeta") {
    const km = distanceKm(BODY[target.kind === "sol" ? "sol" : target.key]);
    rows.push([t("espaco.astro.distance"), `${t("espaco.astro.mkm", { n: one.format(km / 1e6) })} · ${t("espaco.astro.light", { time: lightTime(km) })}`]);
  } else if (target.kind === "estrela" || target.kind === "satelite") {
    rows.push([t("espaco.astro.distance"), t(`${base}.dist`)]);
  }
  if (target.kind === "planeta") {
    const mag = sky.planets.find((p) => p.key === target.key)?.mag;
    if (mag !== undefined) rows.push([t("espaco.astro.brightness"), t("espaco.astro.magnitude", { mag: one.format(mag) })]);
  } else if (target.kind === "estrela") {
    const mag = namedStars.find((s) => s.key === target.key)?.mag;
    if (mag !== undefined) rows.push([t("espaco.astro.brightness"), t("espaco.astro.magnitude", { mag: one.format(mag) })]);
  }
  rows.push([t("espaco.astro.where"), where]);
  if (target.kind === "terra") rows.push([t("espaco.station.label"), t(sky.station.light > 0.5 ? "espaco.station.sun" : "espaco.station.shadow")]);

  const fov = TELE_FOV[target.kind];
  return (
    <motion.aside
      initial={{ opacity: 0, y: reduce ? 0 : 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: reduce ? 0 : 6 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="glass pointer-events-auto absolute bottom-32 left-2 z-20 w-[min(320px,calc(100vw-16px))] overflow-hidden rounded-[var(--radius-panel)] text-offwhite sm:left-3"
      role="dialog"
      aria-labelledby="astro-nome"
      data-painel="astro"
      data-astro={target.kind === "planeta" || target.kind === "estrela" ? target.key : target.kind}
    >
      <header className="flex items-center justify-between gap-3 border-b border-offwhite/8 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Icon className="size-4 shrink-0 text-slate" aria-hidden />
          <div className="min-w-0">
            <h2 id="astro-nome" className="truncate font-display text-sm font-medium uppercase tracking-[0.1em]">
              {name}
            </h2>
            <p className="truncate text-[11px] text-slate">{sub}</p>
          </div>
        </div>
        <button ref={closeBtn} type="button" onClick={onClose} className="rounded-lg p-2 text-slate hover:bg-offwhite/8 hover:text-offwhite" aria-label={`${t("espaco.astro.close")} (Esc)`}>
          <X className="size-4" />
        </button>
      </header>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 px-4 py-2.5 text-[12px] leading-5">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="label-caps leading-5">{k}</dt>
            <dd className="min-w-0 text-offwhite">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="border-t border-offwhite/6 px-4 py-2.5 text-[12px] leading-[18px] text-slate">{fact}</p>
      <div className="flex flex-wrap gap-2 border-t border-offwhite/8 px-3 py-2">
        {fov !== undefined && (
          <button
            type="button"
            onClick={() => {
              openTelescopeOn(dir, fov, name);
              onClose();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-offwhite/8 px-2.5 py-1.5 text-[12px] text-offwhite hover:bg-offwhite/14"
          >
            <Telescope className="size-3.5" aria-hidden />
            {t("espaco.astro.telescope")}
          </button>
        )}
        <button
          type="button"
          onClick={toggleConstellations}
          aria-pressed={constellations}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] text-slate hover:bg-offwhite/8 hover:text-offwhite"
        >
          <Waypoints className="size-3.5" aria-hidden />
          {t(constellations ? "espaco.astro.constellationsOff" : "espaco.astro.constellationsOn")}
        </button>
      </div>
    </motion.aside>
  );
}

/** Pedido na estrela cadente: a estrela da marca aparece um instante e o aviso some sozinho. */
function Wish({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  useEffect(() => {
    const id = window.setTimeout(onClose, 3200);
    return () => window.clearTimeout(id);
  }, [onClose]);
  return (
    <motion.div
      initial={{ opacity: 0, scale: reduce ? 1 : 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="glass pointer-events-none absolute left-1/2 top-20 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full py-2 pl-3 pr-5 text-offwhite"
      role="status"
      data-painel="pedido"
    >
      <motion.img
        src="/brand/sparkle.svg"
        alt=""
        aria-hidden
        className="size-6 shrink-0"
        initial={{ rotate: reduce ? 0 : -90, scale: reduce ? 1 : 0.3 }}
        animate={{ rotate: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 16 }}
      />
      <div>
        <p className="font-display text-xs font-medium uppercase tracking-[0.14em]">{t("espaco.astro.wish.title")}</p>
        <p className="text-[11px] text-slate">{t("espaco.astro.wish.sub")}</p>
      </div>
    </motion.div>
  );
}
