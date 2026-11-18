/**
 * Player da TV do lounge. Duas versões com a mesma interface:
 * - YouTube IFrame Player API, servido por youtube-nocookie.com (sem cookies de rastreio até dar play);
 * - player falso, para os testes automatizados (navigator.webdriver ou `?tv=falsa` em desenvolvimento):
 *   conta o tempo sozinho e mostra o id do vídeo, sem depender do YouTube de verdade.
 *
 * Um iframe não vira textura do WebGL: o vídeo aparece num painel do HUD; a TV do mundo mostra
 * "Assistindo junto" e o título (ver tv.tsx).
 */

export interface TvPlayerState {
  video: string | null;
  /** Tocando (ou carregando para tocar). */
  playing: boolean;
  /** Posição (s). */
  time: number;
  ready: boolean;
}

export interface TvPlayer {
  /** Carrega um vídeo em `at` segundos; toca se `play`. Vídeo "" descarrega. */
  load(video: string, at: number, play: boolean): void;
  play(): void;
  pause(): void;
  seek(s: number): void;
  state(): TvPlayerState;
  /** Título e duração, quando o player já sabe. */
  meta(): { title: string; len: number } | null;
  /** 0 a 1. */
  setVolume(v: number): void;
  volume(): number;
  /** O navegador barrou o play automático: precisa de um clique na página. */
  blocked(): boolean;
  /** O vídeo atual não pode passar aqui (dono não deixa incorporar, privado, removido). */
  failed(): boolean;
  onEnded(fn: (video: string) => void): void;
  destroy(): void;
}

/** Player falso nos testes automatizados (ou com ?tv=falsa em desenvolvimento). */
export function fakePlayerOn(): boolean {
  if (!import.meta.env.DEV || typeof navigator === "undefined") return false;
  return navigator.webdriver || new URLSearchParams(location.search).get("tv") === "falsa";
}

export function createTvPlayer(host: HTMLElement): TvPlayer {
  return fakePlayerOn() ? new FakePlayer(host) : new YouTubePlayer(host);
}

// ---- YouTube --------------------------------------------------------------------------------

interface YTPlayer {
  loadVideoById(o: { videoId: string; startSeconds?: number }): void;
  cueVideoById(o: { videoId: string; startSeconds?: number }): void;
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  seekTo(s: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  getVideoData?(): { title?: string; video_id?: string };
  setVolume(v: number): void;
  unMute(): void;
  destroy(): void;
}
interface YTNamespace {
  Player: new (el: HTMLElement, opts: unknown) => YTPlayer;
}
type YTWindow = Window & { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void };

let apiReady: Promise<YTNamespace> | null = null;

/** Carrega a IFrame Player API uma vez, só quando alguém precisa da TV. */
function loadApi(): Promise<YTNamespace> {
  if (apiReady) return apiReady;
  apiReady = new Promise((resolve, reject) => {
    const w = window as YTWindow;
    if (w.YT?.Player) return resolve(w.YT);
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (w.YT) resolve(w.YT);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    s.onerror = () => {
      apiReady = null;
      reject(new Error("YouTube indisponível"));
    };
    document.head.appendChild(s);
  });
  return apiReady;
}

const ENDED = 0;
const PLAYING = 1;
const BUFFERING = 3;

class YouTubePlayer implements TvPlayer {
  private p: YTPlayer | null = null;
  private ready = false;
  private video: string | null = null;
  private want: { video: string; at: number; play: boolean } | null = null;
  private vol = 0.35;
  private ended: ((v: string) => void) | null = null;
  private dead = false;
  private wantPlay = false;
  private playAskedAt = 0;
  private failedVideo: string | null = null;
  /** Caixa própria dentro do contêiner do React; o YouTube troca o `mount` pelo iframe lá dentro. */
  private readonly box: HTMLDivElement;
  private readonly mount: HTMLDivElement;

  constructor(host: HTMLElement) {
    this.box = document.createElement("div");
    this.box.style.cssText = "width:100%;height:100%";
    this.mount = document.createElement("div");
    this.box.appendChild(this.mount);
    host.appendChild(this.box);
  }

  private create(video: string, at: number, play: boolean): void {
    void loadApi()
      .then((YT) => {
        if (this.dead || this.p) return;
        this.p = new YT.Player(this.mount, {
          host: "https://www.youtube-nocookie.com",
          width: "100%",
          height: "100%",
          videoId: video,
          playerVars: { autoplay: play ? 1 : 0, controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3, modestbranding: 1, playsinline: 1, rel: 0, start: Math.floor(at), origin: location.origin },
          events: {
            onReady: () => {
              this.ready = true;
              this.p?.setVolume(Math.round(this.vol * 100));
              this.p?.unMute();
              const w = this.want;
              this.want = null;
              if (w) this.load(w.video, w.at, w.play);
            },
            onStateChange: (e: { data: number }) => {
              if (e.data === ENDED && this.video) this.ended?.(this.video);
            },
            onError: () => {
              this.failedVideo = this.video;
            },
          },
        });
        this.video = video;
      })
      .catch(() => undefined);
  }

