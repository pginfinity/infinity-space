import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { clsx } from "clsx";
import { Check, Footprints, Megaphone, Play, Siren, Snowflake, Users } from "lucide-react";
import {
  IMP_CHAT_MAX,
  IMP_ID,
  IMP_KIND,
  IMP_MIN_PLAYERS,
  IMP_REPORT_RANGE,
  IMP_TAG_RANGE,
  IMP_TASK_MS,
  IMP_TASK_RANGE,
  IMP_ZONE,
  type ImpRoleEvent,
  type ImpState,
  type MapObject,
} from "@infinity/world";
import { actState, sendAct, useAct, type ActivityClient, type DynamicTarget } from "../registry.ts";
import { useApp } from "../../state/store.ts";
import { useInteract } from "../../engine/interact.ts";
import { walkTo } from "../../engine/movement.ts";
import { sampleRemote, self } from "../../world/registry.ts";
import { ChipDock, FloatChip, GamePanelShell, GhostButton, PrimaryButton, Seconds, TimeBar, closePanel, openPanel, playSfx, useLeft, usePanel, useSelfId, useSelfZone } from "./shared.tsx";
import { ImpostorScene } from "./impostorScene.tsx";
import { impSpots, useImpLocal } from "./impostorStore.ts";
import { T } from "./strings.ts";

/**
 * Impostor na Estação: entrada pelo terminal de missões do Átrio. Papel e tarefas chegam só para a
 * pessoa (evento "role"); tarefas, congelar e reportar são alvos de interação (E) no mundo.
 */

const send = (op: string, data?: unknown) => sendAct(IMP_ID, op, data);
const useImp = () => useAct<ImpState>(IMP_ID);

function myRole(s: ImpState | undefined): (ImpRoleEvent & { at: number }) | null {
  const r = useImpLocal.getState().role;
  return r && s && r.game === s.game ? r : null;
}

function inImp(s: ImpState | undefined, me: string | null): boolean {
  return !!s && !!me && s.players.some((p) => p.id === me && !p.away);
}

function joinImp(): void {
  send("join");
  openPanel("impostor", IMP_ID);
  playSfx("grupo-entrar", true, undefined, { volume: 0.5 });
}

// ---- tarefa em andamento --------------------------------------------------------------------

let workTimer = 0;
function startTask(task: string): void {
  const spot = impSpots().get(task);
  if (!spot) return;
  send("taskStart", { task });
  useImpLocal.setState({ working: { task, start: performance.now() } });
  window.clearInterval(workTimer);
  workTimer = window.setInterval(() => {
    const w = useImpLocal.getState().working;
    if (!w) return window.clearInterval(workTimer);
    // Saiu de perto: perde o progresso.
    if (Math.hypot(self.x - spot.point.x, self.z - spot.point.z) > IMP_TASK_RANGE) {
      useImpLocal.setState({ working: null });
      return window.clearInterval(workTimer);
    }
    if (performance.now() - w.start >= IMP_TASK_MS) {
      send("taskDone", { task });
      useImpLocal.setState({ working: null });
      window.clearInterval(workTimer);
    }
  }, 100);
}

// ---- cliente --------------------------------------------------------------------------------

