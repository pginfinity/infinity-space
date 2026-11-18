import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { clsx } from "clsx";
import { Ban, Check, Clock, Flag, MessageCircleMore, Pencil, Play, Shuffle, SkipForward, Users } from "lucide-react";
import {
  PAL_EDIT_RANGE,
  PAL_GUESS_GAP_MS,
  PAL_GUESS_MAX,
  PAL_HINT_GAP_MS,
  PAL_HINT_MAX,
  PAL_ID,
  PAL_KIND,
  PAL_MIN_PLAYERS,
  PAL_ROUNDS,
  PAL_SECONDS,
  PAL_TEAMS_FROM,
  PAL_ZONE,
  palDeckSize,
  palRole,
  palUsesTeams,
  type PalBank,
  type PalCardEvent,
  type PalDone,
  type PalFeedItem,
  type PalMode,
  type PalPlayer,
  type PalRole,
  type PalState,
} from "@infinity/world";
import { actState, sendAct, useAct, type ActivityClient } from "../registry.ts";
import { useApp } from "../../state/store.ts";
import { useInteract } from "../../engine/interact.ts";
import { walkTo } from "../../engine/movement.ts";
import { registerCommand } from "../../presence/store.ts";
import { ChipDock, FloatChip, GamePanelShell, GhostButton, Podium, PrimaryButton, Seconds, Segmented, TimeBar, closePanel, openPanel, playSfx, selfZone, useGrupoUi, useLeft, usePanel, useSelfId, useSelfZone, type ScoreRow } from "./shared.tsx";
import { PAL_TEAM_COLORS, PalavraScene, palBoardPoint, palBoardPos, useNearBoard } from "./palavraScene.tsx";
import { PalEditor } from "./palavraEditor.tsx";
import { cardMatches, usePalLocal } from "./palavraStore.ts";
import { T } from "./strings.ts";

/**
 * Palavra secreta no Marketing Studio: entra pelo painel de letras (E), pelo convite ou pela busca.
 * Quem dá as dicas vê a carta (palavra e proibidas); o time da vez chuta; o outro time fiscaliza.
 * A carta só chega por evento a quem pode ver; quem chuta nunca a recebe. O banco de cartas só chega
 * a quem abre o editor, perto do painel e sem partida em andamento.
 */

const send = (op: string, data?: unknown) => sendAct(PAL_ID, op, data);
const usePal = () => useAct<PalState>(PAL_ID);

/** Respeita o intervalo mínimo do servidor entre dois pedidos iguais (senão o segundo se perderia). */
const lastSent = new Map<string, number>();
function sendSpaced(op: string, data: unknown, gap: number): void {
  const now = performance.now();
  const at = Math.max(now, (lastSent.get(op) ?? -Infinity) + gap + 80);
  lastSent.set(op, at);
  if (at <= now) send(op, data);
  else window.setTimeout(() => send(op, data), at - now);
}

function inPal(s: PalState | undefined, me: string | null): boolean {
  return !!s && !!me && s.players.some((p) => p.id === me && !p.away);
}

function joinPal(): void {
  send("join");
  openPanel("palavra", PAL_ID);
  playSfx("grupo-entrar", true, undefined, { volume: 0.5 });
}

function leavePal(): void {
  send("leave");
  closePanel();
}

const inTurn = (s: PalState) => s.phase === "ready" || s.phase === "playing" || s.phase === "turnEnd";