  load(video: string, at: number, play: boolean): void {
    this.wantPlay = play;
    this.playAskedAt = performance.now();
    if (!video) {
      this.video = null;
      this.want = null;
      if (this.ready) this.p?.stopVideo();
      return;
    }
    if (!this.p) {
      this.want = { video, at, play };
      this.create(video, at, play);
      return;
    }
    if (!this.ready) {
      this.want = { video, at, play };
      return;
    }
    this.video = video;
    if (play) this.p.loadVideoById({ videoId: video, startSeconds: at });
    else this.p.cueVideoById({ videoId: video, startSeconds: at });
  }

  play(): void {
    this.wantPlay = true;
    this.playAskedAt = performance.now();
    if (this.ready) this.p?.playVideo();
  }

  pause(): void {
    this.wantPlay = false;
    if (this.ready) this.p?.pauseVideo();
  }

  seek(s: number): void {
    if (this.ready) this.p?.seekTo(s, true);
  }

  state(): TvPlayerState {
    if (!this.ready || !this.p) return { video: this.want?.video ?? this.video, playing: !!this.want?.play, time: this.want?.at ?? 0, ready: false };
    const st = this.p.getPlayerState();
    return { video: this.video, playing: st === PLAYING || st === BUFFERING, time: this.p.getCurrentTime() || 0, ready: true };
  }

  meta(): { title: string; len: number } | null {
    if (!this.ready || !this.p) return null;
    const len = this.p.getDuration();
    const title = this.p.getVideoData?.().title ?? "";
    return len > 0 || title ? { title, len } : null;
  }

  setVolume(v: number): void {
    this.vol = Math.min(1, Math.max(0, v));
    if (this.ready) this.p?.setVolume(Math.round(this.vol * 100));
  }

  volume(): number {
    return this.vol;
  }

  blocked(): boolean {
    // Pediu para tocar há mais de 3 s e o player continua parado: o navegador barrou o autoplay.
    return this.ready && this.wantPlay && !this.failed() && performance.now() - this.playAskedAt > 3000 && !this.state().playing;
  }

  failed(): boolean {
    return !!this.video && this.failedVideo === this.video;
  }

  onEnded(fn: (video: string) => void): void {
    this.ended = fn;
  }

  destroy(): void {
    this.dead = true;
    try {
      this.p?.destroy();
    } catch {
      /* iframe já saiu */
    }
    this.p = null;
    this.box.remove();
  }
}

// ---- player falso (testes) -------------------------------------------------------------------

/** Duração do vídeo de teste (s). */
const FAKE_LEN = 600;

class FakePlayer implements TvPlayer {
  private video: string | null = null;
  private base = 0;
  private ref = performance.now();
  private on = false;
  private vol = 0.35;
  private ended: ((v: string) => void) | null = null;
  private readonly el: HTMLDivElement;
  private readonly timer: number;

  constructor(host: HTMLElement) {
    this.el = document.createElement("div");
    this.el.dataset.tvFake = "1";
    this.el.style.cssText =
      "width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:linear-gradient(135deg,#0A2547,#020B18);color:#F2F0EF;font:600 14px Geist,system-ui,sans-serif;text-align:center";
    host.appendChild(this.el);
    this.timer = window.setInterval(() => this.render(), 250);
    this.render();
  }

  private time(): number {
    const t = this.on ? this.base + (performance.now() - this.ref) / 1000 : this.base;
    if (this.on && t >= FAKE_LEN && this.video) {
      this.base = FAKE_LEN;
      this.on = false;
      this.ended?.(this.video);
    }
    return Math.min(t, FAKE_LEN);
  }

  private render(): void {
    const t = this.time();
    const mm = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
    this.el.innerHTML = "";
    const a = document.createElement("div");
    a.textContent = this.video ? `${this.on ? "▶" : "❚❚"} Vídeo de teste` : "Sem vídeo";
    const b = document.createElement("div");
    b.style.cssText = "font-weight:400;font-size:12px;color:#8A93A3";
    b.textContent = this.video ? `${this.video} · ${mm} · volume ${Math.round(this.vol * 100)}%` : "";
    this.el.append(a, b);
  }

  /** Testes: desloca o tempo local (simula um player atrasado ou adiantado). */
  nudge(ds: number): void {
    this.base = this.time() + ds;
    this.ref = performance.now();
  }

  load(video: string, at: number, play: boolean): void {
    this.video = video || null;
    this.base = at;
    this.ref = performance.now();
    this.on = play && !!video;
    this.render();
  }

  play(): void {
    if (this.on || !this.video) return;
    this.base = this.time();
    this.ref = performance.now();
    this.on = true;
  }

  pause(): void {
    this.base = this.time();
    this.ref = performance.now();
    this.on = false;
  }

  seek(s: number): void {
    this.base = Math.max(0, s);
    this.ref = performance.now();
  }

  state(): TvPlayerState {
    return { video: this.video, playing: this.on, time: this.time(), ready: true };
  }

  meta(): { title: string; len: number } | null {
    return this.video ? { title: `Vídeo de teste ${this.video}`, len: FAKE_LEN } : null;
  }

  setVolume(v: number): void {
    this.vol = Math.min(1, Math.max(0, v));
  }

  volume(): number {
    return this.vol;
  }

  blocked(): boolean {
    return false;
  }

  failed(): boolean {
    return false;
  }

  onEnded(fn: (video: string) => void): void {
    this.ended = fn;
  }

  destroy(): void {
    window.clearInterval(this.timer);
    this.el.remove();
  }
}
