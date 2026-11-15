import { Suspense, lazy, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useApp } from "../state/store.ts";
import { connect, disconnect, sendInfo } from "../net/session.ts";
import { startMovement, stopMovement } from "../engine/movement.ts";
import { self } from "../world/registry.ts";
import { placeName } from "../world/zoneLabel.ts";
import { Hud } from "./Hud.tsx";

// As duas lentes são carregadas sob demanda: a tela de entrada não baixa nenhum motor gráfico.
const Lens2D = lazy(() => import("../lens2d/Lens2D.tsx").then((m) => ({ default: m.Lens2D })));
const Lens3D = lazy(() => import("../lens3d/Lens3D.tsx"));

/** O escritório: lente ativa + HUD. Conecta ao entrar e desconecta ao sair. */
export function WorldView() {
  const { t } = useTranslation();
  const lens = useApp((s) => s.lens);
  const conn = useApp((s) => s.conn);
  const error = useApp((s) => s.error);

  useEffect(() => {
    connect();
    startMovement();
    return () => {
      stopMovement();
      disconnect();
    };
  }, []);

  // Avisa os outros sobre a lente em uso.
  useEffect(() => {
    sendInfo({ lens });
  }, [lens]);

  // Nome do lugar onde você está.
  useEffect(() => {
    const id = window.setInterval(() => useApp.getState().setZoneName(placeName(self)), 300);
    return () => window.clearInterval(id);
  }, []);

  // Atalhos: L troca a lente, Esc fecha painéis.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.code === "KeyL" && !e.ctrlKey && !e.metaKey) {
        const s = useApp.getState();
        s.setLens(s.lens === "2d" ? "3d" : "2d");
      }
      if (e.code === "Escape") useApp.getState().togglePeople(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden bg-deep">
      <Suspense fallback={<Splash text={lens === "3d" ? t("loading.world3d") : t("conn.connecting")} />}>
        {lens === "2d" ? <Lens2D /> : <Lens3D />}
      </Suspense>
      <Hud />
      {conn !== "open" && <ConnectionOverlay conn={conn} error={error} />}
    </div>
  );
}

function Splash({ text }: { text: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-deep">
      <div className="flex flex-col items-center gap-4">
        <img src="/brand/sparkle.svg" alt="" width={44} height={44} className="animate-pulse" />
        <p className="text-sm text-slate">{text}</p>
      </div>
    </div>
  );
}

function ConnectionOverlay({ conn, error }: { conn: string; error: string | null }) {
  const { t } = useTranslation();
  const failed = conn === "error";
  return (
    <div className="absolute inset-x-0 top-16 flex justify-center px-3" role="status" aria-live="polite">
      <div className="glass flex items-center gap-3 rounded-full px-4 py-2 text-sm">
        {!failed && <span className="size-2 animate-pulse rounded-full bg-warn" />}
        {failed && <span className="size-2 rounded-full bg-danger" />}
        <span>{failed ? (error ?? t("conn.error")) : conn === "reconnecting" ? t("conn.reconnecting") : t("conn.connecting")}</span>
        {failed && (
          <button type="button" onClick={() => connect()} className="rounded-full bg-offwhite/10 px-3 py-1 text-xs hover:bg-offwhite/20">
            {t("conn.retry")}
          </button>
        )}
      </div>
    </div>
  );
}