export const palavraClient: ActivityClient = {
  name: "grupo/palavra",
  kinds: [PAL_KIND],
  objects: ["word-board"],
  label: () => (inPal(actState<PalState>(PAL_ID), useApp.getState().selfId) ? T.pal.chipBack : T.pal.action),
  use: () => (inPal(actState<PalState>(PAL_ID), useApp.getState().selfId) ? openPanel("palavra", PAL_ID) : joinPal()),
  onEvent: (e) => {
    const me = useApp.getState().selfId;
    const mine = inPal(actState<PalState>(PAL_ID), me);
    const at = palBoardPos();
    switch (e.ev) {
      case "card":
        usePalLocal.setState({ card: e.data as PalCardEvent });
        break;
      case "bank":
        usePalLocal.setState({ bank: e.data as PalBank, bankError: null });
        break;
      case "bankError":
        usePalLocal.setState({ bankError: (e.data as { reason: string }).reason });
        break;
      case "close":
        usePalLocal.setState({ close: { text: (e.data as { text: string }).text, key: performance.now() } });
        playSfx("desenho-quase", true, undefined, { volume: 0.4 });
        break;
      case "blocked": {
        const d = e.data as { text: string; word: string };
        usePalLocal.setState({ blocked: { text: d.text, word: d.word, key: performance.now() } });
        playSfx("grupo-erro", true, undefined, { volume: 0.35 });
        break;
      }
      case "turn":
        if (mine) {
          openPanel("palavra", PAL_ID);
          playSfx("desenho-vez", true, undefined, { volume: (e.data as { giver: string }).giver === me ? 0.6 : 0.35 });
        }
        break;
      case "go":
        playSfx("stop-largada", mine, at, { volume: 0.4 });
        break;
      case "hit":
        playSfx("grupo-acerto", mine, at, { volume: 0.45 });
        break;
      case "skip":
        if (mine) playSfx("palavra-pular", true, undefined, { volume: 0.4 });
        break;
      case "flag":
        playSfx("palavra-proibida", mine, at, { volume: 0.5 });
        break;
      case "forbidden":
        playSfx("grupo-erro", mine, at, { volume: 0.4 });
        break;
      case "turnEnd":
        playSfx("grupo-revelar", mine, at, { volume: 0.4 });
        break;
      case "final":
        playSfx("grupo-fanfarra", mine, at, { volume: 0.55 });
        break;
    }
  },
  Overlay: PalOverlay,
  Scene: PalavraScene,
};

// Busca (Ctrl+K): abre o painel e, de longe, leva até o painel de letras.
registerCommand({
  key: "palavra-secreta",
  label: T.pal.title,
  hint: T.pal.commandHint,
  keywords: T.pal.commandKeywords,
  icon: MessageCircleMore,
  run: () => {
    openPanel("palavra", PAL_ID);
    if (selfZone() !== PAL_ZONE) walkTo(palBoardPoint());
  },
});

// ---- camada de interface --------------------------------------------------------------------

function PalOverlay() {
  const s = usePal();
  const panel = usePanel("palavra");
  const me = useSelfId();
  const zone = useSelfZone();
  const atBoard = useInteract((i) => i.target?.object?.type === "word-board");
  const mine = inPal(s, me);
  useCardSync(s, me);
  useCloseEditorOnPlay(s);

  let chip: ReactNode = null;
  if (!panel && s && s.phase !== "idle" && !atBoard) {
    if (mine) {
      const myTurn = s.giver === me && (s.phase === "ready" || s.phase === "playing");
      const label = myTurn ? T.pal.chipYourTurn : T.pal.chipBack;
      chip = (
        <FloatChip key="pal-back" onClick={() => openPanel("palavra", PAL_ID)} label={label}>
          <span className="grid size-7 place-items-center rounded-full bg-signal/15 text-signal">
            <MessageCircleMore className="size-3.5" />
          </span>
          <span className="font-medium">{label}</span>
          {myTurn && <span className="size-2 animate-pulse rounded-full bg-orange" aria-hidden />}
        </FloatChip>
      );
    } else if (zone === PAL_ZONE && s.phase !== "final")
      chip = (
        <FloatChip key="pal-join" onClick={joinPal} label={T.pal.chipJoin}>
          <span className="grid size-7 place-items-center rounded-full bg-orange text-offwhite">
            <MessageCircleMore className="size-3.5" />
          </span>
          <span className="font-medium">{T.pal.chipJoin}</span>
          <span className="text-signal">· {T.pal.join}</span>
        </FloatChip>
      );
  }
  return (
    <>
      <AnimatePresence>{panel && <PalPanel key="pal-panel" view={panel.view} />}</AnimatePresence>
      <ChipDock>
        <AnimatePresence>{chip}</AnimatePresence>
      </ChipDock>
    </>
  );
}

/**
 * A carta vem por evento, separada do estado: se quem pode ver ficar sem a carta atual (chegou antes
 * do estado, ou a pessoa reconectou), pede de novo uma vez.
 */
function useCardSync(s: PalState | undefined, me: string | null): void {
  const card = usePalLocal((l) => l.card);
  const role = s ? palRole(s, me) : null;
  const need = !!s && s.phase === "playing" && (role === "giver" || role === "judge") && !cardMatches(card, s);
  const key = s ? `${s.game}:${s.turn}:${s.cardNo}` : "";
  useEffect(() => {
    if (!need) return;
    const t = window.setTimeout(() => {
      if (usePalLocal.getState().asked === key) return;
      usePalLocal.setState({ asked: key });
      send("sync");
    }, 1200);
    return () => window.clearTimeout(t);
  }, [need, key]);
}

