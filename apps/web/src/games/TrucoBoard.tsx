import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { clsx } from "clsx";
import { EyeOff } from "lucide-react";
import { TRUCO_RANKS, TRUCO_SUITS, TRUCO_TARGET, trucoCanCover, trucoRank, trucoSuit, trucoTeam, type TrucoPlay, type TrucoState } from "@infinity/world";
import { seatPlayerName, sendGame, type Table } from "./api.ts";
import { CardArt } from "./Art.tsx";
import { FELT } from "./palette.ts";
import { S } from "./strings.ts";

interface Props {
  t: Table<TrucoState>;
  seat: number;
  /** Posso agir agora (minha vez, ou minha dupla responde a um pedido). */
  canMove: boolean;
}

/** Nome do valor para leitura em voz (dama, valete, rei, ás). */
const RANK_NAME: Record<string, string> = { Q: "Dama", J: "Valete", K: "Rei", A: "Ás" };
export const cardName = (card: number) => S.card(RANK_NAME[TRUCO_RANKS[trucoRank(card)]!] ?? TRUCO_RANKS[trucoRank(card)]!, TRUCO_SUITS[trucoSuit(card)]!);

const nameOf = (t: Table, seat: number) => t.state.players?.[seat] ?? seatPlayerName(t, seat) ?? S.seatFallback(seat);
const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Truco: placar das duplas, valor da mão, vazas, a vira e a vaza na mesa (cada carta do lado de quem jogou),
 * os botões de pedir, aceitar e correr, e as suas cartas.
 */
