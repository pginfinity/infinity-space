import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { clsx } from "clsx";
import { Eye, Flag, LoaderCircle, LogOut, Trophy, X } from "lucide-react";
import { GAMES, canAct, gamePlayerCounts, winnersOf, type CheckersState, type ChessState, type Connect4State, type DominoState, type TicTacToeState, type TrucoState } from "@infinity/world";
import { useApp } from "../state/store.ts";
import { STATUS_COLOR } from "../world/theme.ts";
import { closeGame, leaveSeat, mySeat, seatPlayerName, sendGame, tableKind, useGamesUi, useTable, type Table } from "./api.ts";
import { ChessBoard, Captured } from "./ChessBoard.tsx";
import { Connect4Board } from "./Connect4Board.tsx";
import { TicTacToeBoard } from "./TicTacToeBoard.tsx";
import { CheckersBoard, CheckersLost, checkersEndingText } from "./CheckersBoard.tsx";
import { DominoBoard } from "./DominoBoard.tsx";
import { TrucoBoard } from "./TrucoBoard.tsx";
import { GameIcon, SeatToken } from "./tokens.tsx";
import { GAME_TITLE, PLAYERS_HINT, S, SEAT_NAME, endReasonText } from "./strings.ts";

const EASE = [0.16, 1, 0.3, 1] as const;

/** Mesa de mais de dois lugares (dominó, truco): outro arranjo de lugares, começar e revanche em grupo. */
const isMulti = (kind: string) => (GAMES[kind]?.seats ?? 2) > 2;
/** Lugares ocupados agora. */
const seatedOf = (t: Table) => t.seats.flatMap((id, i) => (id ? [i] : []));

/** Painel da mesa de jogo: lugares, vez, tabuleiro interativo e fim de jogo. */
export function GamePanel({ table }: { table: string }) {
  const t = useTable(table);
  const selfId = useApp((s) => s.selfId);
  // Assina a lista de pessoas para nomes e status ficarem em dia.
  useApp((s) => s.players);
  const kind = t?.kind ?? tableKind(table) ?? "";
  const title = GAME_TITLE[kind] ?? S.gameFallback;
  const seat = mySeat(t, selfId);

  return (
    <motion.aside
      role="dialog"
      aria-label={title}
      initial={{ opacity: 0, x: -18 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -18 }}
      transition={{ duration: 0.28, ease: EASE }}
      className={clsx(
        "glass pointer-events-auto absolute z-30 flex flex-col overflow-hidden rounded-[var(--radius-panel)] text-offwhite",
        // Celular: folha de baixo, largura toda. Telas maiores: coluna à esquerda.
        "inset-x-2 bottom-2 max-h-[calc(100dvh-72px)]",
        "sm:inset-x-auto sm:bottom-auto sm:left-3 sm:top-16 sm:w-[420px] sm:max-h-[calc(100dvh-64px-84px)]",
      )}
      data-game-panel={table}
    >
      <Header title={title} kind={kind} t={t} seat={seat} />
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-1 sm:pb-4">
        {t ? isMulti(kind) ? <MultiBody t={t} kind={kind} seat={seat} /> : <Body t={t} kind={kind} seat={seat} /> : <p className="py-10 text-center text-sm text-slate">{S.noTable}</p>}
      </div>
    </motion.aside>
  );
}

function Header({ title, kind, t, seat }: { title: string; kind: string; t: Table | null; seat: number }) {
  return (
    <header className="flex items-start gap-3 px-4 pb-2 pt-3.5">
      <GameIcon kind={kind} className="mt-0.5 size-8 shrink-0" />
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-[15px] font-bold uppercase leading-tight tracking-[0.1em]">{title}</h2>
        {t && <StatusLine t={t} seat={seat} kind={kind} />}
      </div>
      <button type="button" onClick={closeGame} className="-mr-1.5 rounded-lg p-2 text-slate transition-colors hover:bg-offwhite/8 hover:text-offwhite" aria-label={S.closeHint} title={S.closeHint}>
        <X className="size-4" />
      </button>
    </header>
  );
}

