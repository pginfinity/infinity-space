import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { clsx } from "clsx";
import { Ban, Bot, Camera, CircleHelp, Gauge, Headphones, ImagePlus, Keyboard, Mic, Volume2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { setQuality, useQuality, type Quality } from "../scene/quality.ts";
import { applyCamBackground, audioContext } from "../media/rtc.ts";
import { createNoiseNode, type NoiseNode } from "../media/noise.ts";
import { setMediaSettings, useMediaSettings, VIDEO_RES, type CamBackground, type NoiseMode, type VideoQuality } from "../media/settings.ts";
import { applyBackground, backgroundSupported, clearCustomBackground, customBackground, saveCustomBackground } from "../media/background.ts";
import { createLocalVideoTrack, type LocalVideoTrack } from "livekit-client";
import { sfx } from "../audio/sfx.ts";
import { PresenceSettings } from "../presence/PresenceSettings.tsx";
import { openShortcuts, startTour } from "../onboarding/index.ts";

/**
 * Áudio e vídeo de cada pessoa: dispositivos, supressão de ruído, teste do microfone com o filtro
 * aplicado ("é isso que os outros ouvem"), alto-falante e câmera. Tudo vale na hora, sem sair da chamada.
 */
export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const s = useMediaSettings();
  const devices = useDevices();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.aside
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="pointer-events-auto absolute right-3 top-16 bottom-24 z-30 flex w-[min(400px,calc(100vw-24px))] flex-col overflow-hidden rounded-[var(--radius-panel)] border border-offwhite/10 bg-space shadow-2xl"
      aria-label="Áudio e vídeo"
      role="dialog"
    >
      <header className="flex items-center justify-between border-b border-offwhite/8 px-5 py-4">
        <div>
          <h2 className="font-display text-sm font-medium uppercase tracking-[0.1em]">Áudio e vídeo</h2>
          <p className="mt-0.5 text-xs text-slate">Vale na hora e fica salvo neste navegador.</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate hover:bg-offwhite/8 hover:text-offwhite" aria-label="Fechar (Esc)">
          <X className="size-4" />
        </button>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
        <Section icon={<Mic className="size-4" />} title="Microfone">
          <DeviceSelect label="Microfone" value={s.micId} options={devices.audioinput} onChange={(micId) => setMediaSettings({ micId })} />
          <MicTest />
          <div>
            <p className="mb-2 text-xs font-medium text-offwhite/85">Supressão de ruído</p>
            <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Supressão de ruído">
              {NOISE_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={s.noise === o.id}
                  onClick={() => setMediaSettings({ noise: o.id })}
                  className={clsx(
                    "rounded-xl border px-3 py-2 text-left transition-colors",
                    s.noise === o.id ? "border-signal bg-signal/10" : "border-offwhite/10 hover:border-offwhite/25",
                  )}
                >
                  <span className="block text-sm font-medium">{o.title}</span>
                  <span className="block text-[11px] leading-snug text-slate">{o.hint}</span>
                </button>
              ))}
            </div>
          </div>
          <Toggle
            label="Aperte para falar"
            hint="Segure M (ou o botão do microfone) para falar; soltou, silencia."
            checked={s.micMode === "ptt"}
            onChange={(on) => setMediaSettings({ micMode: on ? "ptt" : "open" })}
          />
          <Toggle label="Cancelamento de eco" hint="Evita que sua voz volte pelo alto-falante dos outros." checked={s.echo} onChange={(echo) => setMediaSettings({ echo })} />
          <Toggle label="Ganho automático" hint="Equilibra o volume quando você se afasta do microfone." checked={s.autoGain} onChange={(autoGain) => setMediaSettings({ autoGain })} />
        </Section>

        <Section icon={<Headphones className="size-4" />} title="Saída de som">
          {devices.canPickSpeaker ? (
            <DeviceSelect label="Alto-falante" value={s.speakerId} options={devices.audiooutput} onChange={(speakerId) => setMediaSettings({ speakerId })} />
          ) : (
            <p className="text-xs text-slate">Este navegador usa a saída de som padrão do sistema.</p>
          )}
          <div className="flex items-center gap-3">
            <Volume2 className="size-4 shrink-0 text-slate" />
            <label className="flex-1">
              <span className="sr-only">Volume geral das pessoas</span>
              <input type="range" min={0} max={150} step={5} value={Math.round(s.master * 100)} onChange={(e) => setMediaSettings({ master: Number(e.target.value) / 100 })} className="w-full accent-[var(--color-signal)]" />
            </label>
            <span className="w-10 text-right text-xs tabular-nums text-slate">{Math.round(s.master * 100)}%</span>
          </div>
          <button type="button" onClick={() => sfx("teste-saida", { volume: 0.6 })} className="rounded-lg border border-offwhite/10 px-3 py-1.5 text-xs hover:border-offwhite/25">
            Tocar som de teste
          </button>
          <p className="text-[11px] text-slate">O volume de cada pessoa fica no painel Pessoas.</p>
        </Section>

        <GraphicsSection />

        <Section icon={<Camera className="size-4" />} title="Câmera">
          <DeviceSelect label="Câmera" value={s.camId} options={devices.videoinput} onChange={(camId) => setMediaSettings({ camId })} />
          <BackgroundPicker />
          <div>
            <p className="mb-2 text-xs font-medium text-offwhite/85">Qualidade</p>
            <div className="flex rounded-xl bg-deep/60 p-0.5" role="radiogroup" aria-label="Qualidade da câmera">
              {VIDEO_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={s.video === o.id}
                  onClick={() => setMediaSettings({ video: o.id })}
                  className={clsx("flex-1 rounded-[10px] px-2 py-1.5 text-xs transition-colors", s.video === o.id ? "bg-offwhite/12 text-offwhite" : "text-slate hover:text-offwhite")}
                >
                  {o.title}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-slate">A Econômica ajuda em internet ou computador mais fracos.</p>
          </div>
        </Section>

        <PresenceSettings />
        <HelpSection onClose={onClose} />
      </div>
    </motion.aside>
  );
}

