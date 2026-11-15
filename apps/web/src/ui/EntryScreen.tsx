import { useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import { clsx } from "clsx";
import { ArrowRight, Box, Map as MapIcon } from "lucide-react";
import { HAIR_COLORS, LOOK_COLORS, SKIN_TONES, type Lens } from "@infinity/world";
import { useApp } from "../state/store.ts";
import { Logo } from "./Logo.tsx";
import { AvatarFace } from "./AvatarFace.tsx";

const HAIR_STYLES = [
  { id: 0, label: "Raspado" },
  { id: 1, label: "Curto" },
  { id: 2, label: "Coque" },
  { id: 3, label: "Longo" },
];

export function EntryScreen() {
  const { t } = useTranslation();
  const profile = useApp((s) => s.profile);
  const lens = useApp((s) => s.lens);
  const setProfile = useApp((s) => s.setProfile);
  const setLens = useApp((s) => s.setLens);
  const enter = useApp((s) => s.enter);
  const [touched, setTouched] = useState(false);
  const nameOk = profile.name.trim().length > 0;

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
      <div className="relative mx-auto grid min-h-full max-w-6xl items-center gap-10 px-5 py-10 md:grid-cols-[1.05fr_1fr] md:gap-16 md:px-10">
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }} className="max-w-xl">
          <Logo size="lg" />
          <p className="mt-6 text-balance text-lg leading-relaxed text-offwhite/80 md:text-xl">{t("app.tagline")}</p>
          <ul className="mt-8 grid gap-3 text-sm text-slate">
            <li className="flex gap-3"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-signal" />Chegue perto de alguém para conversar. Quanto mais longe, mais baixo.</li>
            <li className="flex gap-3"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-signal" />O mesmo escritório em 2D ou 3D: troque a qualquer momento com a tecla L.</li>
            <li className="flex gap-3"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-signal" />Sete alas, uma para cada etapa do Círculo de Evolução.</li>
          </ul>
        </motion.section>

        <motion.form
          onSubmit={submit}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
          className="glass w-full rounded-[var(--radius-panel)] p-6 md:p-8"
          noValidate
        >
          <h1 className="font-display text-xl font-medium uppercase tracking-[0.06em]">{t("entry.title")}</h1>

          <div className="mt-6 flex items-start gap-5">
            <AvatarFace look={profile.look} size={84} className="shrink-0 rounded-full ring-2 ring-offwhite/10" />
            <div className="min-w-0 flex-1">
              <label htmlFor="name" className="label-caps">{t("entry.name")}</label>
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
                <p id="name-error" className="mt-2 text-sm text-danger">{t("entry.nameRequired")}</p>
              )}
            </div>
          </div>

          <fieldset className="mt-7">
            <legend className="label-caps">{t("entry.look")}</legend>
            <Swatches label={t("entry.outfit")} colors={LOOK_COLORS} value={profile.look.color} onChange={(color) => setProfile({ look: { ...profile.look, color } })} />
            <Swatches label={t("entry.skin")} colors={SKIN_TONES} value={profile.look.skin} onChange={(skin) => setProfile({ look: { ...profile.look, skin } })} />
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="w-14 shrink-0 text-sm text-slate">{t("entry.hair")}</span>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("entry.hair")}>
                {HAIR_STYLES.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    role="radio"
                    aria-checked={profile.look.hair === h.id}
                    onClick={() => setProfile({ look: { ...profile.look, hair: h.id } })}
                    className={clsx(
                      "rounded-full border px-3 py-1.5 text-sm transition-colors",
                      profile.look.hair === h.id ? "border-signal bg-signal/15 text-offwhite" : "border-offwhite/12 text-slate hover:text-offwhite",
                    )}
                  >
                    {h.label}
                  </button>
                ))}
              </div>
            </div>
            <Swatches label="" colors={HAIR_COLORS} value={profile.look.hairColor} onChange={(hairColor) => setProfile({ look: { ...profile.look, hairColor } })} small />
          </fieldset>

          <fieldset className="mt-7">
            <legend className="label-caps">{t("entry.lens")}</legend>
            <div className="mt-3 grid grid-cols-2 gap-3" role="radiogroup" aria-label={t("entry.lens")}>
              <LensCard value="2d" current={lens} onPick={setLens} icon={<MapIcon className="size-5" />} title={t("entry.lens2d")} hint={t("entry.lens2dHint")} />
              <LensCard value="3d" current={lens} onPick={setLens} icon={<Box className="size-5" />} title={t("entry.lens3d")} hint={t("entry.lens3dHint")} />
            </div>
          </fieldset>

          <button
            type="submit"
            className="group mt-8 flex w-full items-center justify-center gap-2 rounded-xl bg-orange px-5 py-3.5 font-semibold text-white shadow-[0_8px_30px_-8px_rgb(238_92_41/0.6)] transition-[transform,filter] hover:brightness-110 active:scale-[0.99]"
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

function Swatches({ label, colors, value, onChange, small }: { label: string; colors: readonly string[]; value: string; onChange: (c: string) => void; small?: boolean }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="w-14 shrink-0 text-sm text-slate">{label}</span>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label || "Cor do cabelo"}>
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={value.toLowerCase() === c.toLowerCase()}
            aria-label={c}
            onClick={() => onChange(c)}
            className={clsx(
              "rounded-full ring-offset-2 ring-offset-space transition-transform hover:scale-110",
              small ? "size-6" : "size-7",
              value.toLowerCase() === c.toLowerCase() ? "ring-2 ring-signal" : "ring-1 ring-offwhite/15",
            )}
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
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={() => onPick(value)}
      className={clsx(
        "flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors",
        active ? "border-signal bg-signal/10" : "border-offwhite/12 hover:border-offwhite/25",
      )}
    >
      <span className={clsx("flex items-center gap-2 font-display text-sm font-medium uppercase tracking-[0.08em]", active ? "text-signal" : "text-offwhite")}>
        {icon}
        {title}
      </span>
      <span className="text-[13px] leading-snug text-slate">{hint}</span>
    </button>
  );
}

/** Fundo inspirado nos fundos "glass" da marca: brilho azul embaixo à esquerda, laranja em cima à direita. */
function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden bg-space">
      <div className="absolute -bottom-1/3 -left-1/4 size-[80vmax] rounded-full bg-[radial-gradient(closest-side,rgb(0_183_255/0.32),transparent)] blur-2xl" />
      <div className="absolute -top-1/3 -right-1/4 size-[70vmax] rounded-full bg-[radial-gradient(closest-side,rgb(238_92_41/0.28),transparent)] blur-2xl" />
      <div
        className="absolute inset-0 opacity-[0.06] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  );
}
