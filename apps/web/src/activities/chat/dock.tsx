import { forwardRef } from "react";
import { MessageSquareText } from "lucide-react";
import { clsx } from "clsx";
import { toggleChat, unreadOf, useChat } from "./store.ts";
import { T } from "./strings.ts";

/**
 * Botão do chat na doca (mesmo visual dos outros botões da doca), com o número de conversas
 * diretas e menções não lidas, ou um ponto quando só há novas no Geral ou no Perto.
 */
export const ChatDockButton = forwardRef<HTMLButtonElement, { onToggle?: (open: boolean) => void }>(function ChatDockButton({ onToggle }, ref) {
  const open = useChat((s) => s.open);
  const badge = useChat((s) => unreadOf(s).badge);
  const dot = useChat((s) => unreadOf(s).dot);
  const label = T.dockLabel(badge, dot);
  return (
    <button
      ref={ref}
      type="button"
      data-chat-dock
      data-tour-target="chat"
      onClick={() => {
        toggleChat();
        onToggle?.(useChat.getState().open);
      }}
      aria-label={label}
      title={label}
      aria-pressed={open}
      className={clsx("relative grid size-10 place-items-center rounded-xl transition-colors", open ? "bg-offwhite/12 text-offwhite" : "text-offwhite/80 hover:bg-offwhite/8 hover:text-offwhite")}
    >
      <MessageSquareText className="size-[18px]" />
      {badge > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-orange px-1 text-[10px] font-bold tabular-nums leading-none text-offwhite ring-2 ring-space" aria-hidden>
          {badge > 9 ? "9+" : badge}
        </span>
      ) : dot && !open ? (
        <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-signal ring-2 ring-space" aria-hidden />
      ) : null}
    </button>
  );
});

/** O painel do chat está aberto? (para a doca esconder o minimapa e fechar os outros painéis) */
export function useChatOpen(): boolean {
  return useChat((s) => s.open);
}

export { setChatOpen } from "./store.ts";