/** Linha de estado: de quem é a vez, xeque, fase. Anunciada para leitores de tela. */
function StatusLine({ t, seat, kind }: { t: Table; seat: number; kind: string }) {
  const s = t.state;
  let text: ReactNode;
  if (t.phase === "playing") {
    // Minha vez, ou entre quem responde agora (truco: a dupla que recebeu o pedido).
    const mine = canAct(s, seat);
    const check = kind === "chess" && (s as unknown as ChessState).check;
    text = (
      <>
        <span className={clsx("inline-flex items-center gap-1.5", mine ? "font-medium text-signal" : "text-offwhite/80")}>
          <span className={clsx("size-1.5 rounded-full", mine ? "animate-pulse bg-signal" : "bg-offwhite/50")} />
          {mine ? S.yourTurn : S.turnOf(seatPlayerName(t, s.turn) ?? SEAT_NAME[kind]?.[s.turn] ?? "")}
        </span>
        {check && <span className="font-semibold text-danger">{S.check}</span>}
      </>
    );
  } else if (t.phase === "finished") {
    text = <span className="text-offwhite/80">{S.finished}</span>;
  } else {
    const free = t.seats.filter((x) => x === null).length;
    text = <span className="text-slate">{free === 1 ? S.waitingOne : S.waiting}</span>;
  }
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[13px]" aria-live="polite">
      {text}
      {s.moves > 0 && <span className="text-slate">· {S.moves(s.moves)}</span>}
      {kind === "chess" && lastSan(s as unknown as ChessState) && (
        <span className="text-slate" title={S.lastMove}>
          · <span className="font-medium text-offwhite/80">{lastSan(s as unknown as ChessState)}</span>
        </span>
      )}
    </p>
  );
}

/** Último lance em notação algébrica com as letras em português (C cavalo, B bispo, T torre, D dama, R rei). */
function lastSan(s: ChessState): string | null {
  const san = s.san?.at(-1);
  if (!san) return null;
  const PT: Record<string, string> = { K: "R", Q: "D", R: "T", N: "C", B: "B" };
  return [...san].map((ch) => PT[ch] ?? ch).join("");
}

function Body({ t, kind, seat }: { t: Table; kind: string; seat: number }) {
  const canMove = t.phase === "playing" && seat >= 0 && t.state.turn === seat;
  // Quem joga fica embaixo; quem assiste vê o lugar 0 embaixo (brancas, no xadrez).
  const bottom = seat >= 0 ? seat : 0;
  const top = bottom === 0 ? 1 : 0;
  const notice = useGamesUi((s) => s.notice);
  const freeSeats = t.seats.filter((x) => x === null).length;

  return (
    <>
      <SeatStrip t={t} kind={kind} seat={top} me={seat} primary={freeSeats === 1} />
      <div className="mx-auto w-full" style={{ maxWidth: "max(240px, calc(100dvh - 400px))" }}>
        {kind === "chess" && <ChessBoard t={t as Table<ChessState>} seat={seat} canMove={canMove} />}
        {kind === "connect4" && <Connect4Board t={t as Table<Connect4State>} seat={seat} canMove={canMove} />}
        {kind === "tictactoe" && <TicTacToeBoard t={t as Table<TicTacToeState>} seat={seat} canMove={canMove} />}
        {kind === "checkers" && <CheckersBoard t={t as Table<CheckersState>} seat={seat} canMove={canMove} />}
      </div>
      <SeatStrip t={t} kind={kind} seat={bottom} me={seat} primary={freeSeats === 1} />
      {notice && (
        <p className="rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn" role="status">
          {notice}
        </p>
      )}
      <AnimatePresence mode="wait" initial={false}>
        {t.phase === "finished" ? <EndBanner key={`end-${t.state.round}`} t={t} kind={kind} seat={seat} /> : <Footer key="footer" t={t} seat={seat} />}
      </AnimatePresence>
    </>
  );
}

/** Corpo das mesas de quatro lugares: lugares em grade, a mesa do jogo e o rodapé. */
function MultiBody({ t, kind, seat }: { t: Table; kind: string; seat: number }) {
  const canMove = t.phase === "playing" && canAct(t.state, seat);
  const notice = useGamesUi((s) => s.notice);
  return (
    <>
      {/* No truco, durante a partida, os lugares aparecem em volta da mesa (nome, cartas e vez). */}
      {!(kind === "truco" && t.phase === "playing") && <SeatGrid t={t} kind={kind} me={seat} />}
      {kind === "domino" && <DominoBoard t={t as Table<DominoState>} seat={seat} canMove={canMove} />}
      {kind === "truco" && <TrucoBoard t={t as Table<TrucoState>} seat={seat} canMove={canMove} />}
      {notice && (
        <p className="rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn" role="status">
          {notice}
        </p>
      )}
      <AnimatePresence mode="wait" initial={false}>
        {t.phase === "finished" ? <EndBanner key={`end-${t.state.round}`} t={t} kind={kind} seat={seat} /> : <Footer key="footer" t={t} seat={seat} kind={kind} />}
      </AnimatePresence>
    </>
  );
}

