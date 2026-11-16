import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { FileText, Film, Mic, MicOff, MonitorUp, Video, VideoOff } from "lucide-react";
import { setCam, setMic, startShare, stopShare, useMedia, type ShareIntent } from "../media/rtc.ts";
import { useMediaSettings } from "../media/settings.ts";
import { toast } from "./toasts.ts";

/** Microfone e câmera na doca, com o contador de quem te ouve. Atalhos: M e V. */
export function MediaControls() {
  const status = useMedia((s) => s.status);
  const mic = useMedia((s) => s.mic);
  const cam = useMedia((s) => s.cam);
  const audience = useMedia((s) => s.audience);
  const error = useMedia((s) => s.error);
  const ready = status === "on";
  const ptt = useMediaSettings((s) => s.micMode === "ptt");

  useEffect(() => {
    if (error) toast(error, 5000);
  }, [error]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const s = useMedia.getState();
      const ptt = useMediaSettings.getState().micMode === "ptt";
      if (e.code === "KeyM") void setMic(ptt ? true : !s.mic);
      if (e.code === "KeyV") void setCam(!s.cam);
    };
    // Aperte-para-falar: soltar M (ou a janela perder o foco) silencia.
    const onUp = (e: KeyboardEvent) => {
      if (e.code === "KeyM" && useMediaSettings.getState().micMode === "ptt" && useMedia.getState().mic) void setMic(false);
    };
    const onBlur = () => {
      if (useMediaSettings.getState().micMode === "ptt" && useMedia.getState().mic) void setMic(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  const title = !ready ? (status === "connecting" ? "Conectando o áudio…" : status === "error" ? "Áudio indisponível" : "Áudio desligado") : undefined;

  return (
    <div className="flex items-center gap-1" title={title}>
      <button
        type="button"
        disabled={!ready}
        onClick={ptt ? undefined : () => void setMic(!mic)}
        // Aperte-para-falar: segurar o botão (ou M) fala; soltar silencia.
        onPointerDown={ptt ? () => void setMic(true) : undefined}
        onPointerUp={ptt ? () => void setMic(false) : undefined}
        onPointerLeave={ptt && mic ? () => void setMic(false) : undefined}
        aria-pressed={mic}
        data-tour-target="mic"
        aria-label={ptt ? "Segure para falar (M)" : mic ? "Desligar microfone (M)" : "Ligar microfone (M)"}
        title={ptt ? "Segure para falar (M)" : mic ? "Desligar microfone (M)" : "Ligar microfone (M)"}
        className={clsx(
          "relative flex h-10 items-center gap-1.5 rounded-xl px-3 transition-colors disabled:opacity-40",
          mic ? "bg-ok/20 text-ok hover:bg-ok/30" : "bg-danger/15 text-danger hover:bg-danger/25",
        )}
      >
        {mic ? <Mic className="size-[18px]" /> : <MicOff className="size-[18px]" />}
        {mic && (
          <>
            <span className="hidden text-xs font-medium tabular-nums sm:inline">{audience === 0 ? "ninguém ouve" : audience === 1 ? "1 ouve" : `${audience} ouvem`}</span>
            <span className="text-xs font-semibold tabular-nums sm:hidden" aria-hidden>
              {audience}
            </span>
          </>
        )}
      </button>
      <button
        type="button"
        disabled={!ready}
        onClick={() => void setCam(!cam)}
        aria-pressed={cam}
        aria-label={cam ? "Desligar câmera (V)" : "Ligar câmera (V)"}
        title={cam ? "Desligar câmera (V)" : "Ligar câmera (V)"}
        className={clsx("grid size-10 place-items-center rounded-xl transition-colors disabled:opacity-40", cam ? "bg-offwhite/12 text-offwhite" : "text-offwhite/70 hover:bg-offwhite/8 hover:text-offwhite")}
      >
        {cam ? <Video className="size-[18px]" /> : <VideoOff className="size-[18px]" />}
      </button>
      {CAN_SHARE && <ShareButton ready={ready} />}
    </div>
  );
}

/** Celular e alguns tablets não compartilham tela pelo navegador: o botão nem aparece. */
const CAN_SHARE = typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getDisplayMedia === "function";

/** Compartilhar tela: antes de abrir o seletor do navegador, a pessoa diz o que vai mostrar. */
function ShareButton({ ready }: { ready: boolean }) {
  const screen = useMedia((s) => s.screen);
  const [open, setOpen] = useState(false);
  const [audio, setAudio] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const go = (intent: ShareIntent) => {
    setOpen(false);
    void startShare(intent, audio);
  };

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        disabled={!ready}
        onClick={() => (screen ? void stopShare() : setOpen((o) => !o))}
        aria-pressed={screen}
        aria-expanded={open}
        aria-label={screen ? "Parar de compartilhar a tela" : "Compartilhar a tela"}
        title={screen ? "Parar de compartilhar a tela" : "Compartilhar a tela"}
        className={clsx("grid size-10 place-items-center rounded-xl transition-colors disabled:opacity-40", screen ? "bg-signal/20 text-signal hover:bg-signal/30" : "text-offwhite/70 hover:bg-offwhite/8 hover:text-offwhite")}
      >
        <MonitorUp className="size-[18px]" />
      </button>
      {open && (
        <div role="menu" className="absolute bottom-12 left-1/2 w-72 -translate-x-1/2 rounded-2xl border border-offwhite/10 bg-space p-2 shadow-2xl">
          <p className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate">O que você vai mostrar?</p>
          <ShareOption icon={<FileText className="size-4" />} title="Documento" hint="Código, planilha, texto. Prioriza nitidez." onClick={() => go("document")} />
          <ShareOption icon={<Film className="size-4" />} title="Vídeo ou animação" hint="Vídeo, protótipo, 3D. Prioriza fluidez." onClick={() => go("video")} />
          <label className="mt-1 flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-xs text-offwhite/85 hover:bg-offwhite/6">
            <input type="checkbox" checked={audio} onChange={(e) => setAudio(e.target.checked)} className="size-3.5 accent-[var(--color-signal)]" />
            Incluir o som da aba ou do sistema
          </label>
        </div>
      )}
    </div>
  );
}

function ShareOption({ icon, title, hint, onClick }: { icon: React.ReactNode; title: string; hint: string; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className="flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left hover:bg-offwhite/8">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-offwhite/8 text-offwhite">{icon}</span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-slate">{hint}</span>
      </span>
    </button>
  );
}
