import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { clsx } from "clsx";
import { Footprints, Maximize2, Minimize2 } from "lucide-react";
import { boundsOf } from "@infinity/world";
import { world } from "../world/world.ts";
import { useApp } from "../state/store.ts";
import { sampleRemote, self } from "../world/registry.ts";
import { walkTo } from "../engine/movement.ts";
import { guideItems, nearestSpot, type GuideGroup, type GuideItem } from "./guide.ts";

/**
 * Minimapa da estação: salas coloridas pela cor de cada área, você e as outras pessoas.
 * Clicar numa sala leva você até ela. Abre grande pelo totem de mapa ou pelo botão; grande, vira guia
 * da estação: marcadores do que dá para fazer e a lista "O que fazer aqui", com "ir até lá".
 */
export function Minimap() {
  const { map } = world();
  const [big, setBig] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [poi, setPoi] = useState<string | null>(null);
  const guide = useMemo(guideItems, []);
  const goTo = (item: GuideItem) => {
    const spot = nearestSpot(item, { x: self.x, z: self.z });
    if (spot) walkTo(spot);
  };
  const svgRef = useRef<SVGSVGElement>(null);
  const dotsRef = useRef<SVGGElement>(null);
  const players = useApp((s) => s.players);
  const selfId = useApp((s) => s.selfId);

  const b = useMemo(() => boundsOf(map.floors.flatMap((f) => f.polygon)), [map]);
  const pad = 1;
  const vb = `${b.minX - pad} ${b.minZ - pad} ${b.maxX - b.minX + pad * 2} ${b.maxZ - b.minZ + pad * 2}`;
  const rooms = useMemo(() => map.zones.filter((z) => z.kind !== "stage"), [map]);

  useEffect(() => {
    const open = () => setBig(true);
    window.addEventListener("infinity:map", open);
    return () => window.removeEventListener("infinity:map", open);
  }, []);

  // Pontinhos das pessoas, atualizados fora do React.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const g = dotsRef.current;
      if (g) {
        for (const el of Array.from(g.children) as SVGCircleElement[]) {
          const id = el.dataset.id!;
          const p = id === selfId ? self : sampleRemote(id);
          if (p) {
            el.setAttribute("cx", String(p.x));
            el.setAttribute("cy", String(p.z));
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [selfId]);

  const go = (e: MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    const zone = world().zones.zoneAt({ x: p.x, z: p.y });
    if (!zone) return;
    // Vai até o centro da sala (ou até o ponto clicado, se for andável).
    const c = world().nav.isWalkable({ x: p.x, z: p.y }) ? { x: p.x, z: p.y } : centroid(zone.polygon);
    walkTo(c);
  };

  return (
    <div className={clsx("glass pointer-events-auto absolute right-3 flex flex-col overflow-hidden rounded-2xl transition-all duration-300", big ? "bottom-24 top-16 z-30 w-[min(1000px,calc(100vw-24px))]" : "bottom-[max(12px,env(safe-area-inset-bottom))] hidden w-[230px] sm:flex")}>
      <div className="flex items-center justify-between px-3 pt-2">
        <span className="label-caps">{hover ?? "Mapa da estação"}</span>
        <button type="button" onClick={() => setBig((v) => !v)} className="rounded-md p-1 text-slate hover:text-offwhite" aria-label={big ? "Diminuir mapa" : "Ampliar mapa"}>
          {big ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
        </button>
      </div>
      <div className={clsx("min-h-0", big && "flex flex-1 flex-col sm:flex-row")}>
      <svg ref={svgRef} viewBox={vb} className={clsx("cursor-pointer", big ? "min-h-0 w-full flex-1" : "h-[170px] w-full")} onClick={go} onMouseLeave={() => setHover(null)}>
        {map.floors
          .filter((f) => f.style !== "line")
          .map((f) => (
            <polygon key={f.id} points={f.polygon.map((p) => `${p.x},${p.z}`).join(" ")} fill="#11284A" />
          ))}
        {rooms.map((z) => (
          <polygon
            key={z.id}
            points={z.polygon.map((p) => `${p.x},${p.z}`).join(" ")}
            fill={z.theme?.accent ?? "#00B7FF"}
            fillOpacity={hover === z.name ? 0.42 : z.listed ? 0.2 : 0.06}
            onMouseEnter={() => setHover(z.listed ? z.name : null)}
          />
        ))}
        {map.walls.map((w, i) => (
          <line key={i} x1={w.a.x} y1={w.a.z} x2={w.b.x} y2={w.b.z} stroke={w.kind === "solid" ? "#E9E5DF" : "#5FD0FF"} strokeWidth={w.kind === "solid" ? 0.22 : 0.14} strokeOpacity={0.85} />
        ))}
        {big &&
          map.labels.map((l) => (
            <text key={l.text + l.pos.x} x={l.pos.x} y={l.pos.z} textAnchor="middle" fontSize={0.95} fill="#F2F0EF" fontFamily="Geist, sans-serif" fontWeight={600} pointerEvents="none">
              {l.text}
            </text>
          ))}
        {big &&
          guide.flatMap((item) =>
            item.spots.map((p, i) => (
              <circle
                key={`${item.key}-${i}`}
                cx={p.x}
                cy={p.z}
                r={poi === item.key ? 0.85 : 0.45}
                fill={poi === item.key ? "#EE5C29" : "#F2F0EF"}
                fillOpacity={poi && poi !== item.key ? 0.35 : 0.9}
                stroke="#00112A"
                strokeWidth={0.18}
                pointerEvents="none"
              />
            )),
          )}
        <g ref={dotsRef}>
          {Object.values(players).map((p) => (
            <circle key={p.id} data-id={p.id} r={p.id === selfId ? 0.85 : 0.6} fill={p.id === selfId ? "#00B7FF" : "#F2F0EF"} stroke="#00112A" strokeWidth={0.25} pointerEvents="none" />
          ))}
        </g>
      </svg>
      {big && <GuideList items={guide} active={poi} onHover={setPoi} onGo={goTo} />}
      </div>
    </div>
  );
}

const GROUPS: GuideGroup[] = ["Jogos", "Escritório", "Estação"];

/** "O que fazer aqui": tudo que é interativo na estação, com ir até lá. */
function GuideList({ items, active, onHover, onGo }: { items: GuideItem[]; active: string | null; onHover: (k: string | null) => void; onGo: (i: GuideItem) => void }) {
  return (
    <aside className="max-h-[45%] shrink-0 overflow-y-auto border-t border-offwhite/8 px-2 pb-2 pt-1 sm:max-h-none sm:w-64 sm:border-l sm:border-t-0" aria-label="O que fazer aqui" onMouseLeave={() => onHover(null)}>
      <p className="px-2 pb-1 pt-2 text-sm font-medium">O que fazer aqui</p>
      {GROUPS.map((g) => (
        <section key={g} className="mt-1">
          <h3 className="label-caps px-2 py-1">{g}</h3>
          <ul>
            {items
              .filter((i) => i.group === g)
              .map((i) => {
                const Icon = i.icon;
                const can = i.spots.length > 0;
                return (
                  <li key={i.key}>
                    <button
                      type="button"
                      disabled={!can}
                      onMouseEnter={() => onHover(i.key)}
                      onFocus={() => onHover(i.key)}
                      onClick={() => onGo(i)}
                      className={clsx("group flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors", active === i.key ? "bg-offwhite/10" : "hover:bg-offwhite/6", !can && "cursor-default")}
                      title={can ? `Ir até: ${i.label}` : i.hint}
                    >
                      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-offwhite/8 text-offwhite/90">
                        <Icon className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">
                          {i.label}
                          {i.spots.length > 1 && <span className="ml-1 text-[11px] font-normal text-slate">×{i.spots.length}</span>}
                        </span>
                        <span className="block truncate text-[11px] text-slate">{can ? `${i.room} · ${i.hint}` : i.hint}</span>
                      </span>
                      {can && <Footprints className="size-3.5 shrink-0 text-slate opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />}
                    </button>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </aside>
  );
}

function centroid(poly: Array<{ x: number; z: number }>) {
  return { x: poly.reduce((s, p) => s + p.x, 0) / poly.length, z: poly.reduce((s, p) => s + p.z, 0) / poly.length };
}