/** Os quatro lugares em grade: quem está, quantas pedras ou cartas tem, de quem é a vez; ou o botão de sentar. */
function SeatGrid({ t, kind, me }: { t: Table; kind: string; me: number }) {
  const pending = useGamesUi((s) => s.pending);
  const { requestSeat, cancelSeat } = useGamesUi.getState();
  const players = useApp((s) => s.players);
  const st = t.state as unknown as { counts?: number[]; active?: number[]; teamOf?: number[] };
  // "Dupla" só com quatro na partida (mano a mano, cada um é a própria dupla).
  const teams = (st.active?.length ?? 0) === 4;
  return (
    <div className="grid grid-cols-2 gap-1.5" role="list">
      {t.seats.map((id, seat) => {
        const player = id ? players[id] : undefined;
        const name = id ? (player?.name ?? t.state.names?.[seat] ?? "—") : null;
        const isMe = me === seat;
        const active = t.phase === "playing" && canAct(t.state, seat);
        const winner = t.phase === "finished" && winnersOf(t.state).includes(seat);
        const count = t.phase !== "waiting" && st.active?.includes(seat) ? st.counts?.[seat] : undefined;
        const walking = pending?.table === t.table && pending.seat === seat;
        const canSit = !id && me < 0 && t.phase !== "playing";
        const seatName = SEAT_NAME[kind]?.[seat] ?? S.seatFallback(seat);
        return (
          <div
            key={seat}
            role="listitem"
            data-seat={seat}
            className={clsx("flex min-h-[46px] min-w-0 items-center gap-2 rounded-xl px-2.5 py-1.5 ring-1 transition-colors duration-300", active ? "bg-signal/10 ring-signal/45" : "bg-offwhite/[0.035] ring-offwhite/8")}
          >
            <SeatToken kind={kind} seat={seat} className={clsx("size-6 shrink-0", !id && "opacity-45")} />
            <div className="min-w-0 flex-1">
              {id ? (
                <p className="flex min-w-0 items-center gap-1 text-[13px] font-medium">
                  <span className="size-1.5 shrink-0 rounded-full" style={{ background: player ? STATUS_COLOR[player.status] : "#8A93A3" }} aria-hidden />
                  <span className="truncate">{name}</span>
                  {isMe && <span className="shrink-0 text-[11px] font-normal text-slate">({S.you})</span>}
                </p>
              ) : (
                <p className="text-[13px] text-slate">{S.emptySeat}</p>
              )}
              <p className="mt-0.5 flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[10px] uppercase tracking-[0.12em] text-slate">
                <span className="shrink-0">{teams ? S.team(seat % 2) : seatName}</span>
                {count !== undefined && <span className="truncate normal-case tracking-normal">· {kind === "truco" ? S.cards(count) : S.tiles(count)}</span>}
              </p>
            </div>
            {active && <span className="size-2 shrink-0 animate-pulse rounded-full bg-signal" aria-label={S.turnShort} />}
            {winner && (
              <span className="shrink-0" title={S.winnerTag}>
                <Trophy className="size-3.5 text-offwhite" aria-hidden />
                <span className="sr-only">{S.winnerTag}</span>
              </span>
            )}
            {canSit &&
              (walking ? (
                <button type="button" onClick={cancelSeat} className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] text-offwhite/80 ring-1 ring-offwhite/15 hover:bg-offwhite/8" title={S.cancel} aria-label={S.walking}>
                  <LoaderCircle className="size-3.5 animate-spin" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => requestSeat(t.table, seat)}
                  aria-label={S.sitAt(seatName)}
                  className="shrink-0 rounded-lg bg-offwhite/8 px-2.5 py-1.5 text-[11px] font-semibold text-offwhite ring-1 ring-offwhite/15 transition-colors hover:bg-signal hover:text-space hover:ring-signal"
                >
                  {S.sitShort}
                </button>
              ))}
          </div>
        );
      })}
    </div>
  );
}

