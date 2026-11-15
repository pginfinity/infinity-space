import { Suspense, lazy, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import { clsx } from "clsx";
import { ArrowRight, Box, Dices, Map as MapIcon } from "lucide-react";
import { CLOTH_COLORS, HAIR_COLORS, SKIN_TONES, type AvatarLook, type Lens } from "@infinity/world";
import { useApp } from "../state/store.ts";
import { ACC_GROUP, ACCESSORIES, BOTTOM_STYLES, BROW_STYLES, EYE_STYLES, FACIAL_STYLES, HAIR_STYLES, MOUTH_STYLES, SHOE_STYLES, TOP_STYLES } from "../avatar/catalog.ts";
import { Logo } from "./Logo.tsx";

const AvatarStudio = lazy(() => import("./AvatarStudio.tsx"));

type Tab = "rosto" | "cabelo" | "roupa" | "acessorios";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "rosto", label: "Rosto" },
  { id: "cabelo", label: "Cabelo" },
  { id: "roupa", label: "Roupa" },
  { id: "acessorios", label: "Acessórios" },
];

const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)]!;

/** Visual aleatório e coerente, para quem quer começar rápido. */
function randomLook(): AvatarLook {
  const acc: number[] = [];
  if (Math.random() < 0.35) acc.push(pick([0, 1, 2]));
  if (Math.random() < 0.2) acc.push(pick([3, 4, 5]));
  if (Math.random() < 0.3) acc.push(8);
  return {
    skin: pick(SKIN_TONES),
    hair: Math.floor(Math.random() * HAIR_STYLES.length),
    hairColor: pick(HAIR_COLORS.slice(0, 9)),
    eyes: Math.floor(Math.random() * EYE_STYLES.length),
    brows: Math.floor(Math.random() * 3),
    mouth: Math.floor(Math.random() * MOUTH_STYLES.length),
    facial: Math.random() < 0.25 ? 1 + Math.floor(Math.random() * 4) : 0,
    top: Math.floor(Math.random() * TOP_STYLES.length),
    topColor: pick(CLOTH_COLORS),
    topColor2: pick(["#F2F0EF", "#ECE6DF", "#0A2547", "#1A1A1A"]),
    bottom: Math.floor(Math.random() * BOTTOM_STYLES.length),
    bottomColor: pick(["#1E2A44", "#1A1A1A", "#6B4A32", "#8A93A3", "#0A2547", "#ECE6DF"]),
    shoes: Math.floor(Math.random() * SHOE_STYLES.length),
    shoesColor: pick(["#F2F0EF", "#1A1A1A", "#6B4A32", "#EE5C29", "#00B7FF"]),
    acc,
    accColor: pick(["#1A1A1A", "#E8B44A", "#0A2547", "#EE5C29", "#C0392B"]),
  };
}

