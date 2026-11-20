import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { create } from "zustand";
import { AnimatePresence, motion } from "motion/react";
import { LayoutDashboard, Trash2, X } from "lucide-react";
import * as THREE from "three";
import { PAINEL_ID, PAINEL_KIND, PAINEL_NOTICE_TEXT, PAINEL_RANGE, type MapObject, type PainelState, type PainelUpcoming } from "@infinity/world";
import { sendAct, useAct, type ActivityClient } from "../registry.ts";
import { useApp } from "../../state/store.ts";
import { toast } from "../../ui/toasts.ts";
import { world } from "../../world/world.ts";
import { self } from "../../world/registry.ts";
import { objectMatrix } from "../../scene/furniture/index.ts";
import { LOBBY_SCREEN, LOBBY_SCREEN_COLOR } from "../../scene/furniture/escritorio.ts";
import { useWallVisible } from "../../scene/wallFacing.ts";
import { burst } from "../grupo/fx.tsx";
import { wrap } from "./board.tsx";
import { deferScene, focusSoon, selfNear, timeAgo, useEscape } from "./shared.tsx";
import { T } from "./strings.ts";

/**
 * Painel do time no Átrio: metas da semana, aniversariantes, avisos do gestor e o que subiu para
 * produção (do Supremacy), numa tela na parede. Perto dele, E abre a leitura; admin edita ali mesmo.
 * Quando um cliente sobe para produção, todo mundo vê um aviso e confete.
 */

const usePainelUi = create<{ open: boolean; admin: boolean; birthdays: string; bad: string[] }>(() => ({ open: false, admin: false, birthdays: "", bad: [] }));

let panelObj: MapObject | null | undefined;
function panel(): MapObject | null {
  if (panelObj === undefined) panelObj = world().map.objects.find((o) => o.type === "lobby-panel") ?? null;
  return panelObj;
}

export const lobbyPanel: ActivityClient = {
  name: "escritorio/painel",
  kinds: [PAINEL_KIND],
  objects: ["lobby-panel"],
  label: () => T.painel.action,
  use: () => {
    useApp.getState().togglePeople(false);
    usePainelUi.setState({ open: true, bad: [] });
    // Desenvolvimento: ?admin=1 libera a edição nesta conexão (o servidor só aceita sem login).
    const dev = import.meta.env.DEV && new URLSearchParams(location.search).get("admin") === "1";
    sendAct(PAINEL_ID, dev ? "admin-dev" : "abrir", dev ? { on: true } : undefined);
  },
  onEvent: (e) => {
    if (e.ev === "papel") {
      const d = e.data as { admin: boolean; birthdays?: string };
      usePainelUi.setState({ admin: d.admin, birthdays: d.birthdays ?? "" });
    }
    if (e.ev === "salvo") {
      const bad = (e.data as { bad: string[] }).bad;
      usePainelUi.setState({ bad });
      toast(bad.length ? T.painel.bad(bad) : T.painel.saved, bad.length ? 6000 : 3200);
    }
    if (e.ev === "subiu") {
      toast(T.painel.rose((e.data as { client: string }).client), 6000);
      const o = panel();
      if (o?.interact) burst(o.interact.point, 2.4, 1.6);
      burst({ x: self.x, z: self.z }, 2.6, 1.4);
    }
  },
  Overlay: PainelOverlay,
  Scene: deferScene(PainelScene, 1100),
};

// ---- leitura e edição ---------------------------------------------------------------------

function PainelOverlay() {
  const open = usePainelUi((s) => s.open);
  return <AnimatePresence>{open && <PainelDialog />}</AnimatePresence>;
}

const dm = (b: PainelUpcoming) => (b.today ? T.painel.today : `${String(b.day).padStart(2, "0")}/${String(b.month).padStart(2, "0")}`);

