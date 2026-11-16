import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { Armchair, Footprints } from "lucide-react";
import { mesasKey, mesasOwner, type MesasDesk } from "@infinity/world";
import { serverNow } from "../../net/session.ts";
import { remoteIds, sampleRemote, self } from "../../world/registry.ts";
import { desks, useMesasState, useMyKey } from "./state.ts";
import { goSit } from "./shared.ts";
import { T } from "./strings.ts";

/**
 * Mesas no mapa ampliado (gancho do Minimap): um ponto por mesa (vazado = livre, cheio = ocupada,
 * azul = a sua) e a lista "Mesas livres" por sala, com "ir até uma mesa livre".
 */

type Mark = "free" | "busy" | "fixed" | "mine";

/** Estado das mesas, relido a cada mudança do servidor e de minuto em minuto (meia-noite). */
function useMarks(): Map<string, Mark> {
  const s = useMesasState();
  const key = useMyKey();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);
  void tick;
  const now = serverNow();
  const out = new Map<string, Mark>();
  for (const d of desks()) {
    const o = s ? mesasOwner(s, d.id, now) : null;
    out.set(d.id, !o ? "free" : key && mesasKey(o.name) === key ? "mine" : o.fixed ? "fixed" : "busy");
  }
  return out;
}

/** Pontos das mesas, dentro do <svg> do mapa (unidades = metros). */
export function DesksMapLayer() {
  const marks = useMarks();
  return (
    <g aria-hidden pointerEvents="none" data-mesas-mapa="">
      {desks().map((d) => {
        const m = marks.get(d.id) ?? "free";
        return (
          <circle
            key={d.id}
            cx={d.pos.x}
            cy={d.pos.z}
            r={m === "mine" ? 0.38 : 0.27}
            fill={m === "free" ? "none" : m === "mine" ? "#00B7FF" : m === "fixed" ? "#E8B44A" : "#8A93A3"}
            fillOpacity={m === "busy" || m === "fixed" ? 0.85 : 1}
            stroke={m === "free" ? "#2BC48A" : "#00112A"}
            strokeWidth={m === "free" ? 0.13 : 0.1}
            data-mesa={d.id}
            data-livre={m === "free" ? "1" : "0"}
          />
        );
      })}
    </g>
  );
}

/** Alguém sentado na cadeira (mesmo sem check-in): melhor mandar para outra. */
function seatBusy(d: MesasDesk): boolean {
  const now = performance.now();
  for (const id of remoteIds()) {
    const r = sampleRemote(id, now);
    if (r && r.anim === "sit" && Math.hypot(r.x - d.seat.x, r.z - d.seat.z) < 0.4) return true;
  }
  return false;
}

/** "Mesas livres": quantas livres em cada sala e ir até a mais perto. */
export function DesksGuide() {
  const marks = useMarks();
  const rooms = new Map<string, { room: string; total: number; free: MesasDesk[] }>();
  for (const d of desks()) {
    const r = rooms.get(d.zoneId) ?? { room: d.room, total: 0, free: [] };
    r.total++;
    if (marks.get(d.id) === "free") r.free.push(d);
    rooms.set(d.zoneId, r);
  }
  // Salas de uma mesa só (as suítes da diretoria) ficam fora da lista.
  const list = [...rooms.values()].filter((r) => r.total > 1);
  const go = (free: MesasDesk[]) => {
    const pick = [...free].filter((d) => !seatBusy(d)).sort((a, b) => Math.hypot(a.seat.x - self.x, a.seat.z - self.z) - Math.hypot(b.seat.x - self.x, b.seat.z - self.z))[0];
    if (pick) goSit(pick);
  };
  return (
    <section className="mt-1" aria-label={T.map.title}>
      <h3 className="label-caps px-2 pt-1">{T.map.title}</h3>
      <p className="flex items-center gap-3 px-2 pb-1 pt-0.5 text-[10px] text-slate" aria-hidden>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full ring-[1.5px] ring-ok" />
          {T.map.legendFree}
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-slate" />
          {T.map.legendBusy}
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full" style={{ background: "#E8B44A" }} />
          {T.map.legendFixed}
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-signal" />
          {T.map.legendMine}
        </span>
      </p>
      <ul>
        {list.map((r) => {
          const can = r.free.length > 0;
          return (
            <li key={r.room}>
              <button
                type="button"
                disabled={!can}
                onClick={() => go(r.free)}
                title={can ? T.map.go(r.room) : T.map.none}
                aria-label={can ? T.map.go(r.room) : `${r.room}: ${T.map.none}`}
                className={clsx("group flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors", can ? "hover:bg-offwhite/6" : "cursor-default opacity-60")}
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-offwhite/8 text-offwhite/90">
                  <Armchair className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{r.room}</span>
                <span className="text-[11px] tabular-nums text-slate">{can ? T.map.room(r.free.length, r.total) : T.map.none}</span>
                {can && <Footprints className="size-3.5 shrink-0 text-slate opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
