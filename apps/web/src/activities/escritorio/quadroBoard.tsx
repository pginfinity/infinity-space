import { useEffect, useRef, useState } from "react";
import { CaptureUpdateAction, Excalidraw, reconcileElements } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { RemoteExcalidrawElement } from "@excalidraw/excalidraw/data/reconcile";
import { QUADRO_ELEMENT_BYTES, QUADRO_ID } from "@infinity/world";
import { sendAct } from "../registry.ts";
import { useApp } from "../../state/store.ts";
import { onQuadro } from "./quadro.tsx";

/** Cada mensagem fica abaixo do limite de 64 KB que o servidor aceita. */
const CHUNK_BYTES = 40 * 1024;
const utf8 = new TextEncoder();

/**
 * O Excalidraw em si (carregado à parte). Manda só o que mudou desde a última versão que o servidor
 * conhece, em lotes a cada 100 ms; o que chega dos outros entra pela regra de versão do próprio Excalidraw.
 */
export default function QuadroBoard() {
  const api = useRef<ExcalidrawImperativeAPI | null>(null);
  const [ready, setReady] = useState(false);
  const conn = useApp((s) => s.conn);
  /** Versão de cada elemento que o servidor já tem (mandada daqui ou recebida). */
  const known = useRef(new Map<string, number>());
  const synced = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  const flush = () => {
    timer.current = undefined;
    const a = api.current;
    if (!a || !synced.current) return;
    let batch: unknown[] = [];
    let size = 0;
    const send = () => {
      if (batch.length > 0) sendAct(QUADRO_ID, "mudar", { elements: batch });
      batch = [];
      size = 0;
    };
    for (const e of a.getSceneElementsIncludingDeleted()) {
      if (e.version <= (known.current.get(e.id) ?? 0)) continue;
      known.current.set(e.id, e.version);
      const bytes = utf8.encode(JSON.stringify(e)).length;
      // shortcut: um elemento acima do limite (traço livre enorme) fica só aqui; dividir o traço resolveria.
      if (bytes > QUADRO_ELEMENT_BYTES) continue;
      if (size + bytes > CHUNK_BYTES || batch.length >= 500) send();
      batch.push(e);
      size += bytes;
    }
    send();
  };
  const schedule = () => {
    if (timer.current === undefined) timer.current = window.setTimeout(flush, 100);
  };

  // Abre de novo a cada reconexão: o servidor esquece quem estava com o quadro aberto.
  useEffect(() => {
    if (!ready || conn !== "open") return;
    synced.current = false;
    sendAct(QUADRO_ID, "abrir");
  }, [ready, conn]);

  useEffect(() => {
    if (!ready) return;
    const a = api.current!;
    const off = onQuadro((ev, data) => {
      if (ev !== "cena" && ev !== "mudou") return;
      const remote = (data as { elements: RemoteExcalidrawElement[] }).elements;
      if (ev === "cena") known.current.clear();
      for (const e of remote) known.current.set(e.id, e.version);
      a.updateScene({ elements: reconcileElements(a.getSceneElementsIncludingDeleted(), remote, a.getAppState()), captureUpdate: CaptureUpdateAction.NEVER });
      if (ev === "cena") {
        // O que foi desenhado aqui e o servidor não tem (ex.: durante uma queda) vai agora.
        synced.current = true;
        flush();
        // Para os testes: o quadro já recebeu o que o servidor tem.
        if (import.meta.env.DEV) Object.assign(window, { __quadro: a });
      }
    });
    return () => {
      off();
      if (import.meta.env.DEV) delete (window as { __quadro?: unknown }).__quadro;
    };
  }, [ready]);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      sendAct(QUADRO_ID, "fechar");
    },
    [],
  );

  return (
    <Excalidraw
      excalidrawAPI={(a) => {
        api.current = a;
        setReady(true);
      }}
      onChange={schedule}
      langCode="pt-BR"
      theme="light"
      autoFocus
      UIOptions={{ tools: { image: false } }}
    />
  );
}