function PainelDialog() {
  const state = useAct<PainelState>(PAINEL_ID);
  const admin = usePainelUi((s) => s.admin);
  const [now, setNow] = useState(() => Date.now());
  const closeBtn = useRef<HTMLButtonElement>(null);
  const close = () => usePainelUi.setState({ open: false });

  useEffect(() => focusSoon(closeBtn.current), []);
  useEscape(close);
  // Longe do painel, fecha (o servidor também recusa a edição).
  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now());
      const o = panel();
      if (o?.interact && !selfNear(o.interact.point, PAINEL_RANGE + 0.8)) close();
    }, 500);
    return () => window.clearInterval(id);
  }, []);

  const goals = state?.goals ?? [];
  const notices = state?.notices ?? [];
  const birthdays = state?.birthdays ?? [];
  const deploys = state?.deploys ?? null;

  return (
    <motion.aside
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="glass pointer-events-auto absolute bottom-[228px] right-3 top-16 z-20 flex w-[min(400px,calc(100vw-24px))] flex-col overflow-hidden rounded-[var(--radius-panel)]"
      role="dialog"
      aria-label={T.painel.title}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
        e.stopPropagation();
      }}
    >
      <header className="flex items-center justify-between border-b border-offwhite/8 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <LayoutDashboard className="size-4 text-slate" aria-hidden />
          <h2 className="font-display text-sm font-medium uppercase tracking-[0.1em]">{T.painel.title}</h2>
        </div>
        <button ref={closeBtn} type="button" onClick={close} className="rounded-lg p-2 text-slate hover:bg-offwhite/8 hover:text-offwhite" aria-label={T.close}>
          <X className="size-4" />
        </button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
        <Section title={T.painel.goals} editor={admin ? <TextEditor id="painel-metas" initial={goals.join("\n")} hint={T.painel.goalsHint} onSave={(text) => sendAct(PAINEL_ID, "metas", { text })} /> : null}>
          {goals.length ? (
            <ul className="space-y-1 text-sm">
              {goals.map((g, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-signal" aria-hidden>
                    ▸
                  </span>
                  {g}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate">{T.painel.goalsEmpty}</p>
          )}
        </Section>

        <Section title={T.painel.notices}>
          {admin && <NoticeForm />}
          {notices.length ? (
            <ul className="space-y-2">
              {notices.map((n) => (
                <li key={n.id} className="rounded-xl bg-offwhite/5 px-3 py-2">
                  <p className="whitespace-pre-line text-sm">{n.text}</p>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-slate">
                    <span>
                      {n.by} · {timeAgo(n.at, now)}
                    </span>
                    {admin && (
                      <button type="button" onClick={() => sendAct(PAINEL_ID, "tirar-aviso", { id: n.id })} aria-label={T.painel.removeNotice} title={T.painel.removeNotice} className="rounded-md p-1 hover:bg-offwhite/10 hover:text-offwhite">
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate">{T.painel.noticesEmpty}</p>
          )}
        </Section>

        <Section title={T.painel.birthdays} editor={admin ? <BirthdayEditor /> : null}>
          {birthdays.length ? (
            <ul className="space-y-1 text-sm">
              {birthdays.map((b) => (
                <li key={`${b.name}-${b.day}-${b.month}`} className="flex items-center justify-between">
                  <span>
                    {b.today ? "🎂 " : ""}
                    {b.name}
                  </span>
                  <span className={`text-xs tabular-nums ${b.today ? "font-semibold text-orange" : "text-slate"}`}>{dm(b)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate">{T.painel.birthdaysEmpty}</p>
          )}
        </Section>

        {deploys && (
          <Section title={T.painel.deploys}>
            {deploys.length ? (
              <ul className="space-y-1 text-sm">
                {deploys.map((d) => (
                  <li key={d.client} className="flex items-center justify-between">
                    <span>🚀 {d.client}</span>
                    <span className="text-xs tabular-nums text-slate">{T.painel.deploysCount(d.deploys)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate">{T.painel.deploysEmpty}</p>
            )}
          </Section>
        )}
      </div>
    </motion.aside>
  );
}

function Section({ title, editor, children }: { title: string; editor?: ReactNode; children: ReactNode }) {
  const [editing, setEditing] = useState(false);
  return (
    <section aria-label={title}>
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="label-caps">{title}</h3>
        {editor && (
          <button type="button" onClick={() => setEditing((v) => !v)} aria-expanded={editing} className="rounded-md px-2 py-0.5 text-[11px] text-slate hover:bg-offwhite/8 hover:text-offwhite">
            {editing ? T.close : T.painel.edit}
          </button>
        )}
      </div>
      {editing && editor}
      {children}
    </section>
  );
}

const fieldCls = "mt-1 w-full resize-none rounded-xl border border-offwhite/10 bg-offwhite/5 px-3 py-2 text-sm text-offwhite placeholder:text-slate focus:border-signal focus:outline-none";

function TextEditor({ id, initial, hint, onSave }: { id: string; initial: string; hint: string; onSave: (text: string) => void }) {
  const [text, setText] = useState(initial);
  useEffect(() => setText(initial), [initial]);
  return (
    <form
      className="mb-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(text);
      }}
    >
      <label htmlFor={id} className="text-[11px] text-slate">
        {hint}
      </label>
      <textarea id={id} value={text} rows={5} onChange={(e) => setText(e.target.value)} className={fieldCls} />
      <div className="mt-1.5 flex justify-end">
        <button type="submit" className="rounded-xl bg-orange px-4 py-1.5 text-sm font-semibold text-offwhite hover:brightness-110">
          {T.painel.save}
        </button>
      </div>
    </form>
  );
}

function BirthdayEditor() {
  const initial = usePainelUi((s) => s.birthdays);
  const bad = usePainelUi((s) => s.bad);
  return (
    <>
      <TextEditor id="painel-aniversarios" initial={initial} hint={T.painel.birthdaysHint} onSave={(text) => sendAct(PAINEL_ID, "aniversarios", { text })} />
      {bad.length > 0 && (
        <p role="alert" className="mb-2 text-[11px] text-orange">
          {T.painel.bad(bad)}
        </p>
      )}
    </>
  );
}

function NoticeForm() {
  const [text, setText] = useState("");
  const state = useAct<PainelState>(PAINEL_ID);
  const count = state?.notices.length ?? 0;
  const last = useRef(count);
  // Aviso aceito (a lista cresceu): limpa o campo.
  useEffect(() => {
    if (count > last.current) setText("");
    last.current = count;
  }, [count]);
  return (
    <form
      className="mb-2 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) sendAct(PAINEL_ID, "aviso", { text });
      }}
    >
      <input aria-label={T.painel.notices} value={text} maxLength={PAINEL_NOTICE_TEXT} onChange={(e) => setText(e.target.value)} placeholder={T.painel.noticePlaceholder} className={`${fieldCls} mt-0`} />
      <button type="submit" disabled={!text.trim()} className="shrink-0 rounded-xl bg-orange px-3 py-1.5 text-sm font-semibold text-offwhite hover:brightness-110 disabled:opacity-40">
        {T.painel.publish}
      </button>
    </form>
  );
}

// ---- painel no mundo (textura) ------------------------------------------------------------

const TEX_W = 1024;
const TEX_H = Math.round((TEX_W * LOBBY_SCREEN.h) / LOBBY_SCREEN.w);
const FONT = "Geist, 'Segoe UI', sans-serif";

/** Desenha a tela: título, metas e avisos à esquerda; aniversários e o que subiu à direita. */
function drawPanel(ctx: CanvasRenderingContext2D, s: PainelState | null): void {
  const W = TEX_W;
  const H = TEX_H;
  ctx.fillStyle = LOBBY_SCREEN_COLOR;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#00B7FF";
  ctx.fillRect(0, 0, W, 6);
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillStyle = "#F2F0EF";
  ctx.font = `700 34px ${FONT}`;
  ctx.fillText(T.painel.screenTitle, 36, 26);
  ctx.textAlign = "right";
  ctx.font = `500 22px ${FONT}`;
  ctx.fillStyle = "rgba(242,240,239,0.6)";
  ctx.fillText(T.painel.near, W - 36, 34);

  const col = (x: number, y: number, title: string, lines: string[], empty: string, max: number) => {
    ctx.textAlign = "left";
    ctx.fillStyle = "#EE5C29";
    ctx.font = `700 20px ${FONT}`;
    ctx.fillText(title.toUpperCase(), x, y);
    ctx.font = `500 23px ${FONT}`;
    let yy = y + 34;
    if (!lines.length) {
      ctx.fillStyle = "rgba(242,240,239,0.45)";
      ctx.fillText(empty, x, yy);
      return;
    }
    ctx.fillStyle = "#F2F0EF";
    let used = 0;
    for (const l of lines) {
      for (const w of wrap(ctx, l, W / 2 - 80, 2)) {
        if (used++ >= max) return;
        ctx.fillText(w, x, yy);
        yy += 30;
      }
    }
  };
  const top = 96;
  const mid = top + (H - top) / 2;
  col(36, top, T.painel.goals, (s?.goals ?? []).map((g) => `▸ ${g}`), T.painel.goalsEmpty, 6);
  col(36, mid, T.painel.notices, (s?.notices ?? []).slice(0, 2).map((n) => n.text), T.painel.noticesEmpty, 5);
  col(W / 2 + 20, top, T.painel.birthdays, (s?.birthdays ?? []).map((b) => `${b.today ? "🎂" : "·"} ${b.name} — ${dm(b)}`), T.painel.birthdaysEmpty, 6);
  if (s?.deploys) col(W / 2 + 20, mid, T.painel.deploys, s.deploys.slice(0, 5).map((d) => `🚀 ${d.client} · ${d.deploys}`), T.painel.deploysEmpty, 5);
  ctx.fillStyle = "rgba(242,240,239,0.12)";
  ctx.fillRect(W / 2 - 10, top, 2, H - top - 30);
}

function PainelScene() {
  const state = useAct<PainelState>(PAINEL_ID);
  const o = panel();
  const wallVisible = useWallVisible(o?.id);
  const { tex, ctx, mat, geo, place } = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = TEX_W;
    canvas.height = TEX_H;
    const ctx = canvas.getContext("2d")!;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    const geo = new THREE.PlaneGeometry(LOBBY_SCREEN.w, LOBBY_SCREEN.h);
    const place = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3(1, 1, 1) };
    if (o) objectMatrix(o).multiply(new THREE.Matrix4().makeTranslation(LOBBY_SCREEN.x, LOBBY_SCREEN.y, LOBBY_SCREEN.z)).decompose(place.p, place.q, place.s);
    return { tex, ctx, mat, geo, place };
  }, [o]);

  useEffect(
    () => () => {
      tex.dispose();
      mat.dispose();
      geo.dispose();
    },
    [tex, mat, geo],
  );

  // Redesenha quando o painel muda (e de novo quando a fonte terminar de carregar).
  useEffect(() => {
    const draw = () => {
      drawPanel(ctx, state ?? null);
      tex.needsUpdate = true;
    };
    draw();
    void document.fonts?.load(`500 23px Geist`).then(draw, () => undefined);
  }, [state, ctx, tex]);

  if (!o) return null;
  return <mesh geometry={geo} material={mat} position={place.p} quaternion={place.q} scale={place.s} visible={wallVisible} />;
}