export function TrucoBoard({ t, seat, canMove }: Props) {
  const s = t.state;
  const playing = t.phase === "playing" && s.active.length > 0;
  const me = s.active.includes(seat) ? seat : -1;
  const myTeam = me >= 0 ? (s.teamOf[me] ?? -1) : -1;
  // Quem joga fica embaixo; quem assiste vê o primeiro lugar da partida embaixo.
  const anchor = me >= 0 ? me : (s.active[0] ?? 0);
  const rel = (x: number) => (s.active.indexOf(x) - s.active.indexOf(anchor) + s.active.length) % Math.max(1, s.active.length);
  const spot = (x: number): "bottom" | "right" | "top" | "left" => {
    const r = rel(x);
    if (s.active.length === 2) return r === 0 ? "bottom" : "top";
    return (["bottom", "right", "top", "left"] as const)[r] ?? "bottom";
  };
  const teamName = (team: number) => {
    if (myTeam >= 0) return team === myTeam ? S.us : S.them;
    return S.and(trucoTeam(s, team).map((x) => nameOf(t, x)));
  };

  const myTurn = canMove && s.turn === me && !s.raise && !s.deciding;
  const hand = me >= 0 ? s.hands[me] : null;
  const handCount = me >= 0 ? (s.counts[me] ?? 0) : 0;
  const partner = me >= 0 && s.active.length === 4 ? s.active.find((x) => x !== me && s.teamOf[x] === myTeam) : undefined;
  const partnerHand = partner !== undefined ? s.hands[partner] : null;

  // Carta coberta: da segunda vaza em diante, pelo botão "Jogar coberta" ou com Shift + clique na carta.
  const canCover = myTurn && trucoCanCover(s);
  const [covering, setCovering] = useState(false);
  useEffect(() => setCovering(false), [s.moves, s.hand, canCover]);
  const playCard = (i: number, e: MouseEvent) => {
    const cover = canCover && (covering || e.shiftKey);
    sendGame(t.table, "move", cover ? { play: i, cover: true } : { play: i });
  };

  // Cartas na mesa: a vaza em andamento; com a mesa vazia, a última vaza (apagadinha), para dar tempo de ver.
  const showing: TrucoPlay[] = s.table.length ? s.table : (s.prevTrick?.cards ?? []);
  const fading = s.table.length === 0 && !!s.prevTrick;
  // Para leitores de tela: o que está na mesa (a coberta aparece como "carta coberta" para quem não a jogou).
  const who = (x: number) => (x === me ? S.you : nameOf(t, x));
  const onTable = showing.map((p) => `${who(p.seat)}, ${p.card === null ? S.coveredCard : p.covered ? S.coveredOwn(cardName(p.card)) : cardName(p.card)}`);

  return (
    <div className="flex flex-col gap-2.5" data-truco>
      {playing && <ScoreBar s={s} teamName={teamName} myTeam={myTeam} />}

      <div
        className="relative aspect-[16/11] w-full overflow-hidden rounded-xl shadow-[inset_0_2px_14px_rgb(0_0_0/0.5)] ring-1 ring-offwhite/10"
        style={{ background: `radial-gradient(110% 90% at 50% 45%, ${FELT.center} 0%, ${FELT.edge} 100%)` }}
        role="img"
        aria-label={`${S.trucoTable}${playing ? `: ${S.vira} ${cardName(s.vira)}, ${S.manilha(TRUCO_RANKS[s.manilha]!)}${onTable.length ? `. ${S.onTable}: ${onTable.join("; ")}` : ""}` : ""}`}
      >
        {playing && (
          <>
            <div className="absolute left-[4%] top-[6%] flex flex-col items-center gap-1">
              <CardArt card={s.vira} w={46} h={68} className="rotate-[-8deg] drop-shadow-[0_3px_4px_rgb(0_0_0/0.35)]" />
              <span className="rounded-full bg-space/60 px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.12em] text-offwhite/90">{S.manilha(TRUCO_RANKS[s.manilha]!)}</span>
            </div>
            {s.active.map((x) => (
              <SeatTag key={x} where={spot(x)} name={nameOf(t, x)} count={s.counts[x] ?? 0} turn={!s.raise && !s.deciding && s.turn === x} me={x === me} />
            ))}
            <AnimatePresence>
              {showing.map((p) => {
                const won = fading && s.prevTrick?.seat === p.seat;
                return (
                  <motion.div
                    key={`${s.hand}-${s.tricks.length}-${p.seat}-${p.card}`}
                    className={clsx("absolute", PLAY_SPOT[spot(p.seat)])}
                    initial={{ opacity: 0, scale: 0.8, y: spot(p.seat) === "bottom" ? 30 : spot(p.seat) === "top" ? -30 : 0 }}
                    animate={{ opacity: fading && !won ? 0.45 : 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3, ease: EASE }}
                    data-truco-play={p.seat}
                    data-covered={p.covered ? "" : undefined}
                    data-face={p.covered ? "down" : "up"}
                  >
                    {p.covered ? (
                      <CoveredCard card={p.card} won={won} />
                    ) : (
                      <CardArt card={p.card} w={50} h={74} className={clsx("drop-shadow-[0_4px_6px_rgb(0_0_0/0.35)]", won && "rounded-[5px] shadow-[0_0_0_3px_rgb(0_183_255)]")} />
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </>
        )}
        {!playing && <p className="absolute inset-0 grid place-items-center text-xs text-offwhite/70">{S.trucoTable}</p>}
      </div>

      {playing && <Actions t={t} me={me} myTeam={myTeam} canMove={canMove} myTurn={myTurn} teamName={teamName} canCover={canCover} covering={covering} setCovering={setCovering} />}

      {playing && me >= 0 && (
        <section aria-label={S.trucoHand} className="flex flex-col gap-1.5">
          <p className="label-caps">{S.trucoHand}</p>
          <div className="flex items-end justify-center gap-2.5">
            {Array.from({ length: handCount }, (_, i) => {
              const card = hand?.[i] ?? null;
              const name = card === null ? `${S.hiddenCard} ${i + 1}` : cardName(card);
              const cover = canCover && covering;
              return (
                <motion.button
                  key={`${s.hand}-${card ?? `x${i}`}`}
                  type="button"
                  disabled={!myTurn}
                  onClick={(e) => playCard(i, e)}
                  aria-label={cover ? S.coverThis(name) : name}
                  title={canCover && !covering ? S.coverShortcut : undefined}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: EASE, delay: i * 0.05 }}
                  className={clsx(
                    "relative rounded-[7px] transition-transform focus-visible:ring-2 focus-visible:ring-signal",
                    myTurn ? "cursor-pointer hover:-translate-y-2" : "cursor-default",
                    cover ? "outline-2 outline-offset-2 outline-dashed outline-signal/70" : "outline-none",
                  )}
                >
                  <CardArt card={card} w={66} h={98} className={clsx("drop-shadow-[0_6px_10px_rgb(0_0_0/0.4)] transition-opacity", cover && "opacity-80")} />
                  {cover && (
                    <span className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-space text-signal ring-1 ring-signal/60" aria-hidden>
                      <EyeOff className="size-3" />
                    </span>
                  )}
                </motion.button>
              );
            })}
          </div>
        </section>
      )}

      {playing && partnerHand && partner !== undefined && (
        <section aria-label={S.partnerCards} className="flex items-center gap-2 rounded-lg bg-offwhite/[0.035] px-2.5 py-2 ring-1 ring-offwhite/8">
          <span className="text-xs text-slate">{S.partnerCards}</span>
          <span className="ml-auto flex gap-1.5">
            {partnerHand.map((c) => (
              <CardArt key={c} card={c} w={32} h={47} />
            ))}
          </span>
        </section>
      )}

      {s.lastHand && <HandResult s={s} myTeam={myTeam} teamName={teamName} />}
    </div>
  );
}

/**
 * Carta coberta na mesa: de costas para todo mundo. Quem pode vê-la (quem jogou; na mão de onze, também o
 * parceiro) recebe a carta do servidor e a vê pequenininha encostada no canto, para lembrar qual foi.
 */
function CoveredCard({ card, won }: { card: number | null; won: boolean }) {
  return (
    <div className="relative">
      <CardArt card={null} w={50} h={74} className={clsx("drop-shadow-[0_4px_6px_rgb(0_0_0/0.35)]", won && "rounded-[5px] shadow-[0_0_0_3px_rgb(0_183_255)]")} />
      <span className="absolute inset-x-0 bottom-1.5 flex justify-center">
        <span className="rounded-full bg-space/85 px-1.5 py-px text-[8.5px] font-semibold uppercase tracking-[0.1em] text-offwhite/90">{S.coveredTag}</span>
      </span>
      {card !== null && <CardArt card={card} w={30} h={44} className="absolute -right-4 -top-3 rotate-[10deg] drop-shadow-[0_2px_4px_rgb(0_0_0/0.45)]" />}
    </div>
  );
}

const PLAY_SPOT: Record<"bottom" | "right" | "top" | "left", string> = {
  bottom: "left-1/2 top-[58%] -translate-x-1/2",
  top: "left-1/2 top-[14%] -translate-x-1/2",
  left: "left-[26%] top-1/2 -translate-y-1/2",
  right: "right-[16%] top-1/2 -translate-y-1/2",
};

const TAG_SPOT: Record<"bottom" | "right" | "top" | "left", string> = {
  bottom: "bottom-1.5 left-1/2 -translate-x-1/2",
  top: "top-1.5 left-1/2 -translate-x-1/2",
  left: "left-1.5 bottom-[22%]",
  right: "right-1.5 top-[22%]",
};

/** Etiqueta de cada lugar na beira da mesa: nome e quantas cartas tem. */
function SeatTag({ where, name, count, turn, me }: { where: "bottom" | "right" | "top" | "left"; name: string; count: number; turn: boolean; me: boolean }) {
  return (
    <div className={clsx("absolute flex max-w-[44%] items-center gap-1.5 rounded-full px-2 py-0.5 text-xs", TAG_SPOT[where], turn ? "bg-signal/90 text-space" : "bg-space/55 text-offwhite/90")}>
      <span className="truncate font-medium">{me ? S.you : name}</span>
      <span className={clsx("flex shrink-0 gap-px", turn ? "opacity-80" : "opacity-70")} aria-label={S.cards(count)}>
        {Array.from({ length: count }, (_, i) => (
          <span key={i} className={clsx("h-2.5 w-[7px] rounded-[2px]", turn ? "bg-space/70" : "bg-offwhite/70")} />
        ))}
      </span>
    </div>
  );
}

/** Placar das duplas, valor da mão e as vazas desta mão. */
function ScoreBar({ s, teamName, myTeam }: { s: TrucoState; teamName: (team: number) => string; myTeam: number }) {
  const order = myTeam === 1 ? [1, 0] : [0, 1];
  return (
    <div className="flex items-stretch gap-2" aria-label={`${teamName(order[0]!)} ${s.score[order[0]!]}, ${teamName(order[1]!)} ${s.score[order[1]!]}`}>
      {order.map((team, i) => (
        <div key={team} className={clsx("flex min-w-0 flex-1 items-center gap-2 rounded-xl px-3 py-1.5 ring-1", i === 0 ? "flex-row" : "flex-row-reverse text-right", "bg-offwhite/[0.04] ring-offwhite/10")}>
          <span className="min-w-0 flex-1 truncate text-xs text-offwhite/85">{teamName(team)}</span>
          <span className="text-xl font-bold tabular-nums leading-none">{s.score[team]}</span>
        </div>
      ))}
      <div className="flex shrink-0 flex-col items-center justify-center rounded-xl bg-offwhite/[0.04] px-2.5 ring-1 ring-offwhite/10">
        <span className={clsx("text-xs font-semibold uppercase tracking-[0.1em]", s.stake > 1 ? "text-signal" : "text-offwhite/80")}>{S.stake(s.stake)}</span>
        <span className="mt-1 flex gap-1" aria-label={S.tricks}>
          {[0, 1, 2].map((k) => {
            const r = s.tricks[k];
            return (
              <span
                key={k}
                className={clsx(
                  "size-2 rounded-full",
                  r === undefined && "ring-1 ring-offwhite/35",
                  r === -1 && "bg-slate",
                  r !== undefined && r >= 0 && (myTeam < 0 ? (r === 0 ? "bg-offwhite" : "bg-sky") : r === myTeam ? "bg-signal" : "bg-offwhite/60"),
                )}
              />
            );
          })}
        </span>
      </div>
    </div>
  );
}

/** O que dá para fazer agora: pedir truco, jogar coberta, responder a um pedido, decidir a mão de onze. */
function Actions({
  t,
  me,
  myTeam,
  canMove,
  myTurn,
  teamName,
  canCover,
  covering,
  setCovering,
}: {
  t: Table<TrucoState>;
  me: number;
  myTeam: number;
  canMove: boolean;
  myTurn: boolean;
  teamName: (team: number) => string;
  canCover: boolean;
  covering: boolean;
  setCovering: (on: boolean) => void;
}) {
  const s = t.state;
  const send = (data: unknown) => sendGame(t.table, "move", data);
  let msg: ReactNode = null;
  let buttons: ReactNode = null;

  if (s.deciding && s.eleven !== null) {
    if (myTeam === s.eleven && canMove) {
      msg = S.elevenAsk;
      buttons = (
        <>
          <Ghost onClick={() => send({ eleven: "run" })}>{S.run}</Ghost>
          <Primary onClick={() => send({ eleven: "play" })}>{S.elevenPlay}</Primary>
        </>
      );
    } else msg = myTeam === s.eleven ? S.elevenAsk : S.elevenOther;
  } else if (s.raise) {
    const asked = S.asked(nameOf(t, s.raise.by), s.raise.to);
    if (canMove && myTeam !== s.raise.team) {
      msg = asked;
      buttons = (
        <>
          <Ghost onClick={() => send({ answer: "run" })}>{S.run}</Ghost>
          {s.raise.to < TRUCO_TARGET && <Ghost onClick={() => send({ answer: "raise" })}>{S.raiseName(s.raise.to + 3)}</Ghost>}
          <Primary onClick={() => send({ answer: "accept" })}>{S.accept}</Primary>
        </>
      );
    } else msg = `${asked} ${S.waitingAnswer}`;
  } else if (s.iron) {
    msg = S.iron;
  } else if (myTurn) {
    msg = canCover && covering ? S.coverPick : S.playCard;
    const raise = s.eleven === null && s.stake < TRUCO_TARGET && s.raisedBy !== myTeam;
    if (canCover || raise)
      buttons = (
        <>
          {canCover && (
            <button
              type="button"
              aria-pressed={covering}
              onClick={() => setCovering(!covering)}
              title={S.coverHint}
              className={clsx(
                "flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ring-1 transition-colors",
                covering ? "bg-signal/15 text-signal ring-signal/60" : "text-offwhite/90 ring-offwhite/20 hover:bg-offwhite/8",
              )}
            >
              <EyeOff className="size-3.5" aria-hidden />
              {S.cover}
            </button>
          )}
          {raise && <Primary onClick={() => send({ truco: true })}>{S.raiseName(s.stake < 3 ? 3 : s.stake + 3)}</Primary>}
        </>
      );
  } else if (s.eleven !== null) {
    msg = `${S.eleven}: ${teamName(s.eleven)}`;
  }
  if (!msg && !buttons) return null;
  return (
    <motion.div
      key={`${s.hand}-${s.raise?.to ?? 0}-${s.deciding}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: EASE }}
      className={clsx("flex flex-wrap items-center gap-2 rounded-xl px-3 py-2", s.raise || s.deciding ? "bg-signal/10 ring-1 ring-signal/35" : "bg-offwhite/[0.035] ring-1 ring-offwhite/8")}
      role="status"
      aria-live="polite"
    >
      {msg && <span className={clsx("mr-auto text-[13px]", s.raise || s.deciding ? "font-medium text-offwhite" : "text-offwhite/80")}>{msg}</span>}
      {buttons && <span className={clsx("flex flex-wrap gap-2", !msg && "ml-auto")}>{buttons}</span>}
    </motion.div>
  );
}

/** Resultado da mão anterior (quem marcou e como). */
function HandResult({ s, myTeam, teamName }: { s: TrucoState; myTeam: number; teamName: (team: number) => string }) {
  const h = s.lastHand!;
  const [show, setShow] = useState(true);
  useEffect(() => setShow(true), [h.hand]);
  if (!show) return null;
  const pts = S.points(h.points);
  let text: string;
  if (h.team < 0) text = S.handTie;
  else if (myTeam >= 0) text = h.team === myTeam ? S.handUs(pts) : S.handThem(pts);
  else text = S.handBy(teamName(h.team), trucoTeam(s, h.team).length > 1, pts);
  // Correram: quem correu foi a outra dupla.
  const runners = h.team === 0 ? 1 : 0;
  const ran = myTeam >= 0 ? (runners === myTeam ? S.weRan : S.theyRan) : S.ranBy(teamName(runners), trucoTeam(s, runners).length > 1);
  const why = h.how === "run" || h.how === "eleven" ? ` (${ran})` : "";
  return (
    <p className="text-xs text-slate" aria-live="polite" data-hand-result>
      <span className="text-offwhite/70">{S.handNo(h.hand)}:</span> {text}
      {why}
    </p>
  );
}

function Primary({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="rounded-lg bg-orange px-4 py-2 text-xs font-semibold text-offwhite shadow-[0_6px_18px_-6px_rgb(238_92_41/0.8)] transition-colors hover:bg-[#ff6d39]">
      {children}
    </button>
  );
}

function Ghost({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="rounded-lg px-3 py-2 text-xs font-semibold text-offwhite/90 ring-1 ring-offwhite/20 transition-colors hover:bg-offwhite/8">
      {children}
    </button>
  );
}
