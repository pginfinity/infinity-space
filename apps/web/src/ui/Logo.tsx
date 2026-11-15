import { clsx } from "clsx";

/** Marca do produto: o símbolo oficial da Infinity + "Infinity Space" em NORD. */
export function Logo({ size = "md", className }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const s = { sm: { icon: 18, text: "text-[11px]", gap: "gap-2" }, md: { icon: 26, text: "text-sm", gap: "gap-2.5" }, lg: { icon: 54, text: "text-3xl md:text-4xl", gap: "gap-4" } }[size];
  return (
    <div className={clsx("flex items-center", s.gap, className)}>
      <img src="/brand/sparkle.svg" width={s.icon} height={s.icon} alt="" aria-hidden className="shrink-0" />
      <span className={clsx("font-display font-bold uppercase leading-none tracking-[0.08em] text-offwhite", s.text)}>
        Infinity Space
      </span>
    </div>
  );
}