export const impostorClient: ActivityClient = {
  name: "grupo/impostor",
  kinds: [IMP_KIND],
  objects: ["mission-console"],
  label: () => (inImp(actState<ImpState>(IMP_ID), useApp.getState().selfId) ? T.imp.chipBack : T.imp.action),
  use: (_o: MapObject) => (inImp(actState<ImpState>(IMP_ID), useApp.getState().selfId) ? openPanel("impostor", IMP_ID) : joinImp()),
  targets: () => {
    const s = actState<ImpState>(IMP_ID);
    const me = useApp.getState().selfId;
    if (!s || s.phase !== "playing" || !inImp(s, me)) return [];
    const role = myRole(s);
    const mePlayer = s.players.find((p) => p.id === me);
    const out: DynamicTarget[] = [];
    if (role) {
      const working = useImpLocal.getState().working;
      for (const id of role.tasks) {
        if (role.done.includes(id)) continue;
        const spot = impSpots().get(id);
        if (!spot) continue;
        out.push({ key: `imp-task-${id}`, point: spot.point, radius: IMP_TASK_RANGE - 0.2, priority: 2, label: working?.task === id ? T.imp.working(spot.label) : T.imp.taskLabel(spot.label), run: () => startTask(id) });
      }
      // Infiltrado vivo e recarregado: congelar quem está bem perto.
      const ready = role.role === "impostor" && mePlayer?.alive && performance.now() >= role.at + role.tagIn;
      if (ready) {
        const now = performance.now();
        for (const p of s.players) {
          if (p.id === me || !p.alive || p.away || role.partners.includes(p.name)) continue;
          const r = sampleRemote(p.id, now);
          if (!r) continue;
          out.push({ key: `imp-tag-${p.id}`, point: { x: r.x, z: r.z }, radius: IMP_TAG_RANGE - 0.25, priority: 2, label: T.imp.tagTarget(p.name), run: () => send("tag", { target: p.id }) });
        }
      }
    }
    if (mePlayer?.alive)
      for (const f of s.frozen) out.push({ key: `imp-body-${f.id}`, point: { x: f.x, z: f.z }, radius: IMP_REPORT_RANGE - 0.3, priority: 2, label: T.imp.report(f.name), run: () => send("report", { body: f.id }) });
    return out;
  },
  onEvent: (e) => {
    const s = actState<ImpState>(IMP_ID);
    const me = useApp.getState().selfId;
    const mine = inImp(s, me);
    switch (e.ev) {
      case "role": {
        const r = e.data as ImpRoleEvent;
        const prev = useImpLocal.getState().role;
        useImpLocal.setState({ role: { ...r, at: performance.now() } });
        if (!prev || prev.game !== r.game) {
          playSfx("imp-papel", true, undefined, { volume: 0.55 });
          openPanel("impostor", IMP_ID);
        }
        break;
      }
      case "task": {
        const { task } = e.data as { task: string };
        useImpLocal.setState((l) => (l.role ? { role: { ...l.role, done: [...l.role.done, task] } } : l));
        playSfx("desenho-acerto", true, undefined, { volume: 0.45 });
        break;
      }
      case "tagged":
        useImpLocal.setState({ working: null });
        playSfx("imp-congelar", true, undefined, { volume: 0.6 });
        openPanel("impostor", IMP_ID);
        break;
      case "meeting":
        if (mine) {
          playSfx("imp-reuniao", true, undefined, { volume: 0.55 });
          openPanel("impostor", IMP_ID);
        }
        break;
      case "result":
        if (mine) playSfx("grupo-revelar", true, undefined, { volume: 0.45 });
        break;
      case "final":
        if (mine) playSfx("grupo-fanfarra", true, undefined, { volume: 0.55 });
        break;
    }
  },
  Overlay: ImpOverlay,
  Scene: ImpostorScene,
};

// ---- camada de interface --------------------------------------------------------------------

function ImpOverlay() {
  const s = useImp();
  const panel = usePanel("impostor");
  const me = useSelfId();
  const zone = useSelfZone();
  const atConsole = useInteract((i) => i.target?.object?.type === "mission-console");
  const mine = inImp(s, me);
  const asked = useImpLocal((l) => l.asked);

  // Reconexão no meio da partida: pede o papel de novo.
  useEffect(() => {
    if (!s || !mine || s.phase === "lobby" || s.phase === "idle" || myRole(s) || asked === s.game) return;
    useImpLocal.setState({ asked: s.game });
    send("sync");
  }, [s, mine, asked]);

  let chip: ReactNode = null;
  if (!panel && s && s.phase !== "idle" && !atConsole) {
    if (mine)
      chip = (
        <FloatChip key="imp-back" onClick={() => openPanel("impostor", IMP_ID)} label={T.imp.chipBack}>
          <span className="grid size-7 place-items-center rounded-full bg-signal/15 text-signal">
            <Siren className="size-3.5" />
          </span>
          <span className="font-medium">{T.imp.chipBack}</span>
          {s.phase === "meeting" && <span className="size-2 animate-pulse rounded-full bg-orange" aria-hidden />}
        </FloatChip>
      );
    else if (s.phase === "lobby" && zone === IMP_ZONE)
      chip = (
        <FloatChip key="imp-join" onClick={joinImp} label={T.imp.chipJoin}>
          <span className="grid size-7 place-items-center rounded-full bg-orange text-offwhite">
            <Siren className="size-3.5" />
          </span>
          <span className="font-medium">{T.imp.chipJoin}</span>
          <span className="text-signal">· {T.imp.join}</span>
        </FloatChip>
      );
  }
  return (
    <>
      <AnimatePresence>{panel && <ImpPanel key="imp-panel" />}</AnimatePresence>
      <TaskProgress />
      <ChipDock>
        <AnimatePresence>{chip}</AnimatePresence>
      </ChipDock>
    </>
  );
}