const NOISE_OPTIONS: { id: NoiseMode; title: string; hint: string }[] = [
  { id: "off", title: "Desligada", hint: "Som cru. Para microfone de estúdio." },
  { id: "browser", title: "Navegador", hint: "Filtro padrão do Chrome." },
  { id: "strong", title: "Forte", hint: "Corta teclado, ventilador e ruído de fundo." },
  { id: "max", title: "Máxima", hint: "IA que limpa até vozes ao fundo. Usa mais CPU." },
];

const BG_OPTIONS: { id: CamBackground; title: string }[] = [
  { id: "none", title: "Nenhum" },
  { id: "blur-light", title: "Desfoque leve" },
  { id: "blur", title: "Desfoque forte" },
  { id: "escritorio", title: "Escritório" },
  { id: "estante", title: "Estante" },
  { id: "sala", title: "Sala aconchegante" },
  { id: "natureza", title: "Natureza" },
  { id: "espaco", title: "Espaço" },
  { id: "gradiente", title: "Gradiente da marca" },
  { id: "azul", title: "Azul" },
  { id: "infinity", title: "Infinity" },
  { id: "custom", title: "Sua imagem" },
];

/** Miniatura de cada fundo (o desfoque é mostrado sobre a sala). */
function bgThumb(id: CamBackground, custom: string | null): { src: string | null; blur?: number } {
  if (id === "none") return { src: null };
  if (id === "custom") return { src: custom };
  if (id === "blur-light") return { src: "/fundos/mini/sala.jpg", blur: 1.5 };
  if (id === "blur") return { src: "/fundos/mini/sala.jpg", blur: 4 };
  return { src: `/fundos/mini/${id}.jpg` };
}

