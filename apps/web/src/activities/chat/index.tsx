import { useEffect } from "react";
import { CHAT_KIND } from "@infinity/world";
import { registerActivity } from "../registry.ts";
import { useApp } from "../../state/store.ts";
import { registerSynth } from "../../audio/sfx.ts";
import { ChatBalloonProjector, ChatBalloons } from "./balloons.tsx";
import { ChatPanel } from "./Panel.tsx";
import { onChatEvent, openConv, syncChat, toggleChat } from "./store.ts";
import { registerPersonCommand } from "../../presence/store.ts";
import { typing } from "./util.ts";

/**
 * Pacote "chat": chat de texto do escritório. Painel com Geral, Perto e Conversas (abre pela doca
 * ou pela tecla C), balão do Perto acima da cabeça nas duas lentes e avisos de conversa e menção.
 */

function ChatOverlay() {
  const selfId = useApp((s) => s.selfId);
  // Entrou (ou reconectou com um id novo): pede o Geral e a lista de conversas.
  useEffect(() => {
    if (selfId) syncChat();
  }, [selfId]);

  // Tecla C abre e fecha o chat (fora de campos de texto).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyC" || typing(e) || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      e.preventDefault();
      toggleChat();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <ChatBalloons />
      <ChatPanel />
    </>
  );
}

registerActivity({
  name: "chat",
  kinds: [CHAT_KIND],
  onEvent: onChatEvent,
  Overlay: ChatOverlay,
  Scene: ChatBalloonProjector,
});

// Na busca (Ctrl+K): "Mensagem para Fulano" ao lado de ir até, chamar e seguir.
registerPersonCommand({
  key: "mensagem",
  label: (name) => `Mensagem para ${name}`,
  run: (id) => {
    const name = useApp.getState().players[id]?.name;
    if (name) openConv(name, name);
  },
});

// ---- sons de reserva (enquanto os arquivos do sounds.json não existem) ------------------------

function note(c: AudioContext, out: AudioNode, freq: number, at: number, dur: number, gain: number): void {
  const t = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** Conversa direta: dois toques suaves e baixos. */
registerSynth("chat-dm", (c, out) => {
  note(c, out, 660, 0, 0.16, 0.22);
  note(c, out, 880, 0.09, 0.22, 0.18);
});

/** Menção: três notas claras, ainda discretas. */
registerSynth("chat-mention", (c, out) => {
  note(c, out, 784, 0, 0.18, 0.2);
  note(c, out, 988, 0.08, 0.18, 0.18);
  note(c, out, 1319, 0.16, 0.3, 0.16);
});
