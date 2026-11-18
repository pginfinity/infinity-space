import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { clsx } from "clsx";
import { ArrowLeft, Ban, Check, LoaderCircle, Pencil, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import {
  PAL_EDIT_RANGE,
  PAL_FORBIDDEN_COUNT,
  PAL_ID,
  PAL_LABEL_MAX,
  PAL_MAX_CARDS,
  PAL_MAX_THEMES,
  PAL_WORD_MAX,
  grupoFold,
  palCardTaken,
  palCleanCard,
  palCleanLabel,
  palLabelTaken,
  type PalBank,
  type PalBankCard,
  type PalBankTheme,
} from "@infinity/world";
import { sendAct } from "../registry.ts";
import { GamePanelShell, GhostButton, PrimaryButton, closePanel, openPanel } from "./shared.tsx";
import { useNearBoard } from "./palavraScene.tsx";
import { usePalLocal } from "./palavraStore.ts";
import { T } from "./strings.ts";

/**
 * Editor de cartas da Palavra secreta (perto do painel de letras, sem partida em andamento): temas e
 * cartas, salvos no servidor. O banco completo só chega a quem abre o editor e sai da memória ao fechar.
 */

const send = (op: string, data?: unknown) => sendAct(PAL_ID, op, data);

/** Erros que pertencem à barra de temas e ao formulário de carta (os outros fecham o editor). */
const THEME_ERRORS = ["label", "themeDup", "full", "lastTheme"];
const CARD_ERRORS = ["word", "forbidden", "repeat", "duplicate", "reserved", "full"];

const input = "min-w-0 rounded-lg border border-offwhite/10 bg-deep px-2.5 py-1.5 text-sm placeholder:text-slate/60 focus:border-signal focus:outline-none";

export function PalEditor() {
  const bank = usePalLocal((l) => l.bank);
  const error = usePalLocal((l) => l.bankError);
  // Um pouco antes do limite do servidor (as posições dos dois lados diferem um tiquinho).
  const near = useNearBoard(PAL_EDIT_RANGE - 0.3);
  const [themeId, setThemeId] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [query, setQuery] = useState("");

  // Pede o banco ao abrir (e ao voltar para perto do painel); ao fechar, ele sai da memória.
  useEffect(() => {
    if (!near) return;
    usePalLocal.setState({ bankError: null });
    send("bank");
  }, [near]);
  useEffect(() => () => usePalLocal.setState({ bank: null, bankError: null }), []);

  const theme = bank?.themes.find((t) => t.id === themeId) ?? bank?.themes[0] ?? null;
  useEffect(() => {
    if (theme && theme.id !== themeId) setThemeId(theme.id);
  }, [theme, themeId]);

  const q = grupoFold(query);
  const shown = useMemo(() => (theme && q ? theme.cards.filter((c) => [c.word, ...c.forbidden].some((w) => grupoFold(w).includes(q))) : (theme?.cards ?? [])), [theme, q]);

  const back = () => openPanel("palavra", PAL_ID);
  const blocked = !near ? "near" : error === "near" || error === "playing" ? error : null;
  return (
    <GamePanelShell
      title={T.pal.editor}
      sub={<span>{T.pal.editorHint}</span>}
      icon={
        <button type="button" onClick={back} aria-label={T.back} className="grid size-8 place-items-center rounded-xl hover:bg-offwhite/8">
          <ArrowLeft className="size-4" />
        </button>
      }
      medium
      onClose={closePanel}
      label={T.pal.editor}
    >
      {blocked ? (
        <p className="rounded-xl bg-warn/10 px-3 py-2 text-xs text-warn" role="alert">
          {T.pal.editErrors[blocked]}
        </p>
      ) : !bank ? (
        <p className="flex items-center gap-2 py-8 text-sm text-slate">
          <LoaderCircle className="size-4 animate-spin" />
          {T.pal.loading}
        </p>
      ) : (
        <>
          <ThemeBar bank={bank} current={theme} onPick={(id) => (setThemeId(id), setEditing(null), setQuery(""))} />
          {theme && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="label-caps mr-auto">{T.pal.cardsCount(theme.cards.length)}</span>
                {theme.cards.length > 6 && (
                  <label className="relative">
                    <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-slate" aria-hidden />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={T.pal.search} aria-label={T.pal.search} className={clsx(input, "w-48 py-1 pl-7 text-xs")} />
                  </label>
                )}
                {editing !== "new" && (
                  <GhostButton onClick={() => setEditing("new")}>
                    <Plus className="size-3.5" />
                    {T.pal.newCard}
                  </GhostButton>
                )}
              </div>
              <AnimatePresence initial={false}>{editing === "new" && <CardForm key="new" bank={bank} theme={theme} onDone={() => setEditing(null)} />}</AnimatePresence>
              {theme.cards.length === 0 && editing !== "new" ? (
                <p className="rounded-xl bg-offwhite/[0.03] px-3 py-4 text-center text-xs text-slate ring-1 ring-offwhite/8">{T.pal.emptyTheme}</p>
              ) : shown.length === 0 && q ? (
                <p className="px-1 text-xs text-slate">{T.pal.noMatch}</p>
              ) : (
                <ol className="flex flex-col gap-1.5" aria-label={T.pal.cardsCount(theme.cards.length)}>
                  {shown.map((c) =>
                    editing === c.id ? (
                      <li key={c.id}>
                        <CardForm bank={bank} theme={theme} card={c} onDone={() => setEditing(null)} />
                      </li>
                    ) : (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => setEditing(c.id)}
                          className="group flex w-full items-start gap-2.5 rounded-xl bg-offwhite/[0.035] px-3 py-2 text-left ring-1 ring-offwhite/8 transition-colors hover:bg-offwhite/[0.07]"
                          aria-label={`${T.edit}: ${c.word}`}
                          data-pal-edit-card={c.word}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">{c.word}</span>
                            <span className="mt-0.5 flex items-center gap-1 text-[11px] text-slate">
                              <Ban className="size-3 shrink-0 text-danger/80" aria-hidden />
                              <span className="truncate">{c.forbidden.join(" · ")}</span>
                            </span>
                          </span>
                          <Pencil className="mt-1 size-3.5 shrink-0 text-slate opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
                        </button>
                      </li>
                    ),
                  )}
                </ol>
              )}
            </>
          )}
          <ResetBar onReset={() => (setThemeId(null), setEditing(null), setQuery(""))} />
        </>
      )}
    </GamePanelShell>
  );
}