/** Um lugar da mesa: quem está, de que lado, se é a vez; ou o botão de sentar. */
function SeatStrip({ t, kind, seat, me, primary }: { t: Table; kind: string; seat: number; me: number; primary: boolean }) {
  const id = t.seats[seat] ?? null;
  const player = useApp((s) => (id ? s.players[id] : undefined));
  const pending = useGamesUi((s) => s.pending);
  const { requestSeat, cancelSeat } = useGamesUi.getState();
  const seatName = SEAT_NAME[kind]?.[seat] ?? S.seatFallback(seat);
  const isMe = me >= 0 && me === seat;
  const active = t.phase === "playing" && t.state.turn === seat;
  const winner = t.phase === "finished" && t.state.winner === seat;
  const walking = pending?.table === t.table && pending.seat === seat;
  const canSit = !id && me < 0 && t.phase !== "playing";
  const name = id ? (player?.name ?? t.state.names?.[seat] ?? "—") : null;

  return (
    <div
      className={clsx(
        "flex min-h-[52px] items-center gap-3 rounded-xl px-3 py-2 ring-1 transition-colors duration-300",
        active ? "bg-signal/10 ring-signal/45" : "bg-offwhite/[0.035] ring-offwhite/8",
      )}
      data-seat={seat}
    >
      <SeatToken kind={kind} seat={seat} className={clsx("size-7 shrink-0", !id && "opacity-45")} />
      <div className="min-w-0 flex-1">
        {id ? (
          <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
            <span className="size-2 shrink-0 rounded-full" style={{ background: player ? STATUS_COLOR[player.status] : "#8A93A3" }} aria-hidden />
            <span className="truncate">{name}</span>
            {isMe && <span className="shrink-0 text-xs font-normal text-slate">({S.you})</span>}
          </p>
        ) : (
          <p className="text-sm text-slate">{S.emptySeat}</p>
        )}
        <p className="mt-0.5 flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-slate">
          <span>{seatName}</span>
          {kind === "chess" && id && <Captured s={t.state as unknown as ChessState} color={seat === 0 ? "w" : "b"} />}
          {kind === "checkers" && id && <CheckersLost s={t.state as unknown as CheckersState} seat={seat} />}
        </p>
      </div>

      {active && (
        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-signal/15 px-2.5 py-1 text-[11px] font-medium text-signal">
          <span className="size-1.5 animate-pulse rounded-full bg-signal" />
          {isMe ? S.yourTurn : S.turnShort}
        </span>
      )}
      {winner && <span className="shrink-0 rounded-full bg-offwhite/10 px-2.5 py-1 text-[11px] font-medium text-offwhite">{S.winnerTag}</span>}

      {canSit &&
        (walking ? (
          <button type="button" onClick={cancelSeat} className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-offwhite/80 ring-1 ring-offwhite/15 hover:bg-offwhite/8" title={S.cancel}>
            <LoaderCircle className="size-3.5 animate-spin" />
            {S.walking}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => requestSeat(t.table, seat)}
            className={clsx(
              "shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition-colors",
              primary ? "bg-orange text-offwhite hover:bg-orange/90" : "bg-offwhite/8 text-offwhite ring-1 ring-offwhite/15 hover:bg-signal hover:text-space hover:ring-signal",
            )}
          >
            {S.sitAs(seatName)}
          </button>
        ))}
      {!id && me >= 0 && t.phase !== "playing" && <span className="shrink-0 animate-pulse text-xs text-slate">{S.waitingShort}</span>}
    </div>
  );
}

