import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { clsx } from "clsx";
import { Mic, MicOff, PictureInPicture2, Video, VideoOff, X } from "lucide-react";
import { setCam, setMic, useMedia } from "../media/rtc.ts";
import { useApp } from "../state/store.ts";
import { borrowVideo, canPip, closePip, openPip, returnVideo, usePip } from "./pip.ts";
import { T } from "./strings.ts";

/** Conteúdo da janela flutuante, desenhado dentro dela (portal para o outro documento). */
export function PipLayer() {
  const root = usePip((s) => s.root);
  return root ? createPortal(<PipContent />, root) : null;
}

interface TileInfo {
  id: string;
  el: HTMLVideoElement;
  label: string;
  speaking: boolean;
  self: boolean;
}

function PipContent() {
  const videos = useMedia((s) => s.videos);
  const screens = useMedia((s) => s.screens);
  const speaking = useMedia((s) => s.speaking);
  const mic = useMedia((s) => s.mic);
  const cam = useMedia((s) => s.cam);
  const ready = useMedia((s) => s.status === "on");
  const players = useApp((s) => s.players);
  const me = useApp((s) => s.selfId);
  const size = useWindowSize(usePip((s) => s.win));
  const nameOf = (id: string) => players[id]?.name ?? "Alguém";

  const screenIds = Object.keys(screens).filter((id) => id !== me);
  const people: TileInfo[] = Object.entries(videos)
    .map(([id, el]) => ({ id, el, label: id === me ? T.pip.you : nameOf(id), speaking: !!speaking[id], self: id === me }))
    // Quem fala primeiro, depois por nome; você por último.
    .sort((a, b) => Number(a.self) - Number(b.self) || Number(b.speaking) - Number(a.speaking) || a.label.localeCompare(b.label, "pt-BR"));
  const talkingNoVideo = Object.keys(speaking)
    .filter((id) => !videos[id])
    .map((id) => (id === me ? T.pip.you : nameOf(id)));

  // A tela compartilhada em cima (a primeira), as pessoas embaixo; tudo cabe na altura da janela.
  const screenId = screenIds[0];
  const shown = people.slice(0, screenId ? 3 : 6);
  const hidden = people.length - shown.length;
  const cols = screenId ? Math.max(1, shown.length) : bestColumns(shown.length, size.w - 16, size.h - 70);
  const rows = screenId ? 1 : Math.ceil(shown.length / cols);

  return (
    <div className="flex h-full flex-col gap-2 bg-deep p-2 text-offwhite">
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        {screenId && (
          <div className="min-h-0 flex-[3]">
            <Tile key={`s-${screenId}`} info={{ id: screenId, el: screens[screenId]!, label: T.pip.screenOf(nameOf(screenId)), speaking: false, self: false }} contain />
          </div>
        )}
        {shown.length > 0 && (
          <div
            className={clsx("grid min-h-0 gap-2", screenId ? "flex-[2]" : "flex-1")}
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}
          >
            {shown.map((p) => (
              <Tile key={p.id} info={p} mirror={p.self} />
            ))}
          </div>
        )}
        {!shown.length && !screenId && <p className="grid flex-1 place-items-center px-6 text-center text-sm text-slate">{T.pip.nobody}</p>}
      </div>
      {(talkingNoVideo.length > 0 || hidden > 0) && (
        <p className="flex gap-2 truncate px-1 text-[11px]">
          {talkingNoVideo.length > 0 && <span className="truncate text-ok">{T.pip.talking(talkingNoVideo.join(", "))}</span>}
          {hidden > 0 && <span className="ml-auto shrink-0 text-slate">{T.pip.more(hidden)}</span>}
        </p>
      )}
      <div className="flex items-center justify-center gap-1.5">
        <button
          type="button"
          disabled={!ready}
          onClick={() => void setMic(!mic)}
          aria-pressed={mic}
          aria-label={mic ? T.pip.micOff : T.pip.micOn}
          title={mic ? T.pip.micOff : T.pip.micOn}
          className={clsx("grid size-9 place-items-center rounded-xl transition-colors disabled:opacity-40", mic ? "bg-ok/20 text-ok hover:bg-ok/30" : "bg-danger/15 text-danger hover:bg-danger/25")}
        >
          {mic ? <Mic className="size-4" /> : <MicOff className="size-4" />}
        </button>
        <button
          type="button"
          disabled={!ready}
          onClick={() => void setCam(!cam)}
          aria-pressed={cam}
          aria-label={cam ? T.pip.camOff : T.pip.camOn}
          title={cam ? T.pip.camOff : T.pip.camOn}
          className={clsx("grid size-9 place-items-center rounded-xl transition-colors disabled:opacity-40", cam ? "bg-offwhite/12 text-offwhite" : "text-offwhite/70 hover:bg-offwhite/8")}
        >
          {cam ? <Video className="size-4" /> : <VideoOff className="size-4" />}
        </button>
        <button type="button" onClick={closePip} aria-label={T.pip.close} title={T.pip.close} className="grid size-9 place-items-center rounded-xl text-slate transition-colors hover:bg-offwhite/8 hover:text-offwhite">
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * Um vídeo da chamada dentro da janela. O próprio elemento vai para cá (e volta para onde estava
 * ao fechar), para a transmissão continuar ativa com a aba em segundo plano. Se alguém o pegar
 * de volta enquanto isso (a bolha do avatar remontou), mostra uma cópia.
 */
function Tile({ info, mirror, contain }: { info: TileInfo; mirror?: boolean; contain?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [lost, setLost] = useState(false);
  const { el } = info;

  useEffect(() => {
    const h = host.current;
    if (!h) return;
    borrowVideo(el, h, `position:absolute;inset:0;width:100%;height:100%;object-fit:${contain ? "contain" : "cover"};${mirror ? "transform:scaleX(-1);" : ""}`);
    setLost(false);
    const check = window.setInterval(() => setLost(el.parentNode !== h), 1000);
    return () => {
      window.clearInterval(check);
      returnVideo(el);
    };
  }, [el, mirror, contain]);

  return (
    <div
      className="relative h-full min-h-0 overflow-hidden rounded-xl bg-card"
      style={info.speaking ? { boxShadow: "0 0 0 2px #2BC48A, 0 0 12px 1px rgb(43 196 138 / 0.5)" } : undefined}
    >
      <div ref={host} className="absolute inset-0" />
      {lost && <MirrorVideo source={el} mirror={mirror} contain={contain} />}
      <span className="absolute bottom-1 left-1 max-w-[calc(100%-8px)] truncate rounded-md bg-space/80 px-1.5 py-0.5 text-[11px] font-medium">
        {info.label}
        {info.speaking && <span className="ml-1 text-ok">· {T.pip.speaking}</span>}
      </span>
    </div>
  );
}

function MirrorVideo({ source, mirror, contain }: { source: HTMLVideoElement; mirror?: boolean; contain?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.srcObject = source.srcObject;
    void v.play().catch(() => undefined);
  }, [source]);
  return <video ref={ref} muted playsInline autoPlay className={clsx("absolute inset-0 size-full", contain ? "object-contain" : "object-cover", mirror && "-scale-x-100")} />;
}

/** Botão da doca: aparece quando há vídeo ou tela de alguém chegando. */
export function PipButton({ className, activeClassName }: { className: string; activeClassName: string }) {
  const content = usePip((s) => s.content);
  const open = usePip((s) => !!s.win);
  const [videoPipOn, setVideoPipOn] = useState(false);
  useEffect(() => {
    const on = () => setVideoPipOn(!!document.pictureInPictureElement);
    document.addEventListener("enterpictureinpicture", on, true);
    document.addEventListener("leavepictureinpicture", on, true);
    return () => {
      document.removeEventListener("enterpictureinpicture", on, true);
      document.removeEventListener("leavepictureinpicture", on, true);
    };
  }, []);
  const active = open || videoPipOn;
  if (!canPip() || (!content && !active)) return null;
  const label = active ? T.pip.close : T.pip.open;
  return (
    <button type="button" onClick={() => (active ? closePip() : void openPip())} aria-label={label} title={label} aria-pressed={active} className={active ? activeClassName : className}>
      <PictureInPicture2 className="size-[18px]" />
    </button>
  );
}

/** Tamanho da janela flutuante (acompanha quando a pessoa redimensiona). */
function useWindowSize(win: Window | null): { w: number; h: number } {
  const [size, setSize] = useState({ w: 380, h: 460 });
  useEffect(() => {
    if (!win) return;
    const read = () => setSize({ w: win.innerWidth, h: win.innerHeight });
    read();
    win.addEventListener("resize", read);
    return () => win.removeEventListener("resize", read);
  }, [win]);
  return size;
}

/** Colunas que deixam cada vídeo mais perto de 4:3 na área disponível (até 3). */
function bestColumns(n: number, w: number, h: number): number {
  if (n <= 1) return 1;
  let best = 1;
  let bestScore = Infinity;
  for (let c = 1; c <= Math.min(3, n); c++) {
    const r = Math.ceil(n / c);
    const score = Math.abs(Math.log(w / c / (h / r) / (4 / 3)));
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}