/** Temas: escolher, criar, renomear e apagar. */
function ThemeBar({ bank, current, onPick }: { bank: PalBank; current: PalBankTheme | null; onPick: (id: string) => void }) {
  const [mode, setMode] = useState<"idle" | "new" | "rename" | "delete">("idle");
  const [label, setLabel] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const serverError = usePalLocal((l) => (l.editScope === "theme" ? l.bankError : null));
  const prevCount = useRef(bank.themes.length);
  const added = useRef(false);
  useEffect(() => {
    if (mode === "new" || mode === "rename") field.current?.focus();
  }, [mode]);
  // Tema criado aqui: seleciona o novo.
  useEffect(() => {
    if (added.current && bank.themes.length > prevCount.current) {
      added.current = false;
      onPick(bank.themes[bank.themes.length - 1]!.id);
    }
    prevCount.current = bank.themes.length;
  }, [bank, onPick]);

  const ask = (op: string, data: unknown) => {
    usePalLocal.setState({ bankError: null, editScope: "theme" });
    send(op, data);
  };
  const submit = () => {
    const l = palCleanLabel(label);
    const except = mode === "rename" ? current?.id : undefined;
    const local = !l ? "label" : palLabelTaken(bank, l, except) ? "themeDup" : mode === "new" && bank.themes.length >= PAL_MAX_THEMES ? "full" : null;
    if (local) return setProblem(local);
    setProblem(null);
    if (mode === "new") {
      added.current = true;
      ask("themeAdd", { label: l });
    }
    if (mode === "rename" && current) ask("themeRename", { id: current.id, label: l });
    setMode("idle");
    setLabel("");
  };
  const err = problem ?? (serverError && THEME_ERRORS.includes(serverError) ? serverError : null);

  return (
    <section className="flex flex-col gap-2 rounded-xl bg-offwhite/[0.03] p-2.5 ring-1 ring-offwhite/8">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={T.pal.themes}>
        {bank.themes.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === current?.id}
            onClick={() => onPick(t.id)}
            className={clsx("rounded-full px-2.5 py-1 text-xs ring-1 transition-colors", t.id === current?.id ? "bg-offwhite text-space ring-offwhite" : "text-offwhite/80 ring-offwhite/12 hover:bg-offwhite/8")}
          >
            {t.label} <span className="tabular-nums opacity-60">{t.cards.length}</span>
          </button>
        ))}
        {mode !== "new" && bank.themes.length < PAL_MAX_THEMES && (
          <button type="button" onClick={() => (setMode("new"), setLabel(""), setProblem(null))} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-signal ring-1 ring-signal/30 hover:bg-signal/10">
            <Plus className="size-3" />
            {T.pal.newTheme}
          </button>
        )}
      </div>
      {(mode === "new" || mode === "rename") && (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input ref={field} value={label} maxLength={PAL_LABEL_MAX} onChange={(e) => setLabel(e.target.value)} placeholder={T.pal.themeName} aria-label={T.pal.themeName} className={clsx(input, "flex-1")} />
          <GhostButton onClick={() => (setMode("idle"), setProblem(null))}>{T.cancel}</GhostButton>
          <button type="submit" className="rounded-xl bg-offwhite px-3 py-2 text-xs font-semibold text-space hover:bg-offwhite/90">
            {T.save}
          </button>
        </form>
      )}
      {mode === "delete" && current && (
        <div className="flex items-center gap-2" data-grupo-modal>
          <span className="mr-auto text-xs text-offwhite/90">{T.pal.deleteThemeConfirm(current.label, current.cards.length)}</span>
          <GhostButton onClick={() => setMode("idle")}>{T.cancel}</GhostButton>
          <button
            type="button"
            onClick={() => {
              ask("themeDelete", { id: current.id });
              setMode("idle");
            }}
            className="rounded-xl bg-danger/90 px-3 py-2 text-xs font-semibold text-offwhite hover:bg-danger"
          >
            {T.delete}
          </button>
        </div>
      )}
      {mode === "idle" && current && (
        <div className="flex items-center gap-1.5">
          <GhostButton onClick={() => (setMode("rename"), setLabel(current.label), setProblem(null))}>
            <Pencil className="size-3" />
            {T.pal.renameTheme}
          </GhostButton>
          {bank.themes.length > 1 && (
            <GhostButton onClick={() => setMode("delete")} className="hover:text-danger">
              <Trash2 className="size-3" />
              {T.pal.deleteTheme}
            </GhostButton>
          )}
        </div>
      )}
      {err && (
        <p className="text-[11px] text-warn" role="alert">
          {T.pal.editErrors[err]}
        </p>
      )}
    </section>
  );
}

