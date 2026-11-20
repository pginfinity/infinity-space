import { useEffect } from "react";
import { REC_ID } from "@infinity/world";
import { sendAct } from "../registry.ts";
import { micTrack, useMedia } from "../../media/rtc.ts";

/**
 * Transcrição das gravações: enquanto o gravador da sala ouve você (microfone ligado, sem sussurro,
 * a mesma regra da voz), o navegador transcreve só a sua fala e manda as frases ao servidor, que
 * monta a transcrição junto com o áudio (ver apps/server/src/recording/transcript.ts).
 * Usa a Web Speech API: no Chrome o áudio passa pelo serviço de voz do Google; no Edge, pelo da
 * Microsoft. Navegador sem a API (Firefox): a fala dessa pessoa fica só no áudio.
 */

interface Result {
  readonly isFinal: boolean;
  readonly 0?: { transcript: string };
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<Result> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  /** O Chrome novo aceita a faixa do microfone escolhido; o antigo ignora e usa o microfone padrão. */
  start(track?: MediaStreamTrack): void;
  abort(): void;
}
type Ctor = new () => Recognition;
const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };

/** Liga a transcrição quando o gravador ouve você; devolve se está transcrevendo. */
export function useTranscriber(): boolean {
  const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  const on = useMedia((s) => s.mic && s.recorded) && !!SR;
  useEffect(() => {
    if (!on || !SR) return;
    let done = false;
    let retry: number | undefined;
    let wait = 500;
    const rec = new SR();
    rec.lang = "pt-BR";
    rec.continuous = true;
    rec.interimResults = false;
    const begin = () => {
      try {
        rec.start(micTrack()?.mediaStreamTrack);
      } catch {
        /* já estava rodando */
      }
    };
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]!;
        const text = r.isFinal ? r[0]?.transcript.trim() : "";
        if (text) sendAct(REC_ID, "fala", { text });
      }
      wait = 500;
    };
    // O navegador encerra sozinho depois de um silêncio ou de uma queda de rede: recomeça.
    rec.onend = () => {
      if (!done) retry = window.setTimeout(begin, wait);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") done = true;
      else if (e.error !== "no-speech") wait = 5000;
    };
    begin();
    return () => {
      done = true;
      window.clearTimeout(retry);
      rec.abort();
    };
  }, [on, SR]);
  return on;
}
