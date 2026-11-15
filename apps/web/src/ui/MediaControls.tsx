import { useEffect } from "react";
import { clsx } from "clsx";
import { Mic, MicOff, Video, VideoOff } from "lucide-react";
import { setCam, setMic, useMedia } from "../media/rtc.ts";
import { toast } from "./toasts.ts";

/** Microfone e câmera na doca, com o contador de quem te ouve. Atalhos: M e V. */
export function MediaControls() {
  const status = useMedia((s) => s.status);
  const mic = useMedia((s) => s.mic);
  const cam = useMedia((s) => s.cam);
  const audience = useMedia((s) => s.audience);
  const error = useMedia((s) => s.error);
  const ready = status === "on";

  useEffect(() => {
    if (error) toast(error, 5000);
  }, [error]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const s = useMedia.getState();
      if (e.code === "KeyM") void setMic(!s.mic);
      if (e.code === "KeyV") void setCam(!s.cam);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const title = !ready ? (status === "connecting" ? "Conectando o áudio…" : status === "error" ? "Áudio indisponível" : "Áudio desligado") : undefined;

  return (
    <div className="flex items-center gap-1" title={title}>
      <button
        type="button"
        disabled={!ready}
        onClick={() => void setMic(!mic)}
        aria-pressed={mic}
        aria-label={mic ? "Desligar microfone (M)" : "Ligar microfone (M)"}
        title={mic ? "Desligar microfone (M)" : "Ligar microfone (M)"}
        className={clsx(
          "relative flex h-10 items-center gap-1.5 rounded-xl px-3 transition-colors disabled:opacity-40",
          mic ? "bg-ok/20 text-ok hover:bg-ok/30" : "bg-danger/15 text-danger hover:bg-danger/25",
        )}
      >
        {mic ? <Mic className="size-[18px]" /> : <MicOff className="size-[18px]" />}
        {mic && <span className="text-xs font-medium tabular-nums">{audience === 0 ? "ninguém ouve" : audience === 1 ? "1 ouve" : `${audience} ouvem`}</span>}
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
    </div>
  );
}
