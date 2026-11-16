import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { clsx } from "clsx";
import { ArrowLeft, Check, LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { QUIZ_ID, QUIZ_LETTERS, QUIZ_OPTION_MAX, QUIZ_TEXT_MAX, QUIZ_TITLE_MAX, quizCleanQuestion, type QuizPack, type QuizQuestion } from "@infinity/world";
import { GamePanelShell, GhostButton, PrimaryButton, closePanel, openPanel } from "./shared.tsx";
import { OptionGlyph } from "./quizParts.tsx";
import { quizSend, useQuiz, useQuizLocal } from "./quizStore.ts";
import { T } from "./strings.ts";

/**
 * Editor do banco de perguntas (quem está no palco): pacotes e perguntas, salvos no servidor.
 * O banco completo (com as respostas) só chega a quem pede daqui.
 */
export function QuizEditor() {
  const bank = useQuizLocal((l) => l.bank);
  const error = useQuizLocal((l) => l.bankError);
  const s = useQuiz();
  const [packId, setPackId] = useState<string | null>(s?.pack?.id ?? null);
  const [editing, setEditing] = useState<string | "new" | null>(null);

  useEffect(() => {
    useQuizLocal.setState({ bankError: null });
    quizSend("bank");
  }, []);

  const pack = bank?.packs.find((p) => p.id === packId) ?? bank?.packs[0] ?? null;
  useEffect(() => {
    if (pack && pack.id !== packId) setPackId(pack.id);
  }, [pack, packId]);

  const back = () => openPanel("quiz", QUIZ_ID);
  return (
    <GamePanelShell
      title={T.quiz.bank}
      sub={<span>{T.quiz.bankHint}</span>}
      icon={
        <button type="button" onClick={back} aria-label={T.back} className="grid size-8 place-items-center rounded-xl hover:bg-offwhite/8">
          <ArrowLeft className="size-4" />
        </button>
      }
      onClose={closePanel}
      label={T.quiz.bank}
    >
      {error === "stage" ? (
        <p className="rounded-xl bg-warn/10 px-3 py-2 text-xs text-warn" role="alert">
          {T.quiz.errors.stage}
        </p>
      ) : !bank ? (
        <p className="flex items-center gap-2 py-8 text-sm text-slate">
          <LoaderCircle className="size-4 animate-spin" />
          {T.quiz.loading}
        </p>
      ) : (
        <>
          <PackBar packs={bank.packs} current={pack} onPick={(id) => (setPackId(id), setEditing(null))} />
          {pack && (
            <>
              <div className="flex items-center justify-between">
                <span className="label-caps">{T.quiz.questionsCount(pack.questions.length)}</span>
                {editing !== "new" && (
                  <GhostButton onClick={() => setEditing("new")}>
                    <Plus className="size-3.5" />
                    {T.quiz.newQuestion}
                  </GhostButton>
                )}
              </div>
              <AnimatePresence initial={false}>{editing === "new" && <QuestionForm key="new" pack={pack} onDone={() => setEditing(null)} />}</AnimatePresence>
              {pack.questions.length === 0 && editing !== "new" ? (
                <p className="rounded-xl bg-offwhite/[0.03] px-3 py-4 text-center text-xs text-slate ring-1 ring-offwhite/8">{T.quiz.emptyPack}</p>
              ) : (
                <ol className="flex flex-col gap-1.5">
                  {pack.questions.map((q, i) =>
                    editing === q.id ? (
                      <li key={q.id}>
                        <QuestionForm pack={pack} q={q} onDone={() => setEditing(null)} />
                      </li>
                    ) : (
                      <li key={q.id}>
                        <button type="button" onClick={() => setEditing(q.id)} className="group flex w-full items-start gap-2.5 rounded-xl bg-offwhite/[0.035] px-3 py-2 text-left ring-1 ring-offwhite/8 transition-colors hover:bg-offwhite/[0.07]" aria-label={`${T.edit}: ${q.text}`}>
                          <span className="mt-0.5 w-5 shrink-0 font-display text-[11px] tabular-nums text-slate">{i + 1}</span>
                          <span className="min-w-0 flex-1">
                            <span className="line-clamp-2 text-[13px] leading-snug">{q.text}</span>
                            <span className="mt-0.5 flex items-center gap-1 text-[11px] text-slate">
                              <OptionGlyph i={q.correct} className="size-3" />
                              {q.options[q.correct]}
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
        </>
      )}
    </GamePanelShell>
  );
}

/** Pacotes: escolher, criar, renomear e apagar. */
function PackBar({ packs, current, onPick }: { packs: QuizPack[]; current: QuizPack | null; onPick: (id: string) => void }) {
  const [mode, setMode] = useState<"idle" | "new" | "rename" | "delete">("idle");
  const [title, setTitle] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const error = useQuizLocal((l) => l.bankError);
  const prevCount = useRef(packs.length);
  useEffect(() => {
    if (mode === "new" || mode === "rename") input.current?.focus();
  }, [mode]);
  // Pacote criado: seleciona o novo.
  useEffect(() => {
    if (packs.length > prevCount.current) onPick(packs[packs.length - 1]!.id);
    prevCount.current = packs.length;
  }, [packs, onPick]);

  const submit = () => {
    const t = title.trim();
    if (t.length < 2) return useQuizLocal.setState({ bankError: "title" });
    if (mode === "new") quizSend("packAdd", { title: t });
    if (mode === "rename" && current) quizSend("packRename", { id: current.id, title: t });
    setMode("idle");
    setTitle("");
  };

  return (
    <section className="flex flex-col gap-2 rounded-xl bg-offwhite/[0.03] p-2.5 ring-1 ring-offwhite/8">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={T.quiz.pack}>
        {packs.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={p.id === current?.id}
            onClick={() => onPick(p.id)}
            className={clsx("rounded-full px-2.5 py-1 text-xs ring-1 transition-colors", p.id === current?.id ? "bg-offwhite text-space ring-offwhite" : "text-offwhite/80 ring-offwhite/12 hover:bg-offwhite/8")}
          >
            {p.title} <span className="tabular-nums opacity-60">{p.questions.length}</span>
          </button>
        ))}
        {mode !== "new" && (
          <button type="button" onClick={() => (setMode("new"), setTitle(""))} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-signal ring-1 ring-signal/30 hover:bg-signal/10">
            <Plus className="size-3" />
            {T.quiz.newPack}
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
          <input
            ref={input}
            value={title}
            maxLength={QUIZ_TITLE_MAX}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={T.quiz.packTitle}
            aria-label={T.quiz.packTitle}
            className="min-w-0 flex-1 rounded-lg border border-offwhite/10 bg-deep px-2.5 py-1.5 text-sm placeholder:text-slate/70 focus:border-signal focus:outline-none"
          />
          <GhostButton onClick={() => setMode("idle")}>{T.cancel}</GhostButton>
          <button type="submit" className="rounded-xl bg-offwhite px-3 py-2 text-xs font-semibold text-space hover:bg-offwhite/90">
            {T.save}
          </button>
        </form>
      )}
      {mode === "delete" && current && (
        <div className="flex items-center gap-2" data-grupo-modal>
          <span className="mr-auto text-xs text-offwhite/90">{T.quiz.deletePackConfirm(current.title, current.questions.length)}</span>
          <GhostButton onClick={() => setMode("idle")}>{T.cancel}</GhostButton>
          <button
            type="button"
            onClick={() => {
              quizSend("packDelete", { id: current.id });
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
          <GhostButton onClick={() => (setMode("rename"), setTitle(current.title))}>
            <Pencil className="size-3" />
            {T.quiz.renamePack}
          </GhostButton>
          <GhostButton onClick={() => setMode("delete")} className="hover:text-danger">
            <Trash2 className="size-3" />
            {T.quiz.deletePack}
          </GhostButton>
        </div>
      )}
      {error === "title" && <p className="text-[11px] text-warn">{T.quiz.errors.title}</p>}
    </section>
  );
}

/** Formulário de uma pergunta (nova ou existente). */
function QuestionForm({ pack, q, onDone }: { pack: QuizPack; q?: QuizQuestion; onDone: () => void }) {
  const [text, setText] = useState(q?.text ?? "");
  const [options, setOptions] = useState<string[]>(q ? [...q.options] : ["", "", "", ""]);
  const [correct, setCorrect] = useState<number>(q?.correct ?? 0);
  const [confirmDel, setConfirmDel] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const serverError = useQuizLocal((l) => l.bankError);
  const area = useRef<HTMLTextAreaElement>(null);
  const countBefore = useMemo(() => pack.questions.length, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [saving, setSaving] = useState(false);

  useEffect(() => area.current?.focus(), []);
  // Salvou (nova): o pacote ganhou uma pergunta. Salvou (edição): o texto bate com o servidor.
  useEffect(() => {
    if (!saving) return;
    const done = q ? pack.questions.some((x) => x.id === q.id && x.text === text.trim().replace(/\s+/g, " ")) : pack.questions.length > countBefore;
    if (done) onDone();
  }, [pack, saving, q, text, countBefore, onDone]);
  useEffect(() => {
    if (saving && serverError) setSaving(false);
  }, [serverError, saving]);

  const save = () => {
    const r = quizCleanQuestion({ text, options, correct });
    if (typeof r === "string") return setProblem(r);
    setProblem(null);
    useQuizLocal.setState({ bankError: null });
    setSaving(true);
    quizSend("qSave", { pack: pack.id, ...(q ? { id: q.id } : {}), text: r.text, options: r.options, correct: r.correct });
  };
  const err = problem ?? (serverError && serverError !== "title" ? serverError : null);

  return (
    <motion.form
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="flex flex-col gap-2 overflow-hidden rounded-xl bg-card/70 p-3 ring-1 ring-signal/30"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      aria-label={q ? T.edit : T.quiz.newQuestion}
    >
      <label className="flex flex-col gap-1">
        <span className="label-caps">{T.quiz.questionText}</span>
        <textarea
          ref={area}
          value={text}
          maxLength={QUIZ_TEXT_MAX}
          rows={2}
          onChange={(e) => setText(e.target.value)}
          className="resize-none rounded-lg border border-offwhite/10 bg-deep px-2.5 py-2 text-sm leading-snug placeholder:text-slate/70 focus:border-signal focus:outline-none"
        />
      </label>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="label-caps mb-1">{T.quiz.optionsLegend}</legend>
        {options.map((o, i) => (
          <div key={i} className={clsx("flex items-center gap-2 rounded-lg px-1.5 py-1 ring-1", correct === i ? "bg-ok/10 ring-ok/40" : "ring-transparent")}>
            <button
              type="button"
              role="radio"
              aria-checked={correct === i}
              aria-label={T.quiz.markCorrect(QUIZ_LETTERS[i]!)}
              onClick={() => setCorrect(i)}
              className={clsx("grid size-6 shrink-0 place-items-center rounded-full ring-1 transition-colors", correct === i ? "bg-ok text-space ring-ok" : "text-transparent ring-offwhite/25 hover:ring-offwhite/50")}
            >
              <Check className="size-3.5" />
            </button>
            <OptionGlyph i={i} className="size-4 shrink-0" />
            <input
              value={o}
              maxLength={QUIZ_OPTION_MAX}
              onChange={(e) => setOptions((cur) => cur.map((x, k) => (k === i ? e.target.value : x)))}
              aria-label={T.quiz.option(QUIZ_LETTERS[i]!)}
              placeholder={T.quiz.option(QUIZ_LETTERS[i]!)}
              className="min-w-0 flex-1 rounded-md border border-offwhite/10 bg-deep px-2 py-1.5 text-sm placeholder:text-slate/60 focus:border-signal focus:outline-none"
            />
          </div>
        ))}
      </fieldset>
      {err && (
        <p className="text-[12px] text-warn" role="alert">
          {T.quiz.errors[err] ?? err}
        </p>
      )}
      {confirmDel ? (
        <div className="flex items-center gap-2" data-grupo-modal>
          <span className="mr-auto text-xs">{T.quiz.deleteQuestion}?</span>
          <GhostButton onClick={() => setConfirmDel(false)}>{T.cancel}</GhostButton>
          <button
            type="button"
            onClick={() => {
              quizSend("qDelete", { pack: pack.id, id: q!.id });
              onDone();
            }}
            className="rounded-xl bg-danger/90 px-3 py-2 text-xs font-semibold text-offwhite hover:bg-danger"
          >
            {T.delete}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {q && (
            <GhostButton onClick={() => setConfirmDel(true)} className="hover:text-danger" label={T.quiz.deleteQuestion}>
              <Trash2 className="size-3.5" />
            </GhostButton>
          )}
          <GhostButton onClick={onDone} className="ml-auto">
            {T.cancel}
          </GhostButton>
          <PrimaryButton onClick={save} disabled={saving} className="py-2">
            {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}
            {T.save}
          </PrimaryButton>
        </div>
      )}
    </motion.form>
  );
}