export function EntryScreen() {
  const { t } = useTranslation();
  const profile = useApp((s) => s.profile);
  const lens = useApp((s) => s.lens);
  const setProfile = useApp((s) => s.setProfile);
  const setLens = useApp((s) => s.setLens);
  const enter = useApp((s) => s.enter);
  const [touched, setTouched] = useState(false);
  const [tab, setTab] = useState<Tab>("roupa");
  const look = profile.look;
  const nameOk = profile.name.trim().length > 0;
  const set = (patch: Partial<AvatarLook>) => setProfile({ look: { ...look, ...patch } });

  const toggleAcc = (id: number) => {
    const has = look.acc.includes(id);
    const group = ACC_GROUP[id];
    const others = look.acc.filter((a) => a !== id && ACC_GROUP[a] !== group);
    set({ acc: has ? look.acc.filter((a) => a !== id) : [...others, id] });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!nameOk) return;
    setProfile({ name: profile.name.trim() });
    enter();
  };

  return (
    <div className="relative h-full overflow-y-auto">
      <Backdrop />
      <div className="relative mx-auto grid min-h-full max-w-6xl items-center gap-8 px-5 py-8 lg:grid-cols-[1fr_1.05fr] lg:gap-12 lg:px-10">
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }} className="flex flex-col">
          <Logo size="lg" />
          <p className="mt-5 max-w-md text-balance text-lg leading-relaxed text-offwhite/80">{t("app.tagline")}</p>
          <div className="relative mt-6 aspect-square w-full max-w-[440px] self-center lg:self-start">
            <div className="absolute inset-[12%] rounded-full bg-[radial-gradient(closest-side,rgb(0_183_255/0.22),transparent)]" />
            <Suspense fallback={<div className="grid h-full place-items-center text-sm text-slate">Preparando seu avatar…</div>}>
              <AvatarStudio look={look} />
            </Suspense>
          </div>
        </motion.section>

        <motion.form
          onSubmit={submit}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
          className="glass w-full rounded-[var(--radius-panel)] p-5 md:p-7"
          noValidate
        >
          <div className="flex items-center justify-between gap-3">
            <h1 className="font-display text-lg font-medium uppercase tracking-[0.06em]">{t("entry.title")}</h1>
            <button type="button" onClick={() => setProfile({ look: randomLook() })} className="flex items-center gap-1.5 rounded-full border border-offwhite/12 px-3 py-1.5 text-xs text-slate transition-colors hover:border-signal hover:text-offwhite">
              <Dices className="size-3.5" /> Sortear visual
            </button>
          </div>

          <div className="mt-5">
            <label htmlFor="name" className="label-caps">
              {t("entry.name")}
            </label>
            <input
              id="name"
              autoFocus
              autoComplete="name"
              maxLength={32}
              value={profile.name}
              onChange={(e) => setProfile({ name: e.target.value })}
              onBlur={() => setTouched(true)}
              placeholder={t("entry.namePlaceholder")}
              aria-invalid={touched && !nameOk}
              aria-describedby={touched && !nameOk ? "name-error" : undefined}
              className="mt-2 w-full rounded-xl border border-offwhite/12 bg-deep/70 px-4 py-3 text-base text-offwhite placeholder:text-slate/70 focus:border-signal focus:outline-none"
            />
            {touched && !nameOk && (
              <p id="name-error" className="mt-2 text-sm text-danger">
                {t("entry.nameRequired")}
              </p>
            )}
          </div>

          <div className="mt-6 flex gap-1 rounded-xl bg-deep/60 p-1" role="tablist" aria-label="Partes do avatar">
            {TABS.map((tb) => (
              <button
                key={tb.id}
                type="button"
                role="tab"
                aria-selected={tab === tb.id}
                onClick={() => setTab(tb.id)}
                className={clsx("flex-1 rounded-lg px-2 py-2 text-sm transition-colors", tab === tb.id ? "bg-card text-offwhite shadow" : "text-slate hover:text-offwhite")}
              >
                {tb.label}
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-4" role="tabpanel">
            {tab === "rosto" && (
              <>
                <Swatches label="Pele" colors={SKIN_TONES} value={look.skin} onChange={(skin) => set({ skin })} />
                <Chips label="Olhos" options={EYE_STYLES} value={look.eyes} onChange={(eyes) => set({ eyes })} />
                <Chips label="Sobrancelha" options={BROW_STYLES} value={look.brows} onChange={(brows) => set({ brows })} />
                <Chips label="Boca" options={MOUTH_STYLES} value={look.mouth} onChange={(mouth) => set({ mouth })} />
                <Chips label="Barba" options={FACIAL_STYLES} value={look.facial} onChange={(facial) => set({ facial })} />
              </>
            )}
            {tab === "cabelo" && (
              <>
                <Chips label="Corte" options={HAIR_STYLES} value={look.hair} onChange={(hair) => set({ hair })} />
                <Swatches label="Cor" colors={HAIR_COLORS} value={look.hairColor} onChange={(hairColor) => set({ hairColor })} />
              </>
            )}
            {tab === "roupa" && (
              <>
                <Chips label="Parte de cima" options={TOP_STYLES} value={look.top} onChange={(top) => set({ top })} />
                <Swatches label="Cor" colors={CLOTH_COLORS} value={look.topColor} onChange={(topColor) => set({ topColor })} />
                <Swatches label="Detalhe" colors={CLOTH_COLORS} value={look.topColor2} onChange={(topColor2) => set({ topColor2 })} small />
                <Chips label="Parte de baixo" options={BOTTOM_STYLES} value={look.bottom} onChange={(bottom) => set({ bottom })} />
                <Swatches label="Cor" colors={CLOTH_COLORS} value={look.bottomColor} onChange={(bottomColor) => set({ bottomColor })} small />
                <Chips label="Calçado" options={SHOE_STYLES} value={look.shoes} onChange={(shoes) => set({ shoes })} />
                <Swatches label="Cor" colors={CLOTH_COLORS} value={look.shoesColor} onChange={(shoesColor) => set({ shoesColor })} small />
              </>
            )}
            {tab === "acessorios" && (
              <>
                <div>
                  <span className="label-caps">Escolha até um por parte do corpo</span>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {ACCESSORIES.map((a, i) => (
                      <button
                        key={a}
                        type="button"
                        aria-pressed={look.acc.includes(i)}
                        onClick={() => toggleAcc(i)}
                        className={clsx("rounded-full border px-3 py-1.5 text-sm transition-colors", look.acc.includes(i) ? "border-signal bg-signal/15 text-offwhite" : "border-offwhite/12 text-slate hover:text-offwhite")}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
                <Swatches label="Cor" colors={CLOTH_COLORS} value={look.accColor} onChange={(accColor) => set({ accColor })} />
              </>
            )}
          </div>

          <fieldset className="mt-6">
            <legend className="label-caps">{t("entry.lens")}</legend>
            <div className="mt-2 grid grid-cols-2 gap-2.5" role="radiogroup" aria-label={t("entry.lens")}>
              <LensCard value="2d" current={lens} onPick={setLens} icon={<MapIcon className="size-4" />} title={t("entry.lens2d")} hint={t("entry.lens2dHint")} />
              <LensCard value="3d" current={lens} onPick={setLens} icon={<Box className="size-4" />} title={t("entry.lens3d")} hint={t("entry.lens3dHint")} />
            </div>
          </fieldset>

          <button
            type="submit"
            className="group mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-orange px-5 py-3.5 font-semibold text-white shadow-[0_8px_30px_-8px_rgb(238_92_41/0.6)] transition-[transform,filter] hover:brightness-110 active:scale-[0.99]"
          >
            {t("entry.enter")}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </button>
          <p className="mt-3 text-center text-xs text-slate">{t("entry.remember")}</p>
        </motion.form>
      </div>
    </div>
  );
}

function Chips({ label, options, value, onChange }: { label: string; options: readonly string[]; value: number; onChange: (i: number) => void }) {
  return (
    <div>
      <span className="label-caps">{label}</span>
      <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {options.map((o, i) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={value === i}
            onClick={() => onChange(i)}
            className={clsx("rounded-full border px-3 py-1.5 text-sm transition-colors", value === i ? "border-signal bg-signal/15 text-offwhite" : "border-offwhite/12 text-slate hover:text-offwhite")}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function Swatches({ label, colors, value, onChange, small }: { label: string; colors: readonly string[]; value: string; onChange: (c: string) => void; small?: boolean }) {
  return (
    <div>
      <span className="label-caps">{label}</span>
      <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={value.toLowerCase() === c.toLowerCase()}
            aria-label={c}
            onClick={() => onChange(c)}
            className={clsx("rounded-full ring-offset-2 ring-offset-space transition-transform hover:scale-110", small ? "size-6" : "size-7", value.toLowerCase() === c.toLowerCase() ? "ring-2 ring-signal" : "ring-1 ring-offwhite/15")}
            style={{ background: c }}
          />
        ))}
      </div>
    </div>
  );
}

function LensCard({ value, current, onPick, icon, title, hint }: { value: Lens; current: Lens; onPick: (l: Lens) => void; icon: ReactNode; title: string; hint: string }) {
  const active = value === current;
  return (
    <button type="button" role="radio" aria-checked={active} onClick={() => onPick(value)} className={clsx("flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-colors", active ? "border-signal bg-signal/10" : "border-offwhite/12 hover:border-offwhite/25")}>
      <span className={clsx("flex items-center gap-2 font-display text-xs font-medium uppercase tracking-[0.08em]", active ? "text-signal" : "text-offwhite")}>
        {icon}
        {title}
      </span>
      <span className="text-[12px] leading-snug text-slate">{hint}</span>
    </button>
  );
}

/** Fundo inspirado nos fundos "glass" da marca. */
function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden bg-space">
      <div className="absolute -bottom-1/3 -left-1/4 size-[80vmax] rounded-full bg-[radial-gradient(closest-side,rgb(0_183_255/0.32),transparent)] blur-2xl" />
      <div className="absolute -top-1/3 -right-1/4 size-[70vmax] rounded-full bg-[radial-gradient(closest-side,rgb(238_92_41/0.28),transparent)] blur-2xl" />
    </div>
  );
}