/** Começou uma partida: o banco sai da memória e o editor fecha (no meio do jogo, ninguém olha as cartas). */
function useCloseEditorOnPlay(s: PalState | undefined): void {
  const playing = !!s && inTurn(s);
  useEffect(() => {
    if (!playing) return;
    usePalLocal.setState({ bank: null, bankError: null });
    const p = useGrupoUi.getState().panel;
    if (p?.game === "palavra" && p.view === "editor") openPanel("palavra", PAL_ID);
  }, [playing]);
}

/** Botão do editor de cartas: só perto do painel de letras. */
function EditCardsButton() {
  // Um pouco antes do limite do servidor (as posições dos dois lados diferem um tiquinho).
  const near = useNearBoard(PAL_EDIT_RANGE - 0.3);
  if (!near) return null;
  return (
    <button type="button" onClick={() => openPanel("palavra", PAL_ID, "editor")} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-signal hover:bg-signal/10">
      <Pencil className="size-3" aria-hidden />
      {T.pal.editCards}
    </button>
  );
}

/** A carta atual, se esta pessoa pode vê-la. */
function useCard(s: PalState): PalCardEvent | null {
  return usePalLocal((l) => (cardMatches(l.card, s) ? l.card : null));
}

// ---- painel ---------------------------------------------------------------------------------

function PalPanel({ view }: { view?: string }) {
  const s = usePal();
  const me = useSelfId();
  if (view === "editor") return <PalEditor />;
  if (!s) return null;
  const mine = inPal(s, me);
  const n = s.players.filter((p) => !p.away).length;
  const sub = (
    <>
      <span>{T.pal.sub}</span>
      {inTurn(s) && <span>· {T.pal.turnOf(s.turn, s.turns)}</span>}
      {s.phase !== "idle" && (
        <span className="inline-flex items-center gap-1">
          · <Users className="size-3" aria-hidden /> {n}
        </span>
      )}
    </>
  );
  return (
    <GamePanelShell title={T.pal.title} sub={sub} icon={<MessageCircleMore className="size-4" />} medium onClose={closePanel}>
      {!mine ? <Outside s={s} /> : s.phase === "lobby" ? <Lobby s={s} me={me!} /> : inTurn(s) ? <Game s={s} me={me!} /> : s.phase === "final" ? <Final s={s} me={me!} /> : null}
    </GamePanelShell>
  );
}

function Rules() {
  return (
    <ul className="flex flex-col gap-1 text-[13px] leading-snug text-offwhite/85">
      {T.pal.rules.map((r, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-[7px] size-1 shrink-0 rounded-full bg-offwhite/50" aria-hidden />
          {r}
        </li>
      ))}
    </ul>
  );
}

function Outside({ s }: { s: PalState }) {
  const zone = useSelfZone();
  return (
    <>
      <Rules />
      {zone === PAL_ZONE ? (
        <div className="flex flex-wrap items-center gap-2">
          <PrimaryButton onClick={joinPal}>{T.pal.action}</PrimaryButton>
          {!inTurn(s) && <EditCardsButton />}
        </div>
      ) : (
        <p className="text-xs text-slate">{T.pal.lobbyHint}</p>
      )}
      {inTurn(s) && <Scores s={s} />}
    </>
  );
}

// ---- lobby ----------------------------------------------------------------------------------