/** Escolha do fundo da câmera em miniaturas, com a prévia ao vivo logo abaixo. A imagem própria fica só neste navegador. */
function BackgroundPicker() {
  const s = useMediaSettings();
  const [custom, setCustom] = useState(customBackground);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const supported = backgroundSupported();

  const pick = (id: CamBackground) => {
    if (id === "custom" && !custom) return file.current?.click();
    setMediaSettings({ camBg: id });
  };
  const upload = async (f: File | undefined) => {
    if (!f) return;
    try {
      setCustom(await saveCustomBackground(f));
      setError(null);
      if (useMediaSettings.getState().camBg === "custom") await applyCamBackground();
      else setMediaSettings({ camBg: "custom" });
    } catch {
      setError("Não deu para usar essa imagem. Tente outra, em JPG ou PNG.");
    }
  };
  const remove = () => {
    clearCustomBackground();
    setCustom(null);
    if (s.camBg === "custom") setMediaSettings({ camBg: "none" });
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-offwhite/85">Fundo</p>
      <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Fundo da câmera">
        {BG_OPTIONS.map((o) => {
          const t = bgThumb(o.id, custom);
          const on = s.camBg === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={o.title}
              title={o.title}
              disabled={o.id !== "none" && !supported}
              onClick={() => pick(o.id)}
              className={clsx(
                "relative aspect-video overflow-hidden rounded-lg bg-deep transition disabled:opacity-40",
                on ? "ring-2 ring-signal" : "ring-1 ring-offwhite/10 hover:ring-offwhite/30",
              )}
            >
              {t.src && <img src={t.src} alt="" className="size-full scale-110 object-cover" style={t.blur ? { filter: `blur(${t.blur}px)` } : undefined} />}
              {!t.src && (
                <span className="absolute inset-0 grid place-items-center pb-3 text-slate">
                  {o.id === "none" ? <Ban className="size-4" /> : <ImagePlus className="size-4" />}
                </span>
              )}
              <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-deep/90 to-transparent px-1.5 pb-0.5 pt-3 text-left text-[10px] text-offwhite">{o.title}</span>
            </button>
          );
        })}
      </div>
      <input
        ref={file}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label="Enviar sua imagem de fundo"
        onChange={(e) => {
          const input = e.currentTarget;
          void upload(input.files?.[0]).finally(() => (input.value = ""));
        }}
      />
      {supported && (
        <div className="flex items-center gap-3 text-[11px] text-slate">
          <button type="button" onClick={() => file.current?.click()} className="underline-offset-2 hover:text-offwhite hover:underline">
            {custom ? "Trocar sua imagem" : "Enviar sua imagem"}
          </button>
          {custom && (
            <button type="button" onClick={remove} className="underline-offset-2 hover:text-offwhite hover:underline">
              Remover
            </button>
          )}
          <span className="ml-auto">Fica só neste navegador.</span>
        </div>
      )}
      {error && <p className="text-[11px] text-danger">{error}</p>}
      {!supported && <p className="text-[11px] text-slate">Este navegador não aplica fundo na câmera.</p>}
      <CamTest camId={s.camId} quality={s.video} bg={s.camBg} custom={custom} />
    </div>
  );
}

const VIDEO_OPTIONS: { id: VideoQuality; title: string }[] = [
  { id: "low", title: `Econômica · ${VIDEO_RES.low.height}p` },
  { id: "standard", title: `Padrão · ${VIDEO_RES.standard.height}p` },
  { id: "high", title: `Alta · ${VIDEO_RES.high.height}p` },
];

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function DeviceSelect({ label, value, options, onChange }: { label: string; value: string | null; options: MediaDeviceInfo[]; onChange: (id: string | null) => void }) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full rounded-xl border border-offwhite/10 bg-deep px-3 py-2 text-sm text-offwhite focus:border-signal focus:outline-none"
      >
        <option value="">Padrão do sistema</option>
        {options
          .filter((d) => d.deviceId && d.deviceId !== "default")
          .map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `${label} ${i + 1}`}
            </option>
          ))}
      </select>
    </label>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="block text-sm">{label}</span>
        <span className="block text-[11px] text-slate">{hint}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={clsx("relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors", checked ? "bg-signal" : "bg-offwhite/15")}
      >
        <span className={clsx("absolute top-0.5 size-4 rounded-full bg-offwhite transition-transform", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
      </button>
    </label>
  );
}