/** Rodapé durante a espera e a partida: desistir, levantar ou o aviso de quem assiste. */
function Footer({ t, seat, kind }: { t: Table; seat: number; kind?: string }) {
  const [confirm, setConfirm] = useState(false);
  useEffect(() => setConfirm(false), [t.phase, t.state.round]);

  let content: ReactNode;
  if (seat < 0) {
    content = (
      <p className="flex items-center gap-2 text-xs text-slate">
        <Eye className="size-3.5 shrink-0" />
        {t.phase === "playing" ? S.spectating : S.spectatingHint}
      </p>
    );
  } else if (t.phase === "playing") {
    content = confirm ? (
      <div className="flex w-full items-center gap-2">
        <span className="mr-auto text-xs text-offwhite/90">{S.resignConfirm}</span>
        <GhostButton onClick={() => setConfirm(false)}>{S.cancel}</GhostButton>
        <button type="button" onClick={() => sendGame(t.table, "resign")} className="rounded-lg bg-danger/90 px-3 py-2 text-xs font-semibold text-offwhite transition-colors hover:bg-danger">
          {S.resignYes}
        </button>
      </div>
    ) : (
      <>
        <GhostButton onClick={() => setConfirm(true)}>
          <Flag className="size-3.5" />
          {S.resign}
        </GhostButton>
      </>
    );
  } else if (kind && isMulti(kind)) {
    // Mesa de vários lugares: quem está sentado começa quando a quantidade de gente vale para o jogo.
    const ok = gamePlayerCounts(GAMES[kind]!).includes(seatedOf(t).length);
    content = (
      <div className="flex w-full flex-col gap-2">
        <span className="text-xs text-slate">{PLAYERS_HINT[kind] ?? S.waitingStartMulti}</span>
        <div className="flex items-center justify-end gap-2">
          <GhostButton onClick={() => leaveSeat(t.table)}>
            <LogOut className="size-3.5" />
            {S.stand}
          </GhostButton>
          <button
            type="button"
            disabled={!ok}
            onClick={() => sendGame(t.table, "start")}
            className="rounded-lg bg-orange px-4 py-2 text-xs font-semibold text-offwhite transition-colors hover:bg-[#ff6d39] disabled:cursor-not-allowed disabled:bg-offwhite/10 disabled:text-slate"
          >
            {S.start}
          </button>
        </div>
      </div>
    );
  } else {
    content = (
      <div className="flex w-full items-center justify-between gap-3">
        <span className="text-xs text-slate">{S.waitingStart}</span>
        <GhostButton onClick={() => leaveSeat(t.table)}>
          <LogOut className="size-3.5" />
          {S.stand}
        </GhostButton>
      </div>
    );
  }
  return (
    <motion.div className="flex min-h-9 items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
      {content}
    </motion.div>
  );
}