/** Formulário de uma carta (nova ou existente): palavra, 4 proibidas e tema. */
function CardForm({ bank, theme, card, onDone }: { bank: PalBank; theme: PalBankTheme; card?: PalBankCard; onDone: () => void }) {
  const [word, setWord] = useState(card?.word ?? "");
  const [forbidden, setForbidden] = useState<string[]>(card ? [...card.forbidden] : Array.from({ length: PAL_FORBIDDEN_COUNT }, () => ""));
  const [target, setTarget] = useState(theme.id);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState<{ theme: string; word: string; forbidden: string[] } | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const serverError = usePalLocal((l) => (l.editScope === "card" ? l.bankError : null));
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => first.current?.focus(), []);
  // Salvou: a carta aparece no banco que o servidor devolveu (no tema escolhido).
  useEffect(() => {
    if (!pending) return;
    const t = bank.themes.find((x) => x.id === pending.theme);
    const ok = t?.cards.some((c) => (!card || c.id === card.id) && c.word === pending.word && c.forbidden.join("\n") === pending.forbidden.join("\n"));
    if (ok) onDone();
  }, [bank, pending, card, onDone]);
  useEffect(() => {
    if (pending && serverError) setPending(null);
  }, [serverError, pending]);

  const save = () => {
    const r = palCleanCard({ word, forbidden });
    const dest = bank.themes.find((t) => t.id === target) ?? theme;
    const moving = !card || dest.id !== theme.id;
    const local = typeof r === "string" ? r : palCardTaken(dest, r.word, card?.id) ? "duplicate" : moving && dest.cards.length >= PAL_MAX_CARDS ? "full" : null;
    if (local || typeof r === "string") return setProblem(local);
    setProblem(null);
    usePalLocal.setState({ bankError: null, editScope: "card" });
    setPending({ theme: dest.id, ...r });
    send("cardSave", { theme: dest.id, ...(card ? { id: card.id } : {}), word: r.word, forbidden: r.forbidden });
  };
  const err = problem ?? (serverError && CARD_ERRORS.includes(serverError) ? serverError : null);

  return (
    <motion.form
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="flex flex-col gap-2.5 overflow-hidden rounded-xl bg-card/70 p-3 ring-1 ring-signal/30"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      aria-label={card ? `${T.edit}: ${card.word}` : T.pal.newCard}
      data-pal-card-form
    >
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <label className="flex flex-col gap-1">
          <span className="label-caps">{T.pal.word}</span>
          <input ref={first} value={word} maxLength={PAL_WORD_MAX} onChange={(e) => setWord(e.target.value)} className={clsx(input, "font-semibold")} autoComplete="off" spellCheck={false} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label-caps">{T.pal.themeField}</span>
          <select value={target} onChange={(e) => setTarget(e.target.value)} className={clsx(input, "sm:w-44")}>
            {bank.themes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="label-caps mb-1">{T.pal.forbiddenLegend}</legend>
        <div className="grid grid-cols-2 gap-1.5">
          {forbidden.map((f, i) => (
            <div key={i} className="relative">
              <Ban className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-danger/80" aria-hidden />
              <input
                value={f}
                maxLength={PAL_WORD_MAX}
                onChange={(e) => setForbidden((cur) => cur.map((x, k) => (k === i ? e.target.value : x)))}
                aria-label={T.pal.forbiddenN(i + 1)}
                placeholder={T.pal.forbiddenN(i + 1)}
                autoComplete="off"
                spellCheck={false}
                className={clsx(input, "w-full pl-6")}
              />
            </div>
          ))}
        </div>
      </fieldset>
      {err && (
        <p className="text-[12px] text-warn" role="alert">
          {T.pal.editErrors[err] ?? err}
        </p>
      )}
      {confirmDel && card ? (
        <div className="flex items-center gap-2" data-grupo-modal>
          <span className="mr-auto text-xs">{T.pal.deleteCardConfirm}</span>
          <GhostButton onClick={() => setConfirmDel(false)}>{T.cancel}</GhostButton>
          <button
            type="button"
            onClick={() => {
              usePalLocal.setState({ bankError: null, editScope: "card" });
              send("cardDelete", { id: card.id });
              onDone();
            }}
            className="rounded-xl bg-danger/90 px-3 py-2 text-xs font-semibold text-offwhite hover:bg-danger"
          >
            {T.delete}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {card && (
            <GhostButton onClick={() => setConfirmDel(true)} className="hover:text-danger" label={T.pal.deleteCard}>
              <Trash2 className="size-3.5" />
            </GhostButton>
          )}
          <GhostButton onClick={onDone} className="ml-auto">
            {T.cancel}
          </GhostButton>
          <PrimaryButton onClick={save} disabled={!!pending} className="py-2">
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}
            {T.save}
          </PrimaryButton>
        </div>
      )}
    </motion.form>
  );
}

/** Restaurar as 150 cartas originais (com confirmação). */
function ResetBar({ onReset }: { onReset: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <section className="mt-1 flex flex-wrap items-center gap-2 border-t border-offwhite/8 pt-3">
      {confirm ? (
        <div className="flex w-full flex-wrap items-center gap-2" data-grupo-modal>
          <span className="mr-auto text-xs text-offwhite/90">{T.pal.resetConfirm}</span>
          <GhostButton onClick={() => setConfirm(false)}>{T.cancel}</GhostButton>
          <button
            type="button"
            onClick={() => {
              usePalLocal.setState({ bankError: null, editScope: null });
              send("bankReset");
              setConfirm(false);
              onReset();
            }}
            className="rounded-xl bg-danger/90 px-3 py-2 text-xs font-semibold text-offwhite hover:bg-danger"
          >
            {T.pal.resetDo}
          </button>
        </div>
      ) : (
        <GhostButton onClick={() => setConfirm(true)}>
          <RotateCcw className="size-3.5" />
          {T.pal.reset}
        </GhostButton>
      )}
    </section>
  );
}
