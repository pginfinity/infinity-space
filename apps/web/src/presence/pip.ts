import { create } from "zustand";
import { useMedia } from "../media/rtc.ts";
import { useApp } from "../state/store.ts";
import { toast } from "../ui/toasts.ts";
import { watchActivity } from "./status.ts";
import { T } from "./strings.ts";

/**
 * Janela flutuante (Picture-in-Picture) com os vídeos de quem está perto e de quem fala.
 *
 * - Chrome (Document Picture-in-Picture): uma janelinha com a grade de vídeos e os botões de
 *   microfone e câmera. Os próprios elementos de vídeo da chamada vão para lá enquanto ela está
 *   aberta (e voltam ao fechar): assim o LiveKit sabe que o vídeo continua visível e não pausa a
 *   transmissão quando a aba vai para segundo plano.
 * - Outros navegadores: PiP de vídeo comum, de preferência a tela compartilhada.
 * - Automático quando o navegador permite (media session "enterpictureinpicture").
 * A lógica de mídia não muda: aqui só se lê `useMedia`.
 */

interface DocPip {
  requestWindow(opts?: { width?: number; height?: number }): Promise<Window>;
  readonly window: Window | null;
}

interface PipState {
  /** Janela flutuante aberta (Document PiP) e o nó onde o React desenha. */
  win: Window | null;
  root: HTMLElement | null;
  /** Há vídeo ou tela de outra pessoa chegando (vale a pena oferecer a janela). */
  content: boolean;
}

export const usePip = create<PipState>(() => ({ win: null, root: null, content: false }));

function docPip(): DocPip | null {
  return (window as unknown as { documentPictureInPicture?: DocPip }).documentPictureInPicture ?? null;
}

export function canPip(): boolean {
  return !!docPip() || (typeof document !== "undefined" && document.pictureInPictureEnabled === true);
}

/** Abre a janela flutuante (precisa vir de um gesto da pessoa, ou do pedido automático do navegador). */
export async function openPip(): Promise<void> {
  const dp = docPip();
  if (dp) {
    if (usePip.getState().win) return;
    try {
      const win = await dp.requestWindow({ width: 380, height: 460 });
      prepare(win);
      return;
    } catch {
      // Sem gesto ou bloqueado: tenta o PiP de vídeo comum.
    }
  }
  await videoPip();
}

export function closePip(): void {
  const win = usePip.getState().win;
  if (win) win.close();
  else if (document.pictureInPictureElement) void document.exitPictureInPicture().catch(() => undefined);
}

export function pipOpen(): boolean {
  return !!usePip.getState().win || !!document.pictureInPictureElement;
}

function prepare(win: Window): void {
  const doc = win.document;
  doc.title = T.pip.title;
  copyStyles(doc);
  doc.documentElement.lang = "pt-BR";
  doc.body.style.cssText = "margin:0;height:100vh;overflow:hidden;background:#020B18;color:#F2F0EF;font-family:Geist,Inter,'Segoe UI',system-ui,sans-serif;-webkit-font-smoothing:antialiased";
  const root = doc.createElement("div");
  root.id = "presenca-pip";
  root.style.height = "100%";
  doc.body.append(root);
  const unwatch = watchActivity(win);
  // Fechou (botão da janela, aba fechada): devolve os vídeos à página já, antes de a janela sumir.
  win.addEventListener("pagehide", () => {
    unwatch();
    returnAllVideos();
    usePip.setState({ win: null, root: null });
  });
  usePip.setState({ win, root });
}

interface Borrowed {
  host: HTMLElement;
  parent: ParentNode | null;
  next: ChildNode | null;
  className: string;
  css: string;
}
const borrowed = new Map<HTMLVideoElement, Borrowed>();