function Lobby({ s, me }: { s: PalState; me: string }) {
  const owner = s.owner === me;
  const act = s.players.filter((p) => !p.away);
  const n = act.length;
  const teams = palUsesTeams(n, s.mode);
  const cards = palDeckSize(s.catalog, s.themes);
  return (
    <>
      <Rules />
      <section className="flex flex-col gap-1.5" aria-label={T.pal.themes}>
        <div className="flex items-center justify-between">
          <span className="label-caps">{T.pal.themes}</span>
          <EditCardsButton />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {s.catalog.map((t) => {
            const on = s.themes.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={on}
                disabled={!owner || (on && s.themes.length === 1) || (!on && t.count === 0)}
                onClick={() => send("config", { themes: on ? s.themes.filter((x) => x !== t.id) : [...s.themes, t.id] })}
                className={clsx(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ring-1 transition-colors disabled:cursor-default",
                  on ? "bg-offwhite/[0.1] text-offwhite ring-offwhite/25" : "text-slate ring-offwhite/10 enabled:hover:text-offwhite",
                )}
                data-pal-theme={t.label}
              >
                {on && <Check className="size-3" aria-hidden />}
                {t.label}
                <span className="tabular-nums opacity-60">{t.count}</span>
              </button>
            );
          })}
        </div>
        {cards === 0 && <p className="text-[11px] text-warn">{T.pal.emptyThemes}</p>}
      </section>
      {n >= PAL_TEAMS_FROM && <ModePick mode={s.mode} owner={owner} />}
      <section className="flex flex-col gap-2 rounded-xl bg-offwhite/[0.03] p-3 ring-1 ring-offwhite/8">
        <Segmented label={T.pal.seconds} value={s.seconds} options={PAL_SECONDS} disabled={!owner} onChange={(v) => send("config", { seconds: v })} format={(v) => `${v}s`} />
        <Segmented label={T.pal.rounds} value={s.rounds} options={PAL_ROUNDS} disabled={!owner} onChange={(v) => send("config", { rounds: v })} />
        <p className="text-[11px] text-slate">{T.pal.roundsHint}</p>
      </section>
      <section className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="label-caps">{teams ? T.pal.teams : T.pal.coopTeam}</span>
          {owner && teams && (
            <button type="button" onClick={() => send("shuffle")} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate hover:bg-offwhite/8 hover:text-offwhite">
              <Shuffle className="size-3" aria-hidden />
              {T.pal.shuffle}
            </button>
          )}
        </div>
        {teams ? (
          <div className="grid grid-cols-2 gap-2">
            {[0, 1].map((t) => (
              <TeamBox key={t} index={t} name={s.teams[t]?.name ?? ""} members={act.filter((p) => p.team === t)} me={me} />
            ))}
          </div>
        ) : (
          <>
            <Members list={act} me={me} />
            {n < PAL_TEAMS_FROM && <p className="text-[11px] text-slate">{T.pal.coopHint}</p>}
          </>
        )}
        <p className="text-xs text-slate">{T.pal.lobbyHint}</p>
      </section>
      <div className="flex items-center gap-2">
        <GhostButton onClick={leavePal}>{T.leave}</GhostButton>
        {owner && (
          <PrimaryButton className="ml-auto" onClick={() => send("start")} disabled={n < PAL_MIN_PLAYERS || cards === 0}>
            <Play className="size-4" />
            {T.pal.start}
          </PrimaryButton>
        )}
      </div>
      {owner && n < PAL_MIN_PLAYERS && <p className="-mt-1 text-right text-[11px] text-slate">{T.pal.needPlayers(PAL_MIN_PLAYERS)}</p>}
    </>
  );
}