/** Dispositivos disponíveis (com nomes depois que o navegador libera o acesso). */
function useDevices() {
  const [list, setList] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    const md = navigator.mediaDevices;
    if (!md?.enumerateDevices) return;
    const read = () => void md.enumerateDevices().then(setList).catch(() => undefined);
    read();
    md.addEventListener("devicechange", read);
    // Depois que o teste do microfone pede acesso, os nomes aparecem.
    const t = window.setTimeout(read, 1500);
    return () => {
      md.removeEventListener("devicechange", read);
      window.clearTimeout(t);
    };
  }, []);
  return {
    audioinput: list.filter((d) => d.kind === "audioinput"),
    audiooutput: list.filter((d) => d.kind === "audiooutput"),
    videoinput: list.filter((d) => d.kind === "videoinput"),
    canPickSpeaker: typeof (AudioContext.prototype as AudioContext & { setSinkId?: unknown }).setSinkId === "function",
  };
}

/**
 * Teste do microfone com as mesmas opções e o mesmo filtro da chamada.
 * O medidor mostra o som depois do filtro: é isso que os outros ouvem.
 */
function MicTest() {
  const s = useMediaSettings();
  const bar = useRef<HTMLDivElement>(null);
  const [listen, setListen] = useState(false);
  const [state, setState] = useState<"starting" | "on" | "blocked">("starting");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let noise: NoiseNode | null = null;
    let raf = 0;
    let stopped = false;
    const ctx = audioContext();
    void ctx.resume();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    const loop = ctx.createGain();
    loop.gain.value = listen ? 1 : 0;
    const data = new Float32Array(analyser.fftSize);
    let source: MediaStreamAudioSourceNode | null = null;

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: s.micId ? { exact: s.micId } : undefined, echoCancellation: s.echo, autoGainControl: s.autoGain, noiseSuppression: s.noise === "browser", channelCount: 1 },
        });
        if (stopped) return;
        source = ctx.createMediaStreamSource(stream);
        let tail: AudioNode = source;
        if (s.noise === "strong" || s.noise === "max") {
          noise = await createNoiseNode(ctx, s.noise);
          if (stopped) return;
          tail = tail.connect(noise.node);
        }
        tail.connect(analyser);
        tail.connect(loop).connect(ctx.destination);
        setState("on");
        const draw = () => {
          analyser.getFloatTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) sum += data[i]! * data[i]!;
          const rms = Math.sqrt(sum / data.length);
          const level = Math.min(1, Math.max(0, (20 * Math.log10(rms + 1e-8) + 60) / 50));
          if (bar.current) bar.current.style.transform = `scaleX(${level})`;
          raf = requestAnimationFrame(draw);
        };
        draw();
      } catch {
        if (!stopped) setState("blocked");
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      source?.disconnect();
      noise?.destroy();
      analyser.disconnect();
      loop.disconnect();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [s.micId, s.echo, s.autoGain, s.noise, listen]);

  return (
    <div className="rounded-xl border border-offwhite/8 bg-deep/60 p-3">
      <div className="flex items-center justify-between text-[11px] text-slate">
        <span>{state === "blocked" ? "O navegador bloqueou o microfone." : "Fale algo: é isso que os outros ouvem"}</span>
        <button type="button" onClick={() => setListen((v) => !v)} aria-pressed={listen} className={clsx("rounded-md px-2 py-0.5 transition-colors", listen ? "bg-signal/20 text-signal" : "hover:text-offwhite")}>
          {listen ? "Parar de ouvir" : "Ouvir (use fone)"}
        </button>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-offwhite/8">
        <div ref={bar} className="h-full origin-left rounded-full bg-ok transition-transform duration-75" style={{ transform: "scaleX(0)" }} />
      </div>
    </div>
  );
}