/** Leva um vídeo da chamada para dentro da janela flutuante (guardando de onde veio). */
export function borrowVideo(el: HTMLVideoElement, host: HTMLElement, css: string): void {
  if (!borrowed.has(el)) borrowed.set(el, { host, parent: el.parentNode, next: el.nextSibling, className: el.className, css: el.style.cssText });
  else borrowed.get(el)!.host = host;
  el.className = "";
  el.style.cssText = css;
  host.appendChild(el);
  void el.play().catch(() => undefined);
}

/** Devolve o vídeo para onde estava (se a bolha do avatar ainda existir). */
export function returnVideo(el: HTMLVideoElement): void {
  const b = borrowed.get(el);
  if (!b) return;
  borrowed.delete(el);
  // Alguém já o pegou de volta (a bolha remontou): não mexe.
  if (el.parentNode !== b.host) return;
  el.className = b.className;
  el.style.cssText = b.css;
  const parent = b.parent;
  if (parent && parent.isConnected) parent.insertBefore(el, b.next && b.next.parentNode === parent ? b.next : null);
  else el.remove();
  void el.play().catch(() => undefined);
}

function returnAllVideos(): void {
  for (const el of [...borrowed.keys()]) returnVideo(el);
}

/** Copia as folhas de estilo da página (Tailwind, fontes) para a janela flutuante. */
function copyStyles(doc: Document): void {
  const base = doc.createElement("base");
  base.href = location.origin + "/";
  doc.head.append(base);
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const style = doc.createElement("style");
      style.textContent = Array.from(sheet.cssRules)
        .map((r) => r.cssText)
        .join("\n");
      doc.head.append(style);
    } catch {
      if (!sheet.href) continue;
      const link = doc.createElement("link");
      link.rel = "stylesheet";
      link.href = sheet.href;
      doc.head.append(link);
    }
  }
}

/** PiP de vídeo comum: a tela compartilhada, ou o vídeo de quem fala, ou de quem está perto. */
async function videoPip(): Promise<void> {
  if (!document.pictureInPictureEnabled) return;
  const { screens, videos, speaking } = useMedia.getState();
  const me = useApp.getState().selfId;
  const remote = (m: Record<string, HTMLVideoElement>) => Object.entries(m).filter(([id]) => id !== me);
  const pick = remote(screens)[0]?.[1] ?? remote(videos).find(([id]) => speaking[id])?.[1] ?? remote(videos)[0]?.[1];
  if (!pick) return;
  try {
    await pick.requestPictureInPicture();
  } catch {
    toast(T.pip.failed);
  }
}

/** Liga a oferta da janela: botão (via `content`), pedido automático do navegador e a dica ao voltar. */
export function startPip(): void {
  let hiddenAt = 0;
  let tipShown = false;
  const update = () => {
    const m = useMedia.getState();
    const me = useApp.getState().selfId;
    const content = Object.keys(m.videos).some((id) => id !== me) || Object.keys(m.screens).some((id) => id !== me);
    if (content !== usePip.getState().content) usePip.setState({ content });
    // Chrome abre sozinho ao trocar de aba quando a página está numa chamada e a pessoa permitiu.
    const ms = (navigator as Navigator & { mediaSession?: MediaSession }).mediaSession;
    if (ms && docPip()) {
      try {
        ms.setActionHandler("enterpictureinpicture" as MediaSessionAction, content ? () => void openPip() : null);
      } catch {
        /* navegador sem essa ação */
      }
    }
  };
  useMedia.subscribe(update);
  useApp.subscribe((s, prev) => s.selfId !== prev.selfId && update());
  update();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      hiddenAt = usePip.getState().content && !pipOpen() ? performance.now() : 0;
      return;
    }
    // Voltou depois de um tempo fora, com vídeo rolando e sem a janela: conta que ela existe (uma vez).
    if (hiddenAt && !tipShown && canPip() && performance.now() - hiddenAt > 3000) {
      tipShown = true;
      toast(T.pip.tip, 7000);
    }
    hiddenAt = 0;
  });
}