/** Com 4 pessoas ou mais, quem abriu a mesa escolhe: dois times ou todos juntos. */
function ModePick({ mode, owner }: { mode: PalMode; owner: boolean }) {
  const options: { v: PalMode; title: string; hint: string }[] = [
    { v: "teams", title: T.pal.modeTeams, hint: T.pal.modeTeamsHint },
    { v: "coop", title: T.pal.modeCoop, hint: T.pal.modeCoopHint },
  ];
  return (
    <section className="flex flex-col gap-1.5">
      <span className="label-caps" id="pal-mode-label">
        {T.pal.mode}
      </span>
      <div className="grid gap-1.5 sm:grid-cols-2" role="radiogroup" aria-labelledby="pal-mode-label">
        {options.map((o) => {
          const on = mode === o.v;
          return (
            <button
              key={o.v}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={!owner}
              onClick={() => send("config", { mode: o.v })}
              className={clsx(
                "flex flex-col items-start gap-0.5 rounded-xl px-3 py-2 text-left ring-1 transition-colors disabled:cursor-default",
                on ? "bg-signal/12 ring-signal/50" : "bg-offwhite/[0.035] ring-offwhite/8 enabled:hover:bg-offwhite/[0.07]",
              )}
              data-pal-mode={o.v}
            >
              <span className="flex items-center gap-1.5 text-sm font-medium">
                {on && <Check className="size-3.5 text-signal" aria-hidden />}
                {o.title}
              </span>
              <span className="text-[11px] leading-snug text-slate">{o.hint}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Members({ list, me }: { list: readonly PalPlayer[]; me: string | null }) {
  return (
    <ul className="flex flex-wrap gap-1">
      {list.map((p) => (
        <li key={p.id} className={clsx("rounded-full px-2.5 py-0.5 text-xs ring-1", p.id === me ? "bg-signal/15 ring-signal/40" : "bg-offwhite/[0.06] ring-offwhite/10")}>
          {p.name}
        </li>
      ))}
    </ul>
  );
}

function TeamBox({ index, name, members, me }: { index: number; name: string; members: readonly PalPlayer[]; me: string | null }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-offwhite/[0.03] p-2.5 ring-1 ring-offwhite/8" data-pal-teambox={index}>
      <p className="flex items-center gap-1.5 text-xs font-semibold">
        <span className="size-2 rounded-full" style={{ background: PAL_TEAM_COLORS[index] }} aria-hidden />
        {T.pal.team(name)}
      </p>
      <Members list={members} me={me} />
    </div>
  );
}

// ---- partida --------------------------------------------------------------------------------

/** Placar dos times; o time da vez fica marcado. */
function Scores({ s }: { s: PalState }) {
  const playing = inTurn(s);
  return (
    <div className={clsx("grid gap-2", s.teams.length > 1 ? "grid-cols-2" : "grid-cols-1")} aria-label={T.scoreboard}>
      {s.teams.map((t, i) => {
        const turn = playing && s.team === i;
        return (
          <div key={i} className={clsx("flex items-center gap-2 rounded-xl px-3 py-2 ring-1 transition-colors", turn ? "bg-offwhite/[0.08] ring-offwhite/30" : "bg-offwhite/[0.03] ring-offwhite/8")}>
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: PAL_TEAM_COLORS[i] }} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{t.name}</span>
            {turn && !s.coop && <span className="text-[10px] uppercase tracking-[0.14em] text-slate">{T.pal.turnTag}</span>}
            <span className="font-display text-xl tabular-nums" data-pal-score={i}>
              {t.score}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Game({ s, me }: { s: PalState; me: string }) {
  const left = useLeft(s);
  const role = palRole(s, me);
  const giver = s.players.find((p) => p.id === s.giver);
  const team = s.coop ? null : (s.teams[s.team]?.name ?? null);
  return (
    <>
      <Scores s={s} />
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 truncate text-sm text-offwhite/85" aria-live="polite">
          {giver ? (giver.id === me ? T.pal.youGiveLine(team) : T.pal.giverFor(giver.name, team)) : ""}
        </p>
        {s.phase !== "turnEnd" && <Seconds left={left} className="text-sm" />}
      </div>
      <TimeBar left={left} total={s.duration} />
      {s.phase === "ready" ? (
        <Ready s={s} role={role} left={left} />
      ) : s.phase === "turnEnd" ? (
        <TurnEnd s={s} />
      ) : role === "giver" ? (
        <GiverView s={s} />
      ) : role === "judge" ? (
        <JudgeView s={s} />
      ) : (
        <GuesserView s={s} />
      )}
      {s.phase === "playing" && s.done.length > 0 && <DoneList done={s.done} />}
      {s.phase !== "turnEnd" && <Feed s={s} />}
      <div className="flex items-center">
        <GhostButton onClick={leavePal}>{T.leave}</GhostButton>
      </div>
    </>
  );
}

function Ready({ s, role, left }: { s: PalState; role: PalRole | null; left: number }) {
  const giver = s.players.find((p) => p.id === s.giver);
  if (role === "giver")
    return (
      <section className="flex flex-col items-start gap-2 rounded-xl bg-offwhite/[0.04] p-3.5 ring-1 ring-offwhite/10" data-pal-ready="giver">
        <p className="font-display text-base font-bold uppercase tracking-[0.06em]">{T.pal.youGive}</p>
        <p className="text-[13px] leading-snug text-offwhite/80">{T.pal.youGiveHint}</p>
        <div className="flex w-full flex-wrap items-center gap-3">
          <PrimaryButton onClick={() => send("go")}>
            <Play className="size-4" />
            {T.pal.go}
          </PrimaryButton>
          <span className="text-xs text-slate">{T.pal.autoStart(Math.ceil(left / 1000))}</span>
        </div>
      </section>
    );
  return (
    <section className="rounded-xl bg-offwhite/[0.04] p-3.5 ring-1 ring-offwhite/10" data-pal-ready={role ?? "out"}>
      <p className="text-sm font-medium">{T.pal.getReady(giver?.name ?? "")}</p>
      <p className="mt-1 text-[13px] leading-snug text-offwhite/75">{role === "judge" ? T.pal.youJudge : T.pal.yourTeamGuesses}</p>
    </section>
  );
}

/** A carta: palavra secreta e as proibidas (só para quem dá as dicas e para quem fiscaliza). */
function SecretCard({ card, giver }: { card: PalCardEvent; giver: boolean }) {
  const theme = card.themeLabel;
  return (
    <motion.section key={`${card.turn}:${card.n}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="rounded-2xl bg-deep/70 p-4 ring-1 ring-offwhite/12" aria-label={T.pal.secret} data-pal-card>
      <p className="label-caps">
        {T.pal.secret} · {theme}
      </p>
      <p className={clsx("mt-1 break-words font-display font-black uppercase leading-tight tracking-[0.04em]", giver ? "text-3xl text-orange" : "text-2xl text-offwhite")} data-pal-word={card.word}>
        {card.word}
      </p>
      <p className="mt-3 text-[11px] uppercase tracking-[0.14em] text-danger">{T.pal.forbidden}</p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label={T.pal.forbidden}>
        {card.forbidden.map((f) => (
          <li key={f} className="inline-flex items-center gap-1.5 rounded-lg bg-danger/10 px-2.5 py-1 text-sm text-offwhite ring-1 ring-danger/30" data-pal-forbidden={f}>
            <Ban className="size-3 text-danger" aria-hidden />
            {f}
          </li>
        ))}
      </ul>
    </motion.section>
  );
}

function CardWaiting() {
  return <div className="h-[132px] animate-pulse rounded-2xl bg-offwhite/[0.04] ring-1 ring-offwhite/8" aria-hidden />;
}

function GiverView({ s }: { s: PalState }) {
  const card = useCard(s);
  return (
    <>
      {card ? <SecretCard card={card} giver /> : <CardWaiting />}
      {s.flag ? (
        <FlagAsk name={s.flag.name} />
      ) : (
        <div className="flex items-center gap-2">
          <GhostButton onClick={() => send("skip")} disabled={s.skips <= 0} label={`${T.pal.skip} (${T.pal.skipsLeft(s.skips)})`}>
            <SkipForward className="size-3.5" />
            {T.pal.skip}
          </GhostButton>
          <span className="text-xs text-slate">{T.pal.skipsLeft(s.skips)}</span>
        </div>
      )}
      <HintForm />
    </>
  );
}

/** "Proibida!" apontado: quem dá as dicas decide. */
function FlagAsk({ name }: { name: string }) {
  return (
    <motion.section initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} role="alert" className="flex flex-col gap-2 rounded-xl bg-danger/10 p-3 ring-1 ring-danger/40">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Flag className="size-4 shrink-0 text-danger" aria-hidden />
        {T.pal.flagAsk(name)}
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={() => send("judge", { ok: true })} className="rounded-xl bg-danger/20 px-3 py-2 text-xs font-semibold text-offwhite ring-1 ring-danger/50 hover:bg-danger/30">
          {T.pal.flagYes}
        </button>
        <GhostButton onClick={() => send("judge", { ok: false })}>{T.pal.flagNo}</GhostButton>
      </div>
    </motion.section>
  );
}

function HintForm() {
  const [text, setText] = useState("");
  const blocked = usePalLocal((l) => l.blocked);
  const [showBlocked, setShowBlocked] = useState(false);
  useEffect(() => {
    if (!blocked) return;
    // A dica barrada volta para o campo, para ajustar.
    setText(blocked.text);
    setShowBlocked(true);
    const t = window.setTimeout(() => setShowBlocked(false), 4000);
    return () => window.clearTimeout(t);
  }, [blocked]);
  return (
    <div className="flex flex-col gap-1">
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const t = text.trim().slice(0, PAL_HINT_MAX);
          if (!t) return;
          sendSpaced("hint", { text: t }, PAL_HINT_GAP_MS);
          setText("");
          setShowBlocked(false);
        }}
      >
        <input
          value={text}
          maxLength={PAL_HINT_MAX}
          onChange={(e) => setText(e.target.value)}
          placeholder={T.pal.hintPlaceholder}
          aria-label={T.pal.hintLabel}
          aria-invalid={showBlocked}
          autoComplete="off"
          spellCheck={false}
          className={clsx("min-w-0 flex-1 rounded-xl border bg-deep px-3 py-2 text-sm placeholder:text-slate/70 focus:outline-none", showBlocked ? "border-warn" : "border-offwhite/10 focus:border-signal")}
        />
        <button type="submit" className="rounded-xl bg-offwhite px-3 py-2 text-xs font-semibold text-space hover:bg-offwhite/90">
          {T.pal.send}
        </button>
      </form>
      <AnimatePresence>
        {showBlocked && blocked && (
          <motion.p key={blocked.key} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-xs font-medium text-warn" role="status">
            {T.pal.blocked(blocked.word)}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

function JudgeView({ s }: { s: PalState }) {
  const card = useCard(s);
  const giver = s.players.find((p) => p.id === s.giver)?.name ?? "";
  return (
    <>
      <p className="text-[13px] leading-snug text-offwhite/80">{T.pal.youJudge}</p>
      {card ? <SecretCard card={card} giver={false} /> : <CardWaiting />}
      {s.flag ? (
        <p role="status" className="rounded-xl bg-offwhite/[0.04] px-3 py-2.5 text-sm text-offwhite/85 ring-1 ring-offwhite/10">
          {T.pal.flagWait(giver)}
        </p>
      ) : (
        <button
          type="button"
          onClick={() => send("flag")}
          aria-label={T.pal.flagLabel}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-danger/15 px-5 py-3 font-display text-lg font-black uppercase tracking-[0.08em] text-danger ring-1 ring-danger/50 transition-[background-color,transform] hover:bg-danger/25 active:scale-95"
        >
          <Flag className="size-5" aria-hidden />
          {T.pal.flag}
        </button>
      )}
    </>
  );
}

function GuesserView({ s }: { s: PalState }) {
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const close = usePalLocal((l) => l.close);
  const [showClose, setShowClose] = useState(false);
  const giver = s.players.find((p) => p.id === s.giver)?.name ?? "";
  const paused = !!s.flag;

  useEffect(() => {
    if (!close) return;
    setShowClose(true);
    const t = window.setTimeout(() => setShowClose(false), 2200);
    return () => window.clearTimeout(t);
  }, [close]);
  useEffect(() => {
    if (!paused) input.current?.focus({ preventScroll: true });
  }, [paused, s.turn]);

  return (
    <section className="flex flex-col gap-2 rounded-xl bg-offwhite/[0.04] p-3.5 ring-1 ring-offwhite/10" data-pal-guesser>
      <div>
        <p className="font-display text-base font-bold uppercase tracking-[0.06em]">{T.pal.guessTitle}</p>
        <p className="text-[13px] leading-snug text-offwhite/75">{paused ? T.pal.paused(giver) : T.pal.guessHint(giver)}</p>
      </div>
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const t = text.trim().slice(0, PAL_GUESS_MAX);
          if (!t || paused) return;
          sendSpaced("guess", { text: t }, PAL_GUESS_GAP_MS);
          setText("");
        }}
      >
        <input
          ref={input}
          value={text}
          disabled={paused}
          maxLength={PAL_GUESS_MAX}
          onChange={(e) => setText(e.target.value)}
          placeholder={T.pal.guessPlaceholder}
          aria-label={T.pal.guessLabel}
          autoComplete="off"
          spellCheck={false}
          className={clsx("min-w-0 flex-1 rounded-xl border bg-deep px-3 py-2 text-sm placeholder:text-slate/70 focus:outline-none disabled:opacity-50", showClose ? "border-warn" : "border-offwhite/10 focus:border-signal")}
        />
        <button type="submit" disabled={paused} className="rounded-xl bg-offwhite px-3 py-2 text-xs font-semibold text-space hover:bg-offwhite/90 disabled:opacity-40">
          {T.pal.send}
        </button>
      </form>
      <AnimatePresence>
        {showClose && close && (
          <motion.p key={close.key} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-xs font-medium text-warn" role="status">
            “{close.text}”: {T.pal.close}
          </motion.p>
        )}
      </AnimatePresence>
    </section>
  );
}

function ResultIcon({ r }: { r: PalDone["result"] }) {
  if (r === "hit") return <Check className="size-3 shrink-0" aria-hidden />;
  if (r === "forbidden") return <Ban className="size-3 shrink-0" aria-hidden />;
  if (r === "skip") return <SkipForward className="size-3 shrink-0" aria-hidden />;
  return <Clock className="size-3 shrink-0" aria-hidden />;
}

const RESULT_TONE: Record<PalDone["result"], string> = {
  hit: "bg-ok/10 text-ok ring-ok/30",
  forbidden: "bg-danger/10 text-danger ring-danger/30",
  skip: "bg-offwhite/[0.05] text-slate ring-offwhite/10",
  time: "bg-offwhite/[0.05] text-slate ring-offwhite/10",
};

/** Cartas já resolvidas nesta vez (podem ser vistas por todos). */
function DoneList({ done }: { done: readonly PalDone[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={T.pal.cardsLabel}>
      {done.map((d, i) => (
        <li key={`${i}-${d.word}`} className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ring-1", RESULT_TONE[d.result])} title={T.pal.result[d.result]}>
          <ResultIcon r={d.result} />
          {d.word}
        </li>
      ))}
    </ul>
  );
}

function TurnEnd({ s }: { s: PalState }) {
  const team = s.teams[s.team];
  return (
    <section className="flex flex-col gap-2 rounded-xl bg-offwhite/[0.04] p-3.5 ring-1 ring-offwhite/10" aria-live="polite" data-pal-turnend>
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-display text-sm font-bold uppercase tracking-[0.08em]">{T.pal.turnEnd}</p>
        <p className={clsx("font-display text-base tabular-nums", s.gain > 0 ? "text-ok" : s.gain < 0 ? "text-danger" : "text-slate")}>
          {s.coop ? "" : `${team?.name} `}
          {T.pal.turnGain(s.gain)}
        </p>
      </div>
      <ul className="flex flex-col gap-1">
        {s.done.map((d, i) => (
          <li key={`${i}-${d.word}`} className="flex items-center gap-2 text-sm">
            <span className={clsx("grid size-5 place-items-center rounded-full ring-1", RESULT_TONE[d.result])}>
              <ResultIcon r={d.result} />
            </span>
            <span className="min-w-0 flex-1 truncate">{d.word}</span>
            <span className="shrink-0 text-[11px] text-slate">{d.by ?? T.pal.result[d.result]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function FeedLine({ f }: { f: PalFeedItem }) {
  switch (f.k) {
    case "hint":
      return (
        <span className="text-sky">
          <MessageCircleMore className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />
          <span className="font-medium">{f.name}:</span> {f.text}
        </span>
      );
    case "guess":
      return (
        <span className="text-offwhite/85">
          <span className="font-medium text-offwhite">{f.name}:</span> {f.text}
        </span>
      );
    case "hit":
      return <span className="font-medium text-ok">{T.pal.feedHit(f.name, f.text ?? "")}</span>;
    case "skip":
      return <span className="text-slate">{T.pal.feedSkip(f.text ?? "")}</span>;
    case "flag":
      return <span className="text-danger">{T.pal.feedFlag(f.name)}</span>;
    case "forbidden":
      return <span className="text-danger">{T.pal.feedForbidden(f.text ?? "")}</span>;
    case "cleared":
      return <span className="text-slate">{T.pal.feedCleared}</span>;
    default:
      return <span className="text-slate">{f.text === "entrou" ? T.pal.feedJoined(f.name) : T.pal.feedLeft(f.name)}</span>;
  }
}

function Feed({ s }: { s: PalState }) {
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [s.feed]);
  return (
    <section className="flex flex-col gap-1.5">
      <span className="label-caps">{T.pal.feed}</span>
      <ol ref={list} className="flex max-h-40 min-h-14 flex-col gap-0.5 overflow-y-auto rounded-xl bg-deep/60 p-2 text-[13px] leading-snug ring-1 ring-offwhite/8" aria-live="polite" aria-label={T.pal.feed} data-pal-feed>
        {s.feed.length === 0 && <li className="text-slate">{T.pal.feedEmpty}</li>}
        {s.feed.map((f, i) => (
          <li key={`${s.turn}-${i}-${f.k}-${f.text ?? ""}`}>
            <FeedLine f={f} />
          </li>
        ))}
      </ol>
    </section>
  );
}

// ---- fim ------------------------------------------------------------------------------------

function Final({ s, me }: { s: PalState; me: string }) {
  const myTeam = s.players.find((p) => p.id === me)?.team ?? 0;
  const rows: ScoreRow[] = s.teams.map((t, i) => ({ id: `team-${i}`, name: t.name, score: t.score }));
  const coopScore = s.teams[0]?.score ?? 0;
  const title = s.coop ? (coopScore > 0 ? T.pal.coopFinal(coopScore) : T.pal.coopFinalNone) : s.winner === null ? T.pal.tie : s.winner === myTeam ? T.pal.yourTeamWon(s.teams[s.winner]!.name) : T.pal.winner(s.teams[s.winner]!.name);
  const act = s.players.filter((p) => !p.away);
  return (
    <>
      <div data-pal-final={s.coop ? "coop" : s.winner === null ? "tie" : String(s.winner)}>
        <Podium rows={rows} me={null} title={title} />
      </div>
      {s.coop ? (
        <Members list={act} me={me} />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {[0, 1].map((t) => (
            <TeamBox key={t} index={t} name={s.teams[t]?.name ?? ""} members={act.filter((p) => p.team === t)} me={me} />
          ))}
        </div>
      )}
      <div className="flex items-center justify-end gap-2">
        <GhostButton onClick={leavePal}>{T.leave}</GhostButton>
        <PrimaryButton onClick={() => send("again")}>{T.playAgain}</PrimaryButton>
      </div>
    </>
  );
}