/** Anel de progresso da tarefa em andamento (no centro, acima do botão de interação). */
function TaskProgress() {
  const w = useImpLocal((l) => l.working);
  const [, force] = useState(0);
  useEffect(() => {
    if (!w) return;
    const t = window.setInterval(() => force((n) => n + 1), 80);
    return () => window.clearInterval(t);
  }, [w]);
  if (!w) return null;
  const f = Math.min(1, (performance.now() - w.start) / IMP_TASK_MS);
  const spot = impSpots().get(w.task);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[38%] z-20 flex justify-center" role="status" aria-live="polite">
      <div className="glass flex items-center gap-3 rounded-2xl px-4 py-3">
        <svg viewBox="0 0 36 36" className="size-10 -rotate-90" aria-hidden>
          <circle cx="18" cy="18" r="15" fill="none" stroke="rgb(242 240 239 / 0.12)" strokeWidth="4" />
          <circle cx="18" cy="18" r="15" fill="none" stroke="#00B7FF" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${f * 94.2} 94.2`} />
        </svg>
        <div>
          <p className="text-sm font-medium">{T.imp.working(spot?.label ?? "")}</p>
          <p className="text-[11px] text-slate">{T.imp.stayClose}</p>
        </div>
      </div>
    </div>
  );
}

// ---- painel ---------------------------------------------------------------------------------

function ImpPanel() {
  const s = useImp();
  const me = useSelfId();
  if (!s) return null;
  const mine = inImp(s, me);
  const alive = s.players.filter((p) => p.alive && !p.away).length;
  const sub = (
    <>
      <span>Átrio</span>
      {s.phase !== "idle" && (
        <span className="inline-flex items-center gap-1">
          · <Users className="size-3" aria-hidden /> {s.phase === "lobby" ? s.players.length : `${alive}/${s.players.length}`}
        </span>
      )}
    </>
  );
  return (
    <GamePanelShell title={T.imp.title} sub={sub} icon={<Siren className="size-4" />} medium onClose={closePanel}>
      {!mine ? <Outside s={s} /> : s.phase === "lobby" ? <Lobby s={s} me={me!} /> : s.phase === "playing" ? <Playing s={s} me={me!} /> : s.phase === "meeting" ? <Meeting s={s} me={me!} /> : s.phase === "result" ? <Result s={s} /> : s.phase === "final" ? <Final s={s} me={me!} /> : null}
    </GamePanelShell>
  );
}

function Rules() {
  return (
    <ul className="flex flex-col gap-1 text-[13px] leading-snug text-offwhite/85">
      {T.imp.rules.map((r) => (
        <li key={r} className="flex gap-2">
          <span className="mt-[7px] size-1 shrink-0 rounded-full bg-offwhite/50" aria-hidden />
          {r}
        </li>
      ))}
    </ul>
  );
}

function Outside({ s }: { s: ImpState }) {
  const zone = useSelfZone();
  return (
    <>
      <Rules />
      {s.phase === "idle" || s.phase === "lobby" ? (
        zone === IMP_ZONE ? (
          <PrimaryButton onClick={joinImp} className="self-start">
            {T.imp.action}
          </PrimaryButton>
        ) : (
          <p className="text-xs text-slate">{T.imp.lobbyHint}</p>
        )
      ) : (
        <p className="text-xs text-slate">{T.imp.inProgress}</p>
      )}
    </>
  );
}

function Lobby({ s, me }: { s: ImpState; me: string }) {
  const owner = s.owner === me;
  return (
    <>
      <Rules />
      <section className="flex flex-col gap-1.5">
        <span className="label-caps">{T.players(s.players.length)}</span>
        <ul className="flex flex-wrap gap-1.5">
          {s.players.map((p) => (
            <li key={p.id} className={clsx("rounded-full px-2.5 py-1 text-xs ring-1", p.id === me ? "bg-signal/15 ring-signal/40" : "bg-offwhite/[0.06] ring-offwhite/10")}>
              {p.name}
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate">{T.imp.lobbyHint}</p>
      </section>
      <div className="flex items-center gap-2">
        <GhostButton
          onClick={() => {
            send("leave");
            closePanel();
          }}
        >
          {T.leave}
        </GhostButton>
        {owner && (
          <PrimaryButton className="ml-auto" onClick={() => send("start")} disabled={s.players.length < IMP_MIN_PLAYERS}>
            <Play className="size-4" />
            {T.imp.start}
          </PrimaryButton>
        )}
      </div>
      {owner && s.players.length < IMP_MIN_PLAYERS && <p className="-mt-1 text-right text-[11px] text-slate">{T.imp.needPlayers(IMP_MIN_PLAYERS)}</p>}
    </>
  );
}

function RoleCard({ role, alive }: { role: ImpRoleEvent; alive: boolean }) {
  const imp = role.role === "impostor";
  return (
    <motion.section
      initial={{ opacity: 0, rotateX: -40 }}
      animate={{ opacity: 1, rotateX: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={clsx("flex items-center gap-3 rounded-2xl p-3.5 ring-1", imp ? "bg-orange/12 ring-orange/50" : "bg-signal/[0.08] ring-signal/35")}
      data-imp-role={role.role}
    >
      <span className={clsx("grid size-11 shrink-0 place-items-center rounded-xl", imp ? "bg-orange text-offwhite" : "bg-signal/20 text-signal")}>{imp ? <Snowflake className="size-5" /> : <Users className="size-5" />}</span>
      <div className="min-w-0">
        <p className={clsx("font-display text-base font-bold uppercase tracking-[0.08em]", imp ? "text-orange" : "text-signal")}>{imp ? T.imp.impostor : T.imp.crew}</p>
        <p className="text-[12px] leading-snug text-offwhite/80">{!alive ? (imp ? T.imp.ghostImpostor : T.imp.ghost) : imp ? T.imp.impostorHint : T.imp.crewHint}</p>
        {imp && role.partners.length > 0 && <p className="mt-0.5 text-[11px] text-slate">{T.imp.partners(role.partners.join(", "))}</p>}
      </div>
    </motion.section>
  );
}

function Playing({ s, me }: { s: ImpState; me: string }) {
  const role = useImpLocal((l) => (l.role && l.role.game === s.game ? l.role : null));
  const p = s.players.find((x) => x.id === me);
  const alive = !!p?.alive;
  const f = s.progress.total ? s.progress.done / s.progress.total : 0;
  const usedEmergency = s.emergencies.includes(me);
  return (
    <>
      {role && <RoleCard role={role} alive={alive} />}
      <section className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="label-caps">{T.imp.progress}</span>
          <span className="font-display text-xs tabular-nums">
            {s.progress.done}/{s.progress.total}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-offwhite/10" role="progressbar" aria-label={T.imp.progress} aria-valuemin={0} aria-valuemax={s.progress.total} aria-valuenow={s.progress.done}>
          <div className="h-full rounded-full bg-ok transition-[width] duration-500 ease-out" style={{ width: `${f * 100}%` }} />
        </div>
      </section>
      {role?.role === "impostor" && alive && <TagStatus role={role} />}
      {role && <TaskList role={role} />}
      {alive && (
        <div className="flex justify-end">
          <GhostButton onClick={() => send("emergency")} disabled={usedEmergency}>
            <Megaphone className="size-3.5" />
            {usedEmergency ? T.imp.emergencyUsed : T.imp.emergency}
          </GhostButton>
        </div>
      )}
    </>
  );
}

function TagStatus({ role }: { role: ImpRoleEvent & { at: number } }) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => force((n) => n + 1), 500);
    return () => window.clearInterval(t);
  }, []);
  const left = Math.max(0, role.at + role.tagIn - performance.now());
  return (
    <p className={clsx("flex items-center gap-2 rounded-xl px-3 py-2 text-xs ring-1", left > 0 ? "text-slate ring-offwhite/10" : "text-offwhite ring-orange/40")} aria-live="polite">
      <Snowflake className="size-3.5 shrink-0" />
      {left > 0 ? T.imp.tagIn(Math.ceil(left / 1000)) : T.imp.tagReady}
    </p>
  );
}

function TaskList({ role }: { role: ImpRoleEvent }) {
  const working = useImpLocal((l) => l.working);
  const spots = impSpots();
  return (
    <section className="flex flex-col gap-1.5">
      <span className="label-caps">{role.role === "impostor" ? T.imp.fakeTasks : T.imp.tasks}</span>
      <ul className="flex flex-col gap-1">
        {role.tasks.map((id) => {
          const spot = spots.get(id);
          if (!spot) return null;
          const done = role.done.includes(id);
          return (
            <li key={id} className={clsx("flex items-center gap-2.5 rounded-xl px-3 py-2 ring-1", done ? "bg-ok/[0.06] ring-ok/25" : "bg-offwhite/[0.035] ring-offwhite/8")} data-imp-task={id} data-done={done || undefined}>
              <span className={clsx("grid size-5 shrink-0 place-items-center rounded-full ring-1", done ? "bg-ok text-space ring-ok" : "ring-offwhite/25")}>{done && <Check className="size-3" />}</span>
              <span className="min-w-0 flex-1">
                <span className={clsx("block truncate text-sm", done && "text-slate line-through")}>{spot.label}</span>
                <span className="block text-[11px] text-slate">{spot.zoneName}</span>
              </span>
              {!done && (
                <GhostButton onClick={() => walkTo(spot.point)} label={`${T.imp.goThere}: ${spot.label}`}>
                  <Footprints className="size-3.5" />
                  {working?.task === id ? `${Math.round(Math.min(1, (performance.now() - working.start) / IMP_TASK_MS) * 100)}%` : T.imp.goThere}
                </GhostButton>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---- reunião --------------------------------------------------------------------------------

function Meeting({ s, me }: { s: ImpState; me: string }) {
  const left = useLeft(s);
  const m = s.meeting!;
  const [text, setText] = useState("");
  const list = useRef<HTMLOListElement>(null);
  const meP = s.players.find((p) => p.id === me);
  const alive = !!meP?.alive;
  const living = s.players.filter((p) => p.alive && !p.away);
  const voted = living.filter((p) => p.voted).length;
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [m.chat.length]);
  return (
    <>
      <section className="flex items-center gap-3 rounded-2xl bg-orange/10 p-3 ring-1 ring-orange/40" role="status">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-orange text-offwhite">
          <Siren className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-bold uppercase tracking-[0.08em]">{T.imp.meeting}</p>
          <p className="text-[12px] text-offwhite/85">{T.imp.meetingBy(m.by, m.body)}</p>
        </div>
        <Seconds left={left} className="text-sm" />
      </section>
      <TimeBar left={left} total={s.duration} />
      <ol ref={list} className="flex max-h-40 min-h-16 flex-col gap-0.5 overflow-y-auto rounded-xl bg-deep/60 p-2 text-[13px] ring-1 ring-offwhite/8" aria-live="polite" aria-label={T.imp.meeting}>
        {m.chat.map((c, i) => (
          <li key={i} className="leading-snug text-offwhite/85">
            <span className="font-medium text-offwhite">{c.name}:</span> {c.text}
          </li>
        ))}
      </ol>
      {alive && (
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            send("chat", { text: text.trim() });
            setText("");
          }}
        >
          <input value={text} maxLength={IMP_CHAT_MAX} onChange={(e) => setText(e.target.value)} placeholder={T.imp.chatPlaceholder} aria-label={T.imp.chatLabel} className="min-w-0 flex-1 rounded-xl border border-offwhite/10 bg-deep px-3 py-2 text-sm placeholder:text-slate/70 focus:border-signal focus:outline-none" />
          <button type="submit" className="rounded-xl bg-offwhite px-3 py-2 text-xs font-semibold text-space hover:bg-offwhite/90">
            {T.imp.send}
          </button>
        </form>
      )}
      <section className="flex flex-col gap-1.5" aria-label={T.imp.vote}>
        <div className="flex items-center justify-between">
          <span className="label-caps">{T.imp.vote}</span>
          <span className="text-[11px] text-slate">{T.imp.votedCount(voted, living.length)}</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {s.players.map((p) => {
            const can = alive && !meP?.voted && p.alive && !p.away;
            return (
              <button
                key={p.id}
                type="button"
                disabled={!can}
                onClick={() => send("vote", { target: p.id })}
                aria-label={T.imp.voteFor(p.name)}
                className={clsx("flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm ring-1 transition-colors disabled:cursor-default", p.alive && !p.away ? "bg-offwhite/[0.05] ring-offwhite/12 enabled:hover:bg-offwhite/[0.1] enabled:hover:ring-orange/60" : "opacity-45 ring-offwhite/6")}
              >
                <span className="min-w-0 flex-1 truncate">
                  {p.name}
                  {p.id === me && <span className="ml-1 text-xs text-slate">({T.you})</span>}
                </span>
                {!p.alive && <Snowflake className="size-3.5 shrink-0 text-sky" aria-label={T.imp.frozenTag} />}
                {p.voted && <Check className="size-3.5 shrink-0 text-ok" aria-label={T.imp.votedTag} />}
              </button>
            );
          })}
        </div>
        {alive && !meP?.voted ? (
          <GhostButton onClick={() => send("vote", { target: "skip" })} className="self-end">
            {T.imp.skip}
          </GhostButton>
        ) : (
          <p className="text-right text-xs text-slate">{alive ? T.imp.voted : T.imp.ghostNoVote}</p>
        )}
      </section>
    </>
  );
}

function Result({ s }: { s: ImpState }) {
  const r = s.result!;
  return (
    <motion.section initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-2 py-6 text-center" role="status">
      <Snowflake className="size-9 text-sky" />
      <p className="font-display text-lg font-bold uppercase tracking-[0.06em]">{r.ejected ? T.imp.ejected(r.ejected) : T.imp.nobody}</p>
      {r.ejected && <p className={clsx("text-sm font-medium", r.wasImpostor ? "text-ok" : "text-warn")}>{r.wasImpostor ? T.imp.wasImpostor : T.imp.wasNot}</p>}
    </motion.section>
  );
}

function Final({ s, me }: { s: ImpState; me: string }) {
  const f = s.final!;
  const role = useImpLocal((l) => (l.role && l.role.game === s.game ? l.role : null));
  const won = role?.role === f.winner;
  return (
    <>
      <section
        className="relative overflow-hidden rounded-2xl p-4 text-offwhite"
        style={won ? { background: "linear-gradient(125deg, #EC5C2A 0%, #C14F2C 14%, #432932 32%, #071734 52%, #1B4C72 74%, #368BBA 88%, #46AFE3 100%)" } : undefined}
        data-imp-final={f.winner}
      >
        {!won && <div className="absolute inset-0 bg-card/80 ring-1 ring-offwhite/10" aria-hidden />}
        <div className="relative flex items-center gap-3">
          {won ? <img src="/brand/sparkle-white.svg" alt="" aria-hidden className="size-8" /> : <Snowflake className="size-7 text-sky" />}
          <div>
            <p className="font-display text-lg font-bold uppercase tracking-[0.06em]">{f.winner === "crew" ? T.imp.crewWon : T.imp.impostorWon}</p>
            <p className="text-[13px] text-offwhite/85">{T.imp.impostorsWere(f.impostors.join(", "))}</p>
          </div>
        </div>
      </section>
      <ul className="flex flex-wrap gap-1.5">
        {s.players.map((p) => (
          <li key={p.id} className={clsx("rounded-full px-2.5 py-1 text-xs ring-1", f.impostors.includes(p.name) ? "bg-orange/12 ring-orange/40" : "bg-offwhite/[0.05] ring-offwhite/10", p.id === me && "font-semibold")}>
            {p.name}
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-end gap-2">
        <GhostButton
          onClick={() => {
            send("leave");
            closePanel();
          }}
        >
          {T.leave}
        </GhostButton>
        <PrimaryButton onClick={() => send("again")}>{T.playAgain}</PrimaryButton>
      </div>
    </>
  );
}