/** Fim de jogo. Vitória é um "momento especial": aqui o gradiente oficial da marca aparece. */
function EndBanner({ t, kind, seat }: { t: Table; kind: string; seat: number }) {
  const s = t.state;
  const multi = isMulti(kind);
  const winner = s.winner;
  const winners = winnersOf(s);
  // Quem desistiu ou saiu: nas mesas de dois, quem não venceu; nas de vários, o servidor diz.
  const loser = s.quit ?? (multi || winner === null ? null : winner === 0 ? 1 : 0);
  // Quem jogou a partida (o servidor guarda o nome mesmo se a pessoa já levantou).
  const playedBy = (seat: number) => s.players?.[seat] ?? seatPlayerName(t, seat) ?? SEAT_NAME[kind]?.[seat] ?? null;
  const loserName = loser === null ? null : playedBy(loser);
  const winnerName = winner === null ? null : playedBy(winner);
  const team = winners.length > 1;
  const iWon = seat >= 0 && winners.includes(seat);
  const iPlayed = seat >= 0 && !!s.players?.[seat];
  const iLost = seat >= 0 && !s.draw && winners.length > 0 && !iWon && (multi ? iPlayed : true);
  const celebrate = winner !== null && !iLost;
  const winnersText = team ? S.wonMany(S.and(winners.map((w) => playedBy(w) ?? ""))) : S.won(winnerName ?? "");
  const title = s.draw ? (kind === "tictactoe" ? S.drawTicTacToe : S.draw) : iWon ? (team ? S.teamWon : S.youWon) : iLost ? (team ? S.teamLost : S.youLost) : winnersText;
  // Damas, final especial: diz qual final e quantos lances valiam ("3 damas contra 1 dama: 16 lances de cada lado...").
  const ending = kind === "checkers" && s.reason === "endgame" ? (s as unknown as CheckersState) : null;
  const endingText = ending?.endgame ? checkersEndingText(ending) : null;
  const reason = ending?.endgame && endingText ? S.endgameReason(endingText, ending.endgame.each) : endReasonText(s.reason, s.reason === "resign" || s.reason === "left" ? loserName : null);

  // Revanche: nas mesas de dois, com quem está do outro lado; nas de vários, com todos os sentados.
  const others = seatedOf(t).filter((x) => x !== seat);
  const other = seat >= 0 && !multi ? (seat === 0 ? 1 : 0) : -1;
  const otherHere = multi ? others.length > 0 && gamePlayerCounts(GAMES[kind]!).includes(others.length + 1) : other >= 0 && t.seats[other] !== null;
  const otherName = multi ? "" : other >= 0 ? (seatPlayerName(t, other) ?? "") : "";
  const iAsked = seat >= 0 && !!s.rematch?.[seat];
  const askers = others.filter((x) => !!s.rematch?.[x]);
  const theyAsked = multi ? askers.length > 0 : other >= 0 && !!s.rematch?.[other];
  const missing = others.filter((x) => !s.rematch?.[x]).length;

  return (
    <motion.section
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.4, ease: EASE, delay: 0.15 }}
      className={clsx("relative overflow-hidden rounded-2xl p-4", celebrate ? "text-offwhite shadow-[0_18px_50px_-20px_rgb(236_92_42/0.55)]" : "bg-card/80 ring-1 ring-offwhite/10")}
      style={celebrate ? { background: "linear-gradient(125deg, #EC5C2A 0%, #C14F2C 14%, #432932 32%, #071734 52%, #1B4C72 74%, #368BBA 88%, #46AFE3 100%)" } : undefined}
      aria-live="assertive"
      data-end-banner
    >
      {celebrate && (
        <motion.img
          src="/brand/sparkle-white.svg"
          alt=""
          aria-hidden
          className="pointer-events-none absolute -right-5 -top-6 size-28 opacity-[0.13]"
          initial={{ rotate: -25, scale: 0.6 }}
          animate={{ rotate: 0, scale: 1 }}
          transition={{ duration: 0.9, ease: EASE, delay: 0.2 }}
        />
      )}
      <div className="relative flex items-center gap-3">
        {celebrate ? (
          <motion.img
            src="/brand/sparkle-white.svg"
            alt=""
            aria-hidden
            className="size-9 shrink-0 drop-shadow-[0_0_12px_rgb(255_255_255/0.45)]"
            initial={{ scale: 0, rotate: -90 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.3 }}
          />
        ) : (
          winner !== null && <SeatToken kind={kind} seat={winner} className="size-9 shrink-0" />
        )}
        <div className="min-w-0">
          <h3 className="font-display text-lg font-bold uppercase leading-tight tracking-[0.06em]">{title}</h3>
          {reason && <p className={clsx("mt-0.5 text-[13px]", celebrate ? "text-offwhite/85" : "text-slate")}>{reason}</p>}
        </div>
      </div>

      {seat >= 0 && (
        <div className="relative mt-3.5 flex flex-wrap items-center justify-end gap-2">
          {otherHere && iAsked && <span className="mr-auto text-xs text-offwhite/85">{multi ? S.rematchWaitingMany(missing) : S.rematchWaiting(otherName)}</span>}
          {otherHere && theyAsked && !iAsked && (
            <span className="mr-auto text-xs font-medium text-offwhite">{multi ? S.rematchOfferMany(S.and(askers.map((x) => seatPlayerName(t, x) ?? ""))) : S.rematchOffer(otherName)}</span>
          )}
          {!otherHere && <span className="mr-auto text-xs text-offwhite/80">{multi ? (PLAYERS_HINT[kind] ?? S.waitingOpponent) : S.waitingOpponent}</span>}
          <button
            type="button"
            onClick={() => leaveSeat(t.table)}
            className={clsx("flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors", celebrate ? "bg-space/35 text-offwhite ring-1 ring-offwhite/25 hover:bg-space/55" : "text-offwhite/90 ring-1 ring-offwhite/15 hover:bg-offwhite/8")}
          >
            <LogOut className="size-3.5" />
            {S.stand}
          </button>
          {otherHere &&
            (iAsked ? (
              <button type="button" onClick={() => sendGame(t.table, "rematch", { on: false })} className="rounded-lg bg-space/35 px-3 py-2 text-xs font-medium text-offwhite ring-1 ring-offwhite/25 hover:bg-space/55">
                {S.rematchCancel}
              </button>
            ) : (
              <button type="button" onClick={() => sendGame(t.table, "rematch", { on: true })} className="rounded-lg bg-orange px-4 py-2 text-xs font-semibold text-offwhite shadow-[0_6px_18px_-6px_rgb(238_92_41/0.8)] transition-colors hover:bg-[#ff6d39]">
                {theyAsked ? S.rematchAccept : S.rematch}
              </button>
            ))}
        </div>
      )}
    </motion.section>
  );
}

function GhostButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-offwhite/85 ring-1 ring-offwhite/12 transition-colors hover:bg-offwhite/8 hover:text-offwhite">
      {children}
    </button>
  );
}