/** Prévia da câmera só quando a pessoa pede (a luz da câmera não acende de surpresa), já com o fundo escolhido. */
function CamTest({ camId, quality, bg, custom }: { camId: string | null; quality: VideoQuality; bg: CamBackground; custom: string | null }) {
  const [on, setOn] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const [blocked, setBlocked] = useState(false);
  const [track, setTrack] = useState<LocalVideoTrack | null>(null);

  useEffect(() => {
    if (!on) return;
    let made: LocalVideoTrack | null = null;
    let stopped = false;
    const r = VIDEO_RES[quality];
    void createLocalVideoTrack({ deviceId: camId ?? undefined, resolution: { width: r.width, height: r.height, frameRate: r.frameRate } })
      .then((t) => {
        if (stopped) return t.stop();
        made = t;
        setBlocked(false);
        setTrack(t);
        if (video.current) t.attach(video.current);
      })
      .catch(() => setBlocked(true));
    return () => {
      stopped = true;
      made?.stop();
      setTrack(null);
    };
  }, [on, camId, quality]);

  // Trocar o fundo não reabre a câmera: a prévia muda na hora (custom entra para reaplicar a imagem nova).
  useEffect(() => {
    if (track) void applyBackground(track, bg);
  }, [track, bg, custom]);

  if (!on) {
    return (
      <button type="button" onClick={() => setOn(true)} className="rounded-lg border border-offwhite/10 px-3 py-1.5 text-xs hover:border-offwhite/25">
        Testar câmera
      </button>
    );
  }
  return (
    <div className="space-y-2">
      <div className="relative aspect-video overflow-hidden rounded-xl bg-deep">
        <video ref={video} muted playsInline autoPlay className="size-full -scale-x-100 object-cover" />
        {blocked && <p className="absolute inset-0 grid place-items-center p-4 text-center text-xs text-slate">O navegador bloqueou a câmera.</p>}
      </div>
      <button type="button" onClick={() => setOn(false)} className="rounded-lg border border-offwhite/10 px-3 py-1.5 text-xs hover:border-offwhite/25">
        Parar teste
      </button>
    </div>
  );
}

const QUALITY_OPTIONS: { id: Quality; title: string; hint: string }[] = [
  { id: "auto", title: "Automática", hint: "Efeitos completos; baixa a resolução se pesar" },
  { id: "leve", title: "Leve", hint: "Sem sombras nem efeitos. Para PC mais fraco" },
  { id: "alta", title: "Alta", hint: "Sombras mais nítidas e resolução cheia" },
];

/** Ajuda: rever os primeiros passos com o Orbi e a lista de atalhos. */
function HelpSection({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const go = (fn: () => void) => () => {
    onClose();
    fn();
  };
  return (
    <Section icon={<CircleHelp className="size-4" />} title="Ajuda">
      <div className="grid grid-cols-2 gap-1.5">
        <button type="button" onClick={go(startTour)} className="flex items-center gap-2 rounded-xl border border-offwhite/10 px-3 py-2.5 text-left text-sm transition-colors hover:border-offwhite/25">
          <Bot className="size-4 shrink-0 text-slate" />
          {t("tour.replay")}
        </button>
        <button type="button" onClick={go(openShortcuts)} className="flex items-center gap-2 rounded-xl border border-offwhite/10 px-3 py-2.5 text-left text-sm transition-colors hover:border-offwhite/25">
          <Keyboard className="size-4 shrink-0 text-slate" />
          {t("shortcuts.title")}
        </button>
      </div>
    </Section>
  );
}

/** Qualidade do 3D (o 2D já é leve). */
function GraphicsSection() {
  const mode = useQuality((s) => s.mode);
  return (
    <Section icon={<Gauge className="size-4" />} title="Gráficos">
      <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Qualidade dos gráficos">
        {QUALITY_OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={mode === o.id}
            onClick={() => setQuality(o.id)}
            className={clsx("rounded-xl border px-2.5 py-2 text-left transition-colors", mode === o.id ? "border-signal bg-signal/10" : "border-offwhite/10 hover:border-offwhite/25")}
          >
            <span className="block text-sm font-medium">{o.title}</span>
            <span className="block text-[11px] leading-snug text-slate">{o.hint}</span>
          </button>
        ))}
      </div>
    </Section>
  );
}
