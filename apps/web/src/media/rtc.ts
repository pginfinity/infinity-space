import { create } from "zustand";
import {
  ConnectionState,
  RemoteAudioTrack,
  Room,
  RoomEvent,
  ScreenSharePresets,
  Track,
  VideoPresets,
  type ElementInfo,
  type LocalAudioTrack,
  type LocalVideoTrack,
  type LocalTrackPublication,
  type RemoteParticipant,
  type RemoteVideoTrack,
  type RemoteTrack,
  type RemoteTrackPublication,
} from "livekit-client";
import { dirOfYaw, hearing, type Hearing, type PrivacyRules } from "@infinity/world";
import { world } from "../world/world.ts";
import { sampleRemote, self } from "../world/registry.ts";
import { getHeading } from "../engine/movement.ts";
import { useApp } from "../state/store.ts";
import { personVolumeOf, useMediaSettings, VIDEO_RES, type MediaSettings } from "./settings.ts";
import { noiseProcessor } from "./noise.ts";
import { applyBackground } from "./background.ts";

/**
 * Áudio e vídeo por proximidade (LiveKit).
 * - Só assina a voz de quem você pode ouvir; o vídeo, só de quem está perto e nítido.
 * - Cada voz passa por volume (distância), pan estéreo (direção) e filtro "abafado" (do outro lado da sala).
 * - A privacidade é aplicada por quem fala: sua voz só é liberada para quem o servidor diz que pode ouvir.
 */

export interface MediaState {
  status: "off" | "connecting" | "on" | "error";
  mic: boolean;
  cam: boolean;
  /** Quem está falando agora (por id). */
  speaking: Record<string, true>;
  /** Vídeo de cada pessoa (inclusive você), pronto para pôr na bolha. */
  videos: Record<string, HTMLVideoElement>;
  /** Quantas pessoas te ouvem agora. */
  audience: number;
  /** O gravador de uma reunião ouve você agora (a transcrição da gravação segue a mesma regra da voz). */
  recorded: boolean;
  error: string | null;
  /** Você está compartilhando a tela. */
  screen: boolean;
  /** Telas compartilhadas que chegam até você (e a sua, como prévia), por id de quem compartilha. */
  screens: Record<string, HTMLVideoElement>;
}

export const useMedia = create<MediaState>(() => ({ status: "off", mic: false, cam: false, speaking: {}, videos: {}, audience: 0, recorded: false, error: null, screen: false, screens: {} }));

let room: Room | null = null;
let ctx: AudioContext | null = null;
let loop: number | undefined;
let audienceIds: string[] = [];
let pendingInfo: ((p: { mic?: boolean; cam?: boolean; screen?: boolean; screenPaused?: boolean }) => void) | null = null;
const screenAudio = new Map<string, HTMLMediaElement>();
let shareZone: string | null = null;
let onShareNotice: ((text: string) => void) | null = null;

/** Quem mostra avisos sobre o compartilhamento (a UI registra). */
export function onScreenNotice(fn: (text: string) => void): void {
  onShareNotice = fn;
}
const chains = new Map<string, { track: RemoteAudioTrack; lowpass: BiquadFilterNode; pan: StereoPannerNode; el: HTMLMediaElement }>();
/** Quem o LiveKit diz que está falando (a sala inteira, inclusive quem você não ouve). */
let rawSpeakers: string[] = [];

/**
 * "Falando" só para quem você ouve agora (a voz chega até você) e para você mesmo. O LiveKit avisa
 * a sala inteira; sem esse filtro, quem está fora de uma roda fechada, de um sussurro ou de uma
 * sala veria que alguém fala ali dentro.
 */
function publishSpeaking(): void {
  const me = room?.localParticipant.identity;
  const speaking: Record<string, true> = {};
  for (const id of rawSpeakers) if (id === me || chains.has(id)) speaking[id] = true;
  const prev = useMedia.getState().speaking;
  const keys = Object.keys(speaking);
  if (keys.length === Object.keys(prev).length && keys.every((k) => prev[k])) return;
  useMedia.setState({ speaking });
}
/** O contexto de áudio do escritório (vozes, supressão de ruído, medidores). 48 kHz: o RNNoise exige. */
export function audioContext(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: "interactive", sampleRate: 48000 });
    // O navegador só libera áudio depois de um gesto da pessoa.
    const resume = () => void ctx?.resume();
    window.addEventListener("pointerdown", resume);
    window.addEventListener("keydown", resume);
  }
  return ctx;
}

/** Quem avisa os outros sobre mic e câmera (a sessão do mundo registra). */
export function onMediaInfo(fn: (p: { mic?: boolean; cam?: boolean; screen?: boolean; screenPaused?: boolean }) => void): void {
  pendingInfo = fn;
}

export async function joinRtc(url: string, token: string): Promise<void> {
  if (room) return;
  useMedia.setState({ status: "connecting", error: null });
  const r = new Room({
    // Mede o vídeo em pixels reais da tela (2x em retina): a bolha grande pede a camada nítida.
    adaptiveStream: { pixelDensity: "screen" },
    dynacast: true,
    webAudioMix: { audioContext: audioContext() },
    audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    videoCaptureDefaults: { resolution: VideoPresets.h360.resolution },
    publishDefaults: { simulcast: true, videoCodec: "vp9", backupCodec: { codec: "vp8" }, dtx: true, red: true },
  });
  room = r;
  r.on(RoomEvent.TrackSubscribed, onSubscribed)
    .on(RoomEvent.TrackUnsubscribed, onUnsubscribed)
    .on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => dropParticipant(p.identity))
    .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      rawSpeakers = speakers.map((s) => s.identity);
      publishSpeaking();
    })
    .on(RoomEvent.LocalTrackPublished, (pub: LocalTrackPublication) => {
      onLocalPublished(pub);
      // Durante um sussurro, quem só te vê precisa das faixas novas (câmera ou tela ligada agora).
      if (sightIds) applyAudience();
    })
    .on(RoomEvent.LocalTrackUnpublished, (pub: LocalTrackPublication) => {
      if (pub.source === Track.Source.Camera) setVideo(r.localParticipant.identity, null);
    })
    .on(RoomEvent.Disconnected, () => useMedia.setState({ status: "off" }));
  try {
    await r.connect(url, token, { autoSubscribe: false });
    applyAudience();
    const speaker = useMediaSettings.getState().speakerId;
    if (speaker) void r.switchActiveDevice("audiooutput", speaker).catch(() => undefined);
    noiseApplied = null;
    useMedia.setState({ status: "on" });
    window.clearInterval(loop);
    loop = window.setInterval(updateSpatial, 80);
  } catch (e) {
    room = null;
    useMedia.setState({ status: "error", error: e instanceof Error ? e.message : String(e) });
  }
}

export async function leaveRtc(): Promise<void> {
  window.clearInterval(loop);
  for (const id of [...chains.keys()]) dropParticipant(id);
  const r = room;
  room = null;
  await r?.disconnect();
  for (const el of screenAudio.values()) el.remove();
  screenAudio.clear();
  shareZone = null;
  // Nova sessão, id novo no servidor: o sussurro (se houver) recomeça pelo pacote portas.
  whisperTarget = null;
  sightIds = null;
  rawSpeakers = [];
  useMedia.setState({ status: "off", mic: false, cam: false, speaking: {}, videos: {}, audience: 0, recorded: false, screen: false, screens: {} });
}

/** Lista do servidor: quem pode ouvir você agora. */
export function setAudience(ids: string[]): void {
  audienceIds = ids;
  updateAudienceCount();
  applyAudience();
}

function updateAudienceCount(): void {
  // O gravador de reunião não conta como "pessoa que te ouve" (a sala já mostra o aviso de gravação).
  const voice = whisperTarget === null ? audienceIds : audienceIds.filter((id) => id === whisperTarget);
  useMedia.setState({ audience: voice.filter((id) => !id.startsWith("gravador-")).length, recorded: voice.some((id) => id.startsWith("gravador-")) });
}

// ---- sussurro (pacote portas) -------------------------------------------------------------------

/** Para quem você está sussurrando agora (null = falando normalmente). Vale na hora, antes do servidor. */
let whisperTarget: string | null = null;
/** Durante um sussurro, quem continua vendo seu vídeo e sua tela (lista do servidor). */
let sightIds: string[] | null = null;
let preroll: number | undefined;

/**
 * Começa (alvo) ou termina (null) um sussurro. A voz fica restrita na hora, sem esperar o servidor,
 * e o microfone manda silêncio por um instante enquanto o LiveKit aplica a permissão nova:
 * nenhuma palavra dita logo depois de apertar a tecla chega a quem não deve.
 */
export function setWhisper(target: string | null): void {
  if (target === whisperTarget) return;
  const starting = whisperTarget === null && target !== null;
  whisperTarget = target;
  if (starting) {
    const mic = micTrack()?.mediaStreamTrack;
    if (mic && mic.enabled) {
      mic.enabled = false;
      window.clearTimeout(preroll);
      preroll = window.setTimeout(() => {
        // Só religa se a pessoa não desligou o microfone nesse meio-tempo.
        const t = micTrack();
        if (t && !t.isMuted) t.mediaStreamTrack.enabled = true;
      }, 300);
    }
  }
  updateAudienceCount();
  applyAudience();
}

/** Lista do servidor durante um sussurro: quem continua vendo você (null = igual a quem te ouve). */
export function setSight(ids: string[] | null): void {
  sightIds = ids;
  applyAudience();
}

/** Ids das suas faixas de vídeo e tela (o que quem só te vê pode receber durante um sussurro). */
function visualTrackSids(): string[] {
  const out: string[] = [];
  if (!room) return out;
  for (const pub of room.localParticipant.trackPublications.values()) {
    if (pub.source !== Track.Source.Microphone && pub.trackSid) out.push(pub.trackSid);
  }
  return out;
}

/**
 * Libera suas faixas no LiveKit só para quem o servidor disse que pode receber.
 * Sussurrando: a voz só para a pessoa escolhida (se ela estiver na lista); os outros da lista de
 * "quem vê" recebem só vídeo e tela.
 */
function applyAudience(): void {
  if (!room || room.state !== ConnectionState.Connected) return;
  const voice = whisperTarget === null ? audienceIds : audienceIds.filter((id) => id === whisperTarget);
  const sight = sightIds ?? audienceIds;
  const onlySee = sight.filter((id) => !voice.includes(id));
  const visual = onlySee.length ? visualTrackSids() : [];
  room.localParticipant.setTrackSubscriptionPermissions(false, [
    ...voice.map((id) => ({ participantIdentity: id, allowAll: true })),
    ...onlySee.map((id) => ({ participantIdentity: id, allowAll: false, allowedTrackSids: visual })),
  ]);
}

// ---- regras de privacidade para o volume local (pacote portas) ---------------------------------

let privacyRules: () => PrivacyRules | undefined = () => undefined;

/** O pacote portas informa portas fechadas, rodas e sussurros recebidos (mesma regra do servidor). */
export function setPrivacyRules(fn: () => PrivacyRules | undefined): void {
  privacyRules = fn;
}

let megaphoneId: () => string | null = () => null;

/** O megafone informa quem está falando para todos (a voz chega de qualquer lugar, no centro). */
export function setMegaphone(fn: () => string | null): void {
  megaphoneId = fn;
}

export async function setMic(on: boolean): Promise<void> {
  if (!room) return;
  try {
    await room.localParticipant.setMicrophoneEnabled(on, micCapture());
    if (on) await applyNoise();
    useMedia.setState({ mic: on });
    pendingInfo?.({ mic: on });
  } catch (e) {
    useMedia.setState({ error: deviceError(e, "microfone") });
  }
}

export async function setCam(on: boolean): Promise<void> {
  if (!room) return;
  try {
    await room.localParticipant.setCameraEnabled(on, camCapture());
    if (on) await applyCamBackground();
    useMedia.setState({ cam: on });
    pendingInfo?.({ cam: on });
  } catch (e) {
    useMedia.setState({ error: deviceError(e, "câmera") });
  }
}

// ---- preferências de dispositivo e supressão de ruído -----------------------------------------

function micCapture(s: MediaSettings = useMediaSettings.getState()) {
  return {
    deviceId: s.micId ?? undefined,
    echoCancellation: s.echo,
    autoGainControl: s.autoGain,
    // Com RNNoise/GTCRN, o filtro do navegador fica desligado (os dois juntos deixam a voz metálica).
    noiseSuppression: s.noise === "browser",
    channelCount: 1,
  };
}

/** Fundo escolhido na câmera publicada (troca na hora, sem desligar a câmera). Também reaplica quando a imagem própria muda. */
export async function applyCamBackground(): Promise<void> {
  const cam = room?.localParticipant.getTrackPublication(Track.Source.Camera)?.track as LocalVideoTrack | undefined;
  if (!cam) return;
  const ok = await applyBackground(cam, useMediaSettings.getState().camBg);
  if (!ok) useMedia.setState({ error: "Não deu para aplicar o fundo da câmera neste navegador." });
}

function camCapture(s: MediaSettings = useMediaSettings.getState()) {
  const r = VIDEO_RES[s.video];
  return { deviceId: s.camId ?? undefined, resolution: { width: r.width, height: r.height, frameRate: r.frameRate } };
}

export function micTrack(): LocalAudioTrack | undefined {
  return room?.localParticipant.getTrackPublication(Track.Source.Microphone)?.track as LocalAudioTrack | undefined;
}

let noiseApplied: string | null = null;

/** Liga, troca ou desliga o filtro de ruído forte na faixa do microfone. */
async function applyNoise(): Promise<void> {
  const track = micTrack();
  if (!track) return;
  const mode = useMediaSettings.getState().noise;
  const want = mode === "strong" || mode === "max" ? mode : null;
  if (want === noiseApplied && (want === null || track.getProcessor())) return;
  try {
    if (want) await track.setProcessor(noiseProcessor(want));
    else if (track.getProcessor()) await track.stopProcessor();
    noiseApplied = want;
  } catch (e) {
    noiseApplied = null;
    console.warn("[mídia] supressão de ruído indisponível:", e);
    useMedia.setState({ error: "Não deu para ligar a supressão de ruído forte neste navegador. Usando a do navegador." });
  }
}

let lastSettings = useMediaSettings.getState();
useMediaSettings.subscribe((s) => {
  const prev = lastSettings;
  lastSettings = s;
  void applySettings(s, prev);
});

/** Aplica na hora o que mudou nas preferências (sem sair da chamada). */
async function applySettings(s: MediaSettings, prev: MediaSettings): Promise<void> {
  if (!room || room.state !== ConnectionState.Connected) return;
  const lp = room.localParticipant;
  try {
    const track = micTrack();
    if (track && (s.micId !== prev.micId || s.echo !== prev.echo || s.autoGain !== prev.autoGain || (s.noise === "browser") !== (prev.noise === "browser"))) {
      await track.restartTrack(micCapture(s));
    }
    if (s.noise !== prev.noise || s.micId !== prev.micId) await applyNoise();
    if (s.camBg !== prev.camBg) await applyCamBackground();
    if (s.camId !== prev.camId || s.video !== prev.video) {
      const cam = lp.getTrackPublication(Track.Source.Camera)?.track;
      if (cam) await cam.restartTrack(camCapture(s));
    }
    if (s.speakerId !== prev.speakerId && s.speakerId) {
      await room.switchActiveDevice("audiooutput", s.speakerId);
      for (const el of screenAudio.values()) void (el as HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> }).setSinkId?.(s.speakerId);
    }
  } catch (e) {
    useMedia.setState({ error: deviceError(e, "dispositivo") });
  }
}

export type ShareIntent = "document" | "video";

/**
 * Teto de bitrate da tela: ~0,08 bit por pixel por quadro (a mesma conta dos presets do LiveKit:
 * 1080p15 = 2,5 Mbps), entre 1,5 e 8 Mbps. É só teto: a voz sai com prioridade alta e o
 * estimador de banda do WebRTC dá à tela o que sobra, então a tela não sufoca o áudio.
 */
export function shareBitrate(width: number, height: number, fps: number): number {
  return Math.round(Math.min(8_000_000, Math.max(1_500_000, width * height * fps * 0.08)));
}

/**
 * Compartilha a tela. "document" prioriza nitidez (texto, código, planilha); "video" prioriza fluidez.
 * A imagem vai direto do navegador para quem assiste, sem passar por canvas.
 */
export async function startShare(intent: ShareIntent, withAudio: boolean): Promise<void> {
  if (!room) return;
  const lp = room.localParticipant;
  let tracks: (LocalVideoTrack | LocalAudioTrack)[] = [];
  try {
    // 0x0 = sem teto: captura na resolução nativa da tela (sem isso o LiveKit limita a 1080p).
    tracks = (await lp.createScreenTracks({
      audio: withAudio,
      contentHint: intent === "document" ? "detail" : "motion",
      resolution: ScreenSharePresets.original.resolution,
      selfBrowserSurface: "exclude",
      surfaceSwitching: "include",
      systemAudio: withAudio ? "include" : "exclude",
    })) as (LocalVideoTrack | LocalAudioTrack)[];
    const video = tracks.find((t) => t.kind === Track.Kind.Video)!;
    const fps = intent === "document" ? 15 : 30;
    const { width = 1920, height = 1080 } = video.mediaStreamTrack.getSettings();
    const opts = {
      // VP9 com simulcast + L1T3: único caminho em que o LiveKit não troca "detail" por "motion" na
      // tela (Chrome/Edge 113+). O Safari publica VP9 de camada única; quem não decodifica VP9 recebe o VP8 reserva.
      videoCodec: "vp9" as const,
      simulcast: true,
      scalabilityMode: "L1T3" as const,
      screenShareEncoding: { maxBitrate: shareBitrate(width, height, fps), maxFramerate: fps },
      degradationPreference: intent === "document" ? ("maintain-resolution" as const) : ("maintain-framerate" as const),
    };
    const [pub] = await Promise.all(tracks.map((t) => lp.publishTrack(t, opts)));
    if (!pub?.track) return;
    const media = pub.track.mediaStreamTrack;
    // Janela compartilhada minimizada: o navegador para de mandar quadros e a faixa fica "muda".
    media.addEventListener("mute", () => {
      pendingInfo?.({ screenPaused: true });
      onShareNotice?.("Sua janela compartilhada está minimizada. Quem assiste vê um aviso. Dica: compartilhe a tela inteira.");
    });
    media.addEventListener("unmute", () => pendingInfo?.({ screenPaused: false }));
    media.addEventListener("ended", () => void stopShare());
    const el = pub.track.attach() as HTMLVideoElement;
    el.muted = true;
    setScreen(room.localParticipant.identity, el);
    const { zones } = world();
    shareZone = zones.zoneAt({ x: self.x, z: self.z })?.id ?? null;
    useMedia.setState({ screen: true });
    pendingInfo?.({ screen: true, screenPaused: false });
  } catch (e) {
    // Captura aberta e publicação falhou: solta a tela (senão o navegador segue mostrando "compartilhando").
    if (!lp.getTrackPublication(Track.Source.ScreenShare)) for (const t of tracks) t.stop();
    const name = e instanceof DOMException ? e.name : "";
    if (name !== "NotAllowedError" && name !== "AbortError") useMedia.setState({ error: "Não foi possível compartilhar a tela." });
  }
}

/**
 * Enquanto a tela de alguém está aberta grande, pede ao LiveKit a camada mais alta. O adaptiveStream
 * só mede o <video> anexado (o escondido de 2px que alimenta a TV do mundo) e, sem isto, pediria a
 * camada mais baixa. Devolve a função que desfaz (ao minimizar, fechar ou trocar de tela).
 */
export function focusScreen(id: string): () => void {
  const track = room?.remoteParticipants.get(id)?.getTrackPublication(Track.Source.ScreenShare)?.videoTrack as RemoteVideoTrack | undefined;
  if (!track) return () => undefined;
  const info: ElementInfo = {
    element: {},
    width: () => 7680,
    height: () => 4320,
    visible: true,
    pictureInPicture: false,
    visibilityChangedAt: undefined,
    observe: () => undefined,
    stopObserving: () => undefined,
  };
  track.observeElementInfo(info);
  return () => track.stopObservingElementInfo(info);
}

/** Id da publicação de tela de alguém: muda a cada novo compartilhamento (a UI lembra o que já abriu). */
export function screenSid(id: string): string | undefined {
  return room?.remoteParticipants.get(id)?.getTrackPublication(Track.Source.ScreenShare)?.trackSid;
}

/** O que chega da tela de alguém (prova de resolução nos testes): largura, altura, quadros/s e codec. */
export async function screenStats(id: string): Promise<{ width: number; height: number; fps: number; codec: string } | null> {
  const report = await room?.remoteParticipants.get(id)?.getTrackPublication(Track.Source.ScreenShare)?.videoTrack?.getRTCStatsReport();
  if (!report) return null;
  for (const s of report.values()) {
    if (s.type !== "inbound-rtp" || s.kind !== "video") continue;
    return { width: s.frameWidth ?? 0, height: s.frameHeight ?? 0, fps: s.framesPerSecond ?? 0, codec: report.get(s.codecId)?.mimeType ?? "?" };
  }
  return null;
}

export async function stopShare(): Promise<void> {
  if (!room) return;
  shareZone = null;
  await room.localParticipant.setScreenShareEnabled(false).catch(() => undefined);
  setScreen(room.localParticipant.identity, null);
  useMedia.setState({ screen: false });
  pendingInfo?.({ screen: false, screenPaused: false });
}

function setScreen(id: string, el: HTMLVideoElement | null): void {
  const old = useMedia.getState().screens[id];
  if (old && old !== el) old.remove();
  if (el) {
    el.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none";
    document.body.appendChild(el);
    void el.play().catch(() => undefined);
  }
  useMedia.setState((s) => {
    const screens = { ...s.screens };
    if (el) screens[id] = el;
    else delete screens[id];
    return { screens };
  });
}

function deviceError(e: unknown, what: string): string {
  const name = e instanceof DOMException ? e.name : "";
  if (name === "NotAllowedError") return `O navegador bloqueou o ${what}. Libere o acesso no cadeado ao lado do endereço.`;
  if (name === "NotFoundError") return `Nenhum ${what} encontrado neste computador.`;
  if (name === "NotReadableError") return `O ${what} está sendo usado por outro programa.`;
  return `Não foi possível ligar o ${what}.`;
}

function onLocalPublished(pub: LocalTrackPublication): void {
  if (pub.source === Track.Source.Camera && pub.track && room) {
    const el = pub.track.attach() as HTMLVideoElement;
    el.muted = true;
    el.playsInline = true;
    setVideo(room.localParticipant.identity, el);
  }
}

function setVideo(id: string, el: HTMLVideoElement | null): void {
  useMedia.setState((s) => {
    const videos = { ...s.videos };
    if (el) videos[id] = el;
    else delete videos[id];
    return { videos };
  });
}

function onSubscribed(track: RemoteTrack, _pub: RemoteTrackPublication, p: RemoteParticipant): void {
  if (track.source === Track.Source.ScreenShare) {
    const el = track.attach() as HTMLVideoElement;
    el.playsInline = true;
    el.muted = true;
    setScreen(p.identity, el);
    return;
  }
  if (track.source === Track.Source.ScreenShareAudio) {
    const el = track.attach();
    el.style.display = "none";
    document.body.appendChild(el);
    screenAudio.set(p.identity, el);
    return;
  }
  if (track.kind === Track.Kind.Audio && track instanceof RemoteAudioTrack) {
    const c = audioContext();
    const lowpass = c.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 18000;
    const pan = c.createStereoPanner();
    track.setWebAudioPlugins([lowpass, pan]);
    const el = track.attach();
    el.style.display = "none";
    document.body.appendChild(el);
    chains.set(p.identity, { track, lowpass, pan, el });
    publishSpeaking();
  } else if (track.kind === Track.Kind.Video && track.source === Track.Source.Camera) {
    const el = track.attach() as HTMLVideoElement;
    el.playsInline = true;
    el.muted = true;
    setVideo(p.identity, el);
  }
}

function onUnsubscribed(track: RemoteTrack, _pub: RemoteTrackPublication, p: RemoteParticipant): void {
  if (track.source === Track.Source.ScreenShare) {
    track.detach();
    setScreen(p.identity, null);
    return;
  }
  if (track.source === Track.Source.ScreenShareAudio) {
    track.detach().forEach((el) => el.remove());
    screenAudio.delete(p.identity);
    return;
  }
  if (track.kind === Track.Kind.Audio) {
    const c = chains.get(p.identity);
    if (c) {
      c.track.detach().forEach((el) => el.remove());
      chains.delete(p.identity);
      publishSpeaking();
    }
  } else if (track.source === Track.Source.Camera) {
    track.detach();
    setVideo(p.identity, null);
  }
}

function dropParticipant(id: string): void {
  const c = chains.get(id);
  if (c) {
    c.track.detach().forEach((el) => el.remove());
    chains.delete(id);
    publishSpeaking();
  }
  setVideo(id, null);
  setScreen(id, null);
  screenAudio.get(id)?.remove();
  screenAudio.delete(id);
}

/** Nome do filtro ativo no microfone (diagnóstico e testes). */
export function micProcessorName(): string | null {
  return micTrack()?.getProcessor()?.name ?? null;
}

/** Estado das faixas remotas (diagnóstico e testes). */
export function rtcDebug(): { id: string; hearing: string; tracks: { source: string; subscribed: boolean; status: string; permission: string }[] }[] {
  if (!room) return [];
  return [...room.remoteParticipants.values()].map((p) => ({
    id: p.identity,
    hearing: hearingOf(p.identity)?.mode ?? "?",
    tracks: [...p.trackPublications.values()].map((t) => ({ source: t.source, subscribed: t.isSubscribed, status: t.subscriptionStatus, permission: t.permissionStatus })),
  }));
}

/** Ids das pessoas cuja voz está chegando agora (para diagnóstico e testes). */
export function subscribedAudio(): string[] {
  return [...chains.keys()];
}

/** Quanto eu ouço cada pessoa, com a mesma regra do servidor (salas, portas, rodas e sussurros). */
export function hearingOf(id: string): Hearing | null {
  const p = sampleRemote(id);
  if (!p) return null;
  const { map, zones } = world();
  const me = { x: self.x, z: self.z };
  const myId = useApp.getState().selfId ?? undefined;
  return hearing(
    map.walls,
    { pos: me, zone: zones.zoneAt(me), id: myId },
    { pos: { x: p.x, z: p.z }, zone: zones.zoneAt({ x: p.x, z: p.z }), id },
    { privacy: privacyRules(), megaphone: megaphoneId() === id },
  );
}

/** A cada ~80 ms: decide o que assinar e ajusta volume, direção e abafamento de cada voz. */
function updateSpatial(): void {
  if (!room || room.state !== ConnectionState.Connected) return;
  const c = audioContext();
  const f = dirOfYaw(getHeading());
  const right = { x: -f.z, z: f.x };
  if (shareZone && useMedia.getState().screen) {
    const now = world().zones.zoneAt({ x: self.x, z: self.z })?.id ?? null;
    if (now !== shareZone) {
      onShareNotice?.("Você saiu da sala, então o compartilhamento de tela parou.");
      void stopShare();
    }
  }
  for (const p of room.remoteParticipants.values()) {
    const h = hearingOf(p.identity);
    const audible = !!h && h.mode !== "none";
    const seeVideo = !!h && h.mode === "clear" && h.gain >= 0.4;
    for (const pub of p.trackPublications.values()) {
      const want =
        pub.source === Track.Source.Camera ? seeVideo : pub.source === Track.Source.ScreenShare || pub.source === Track.Source.ScreenShareAudio ? audible : pub.kind === Track.Kind.Audio ? audible : false;
      if (pub.isSubscribed !== want) pub.setSubscribed(want);
    }
    const chain = chains.get(p.identity);
    if (!chain || !h) continue;
    const prefs = useMediaSettings.getState();
    const vol = personVolumeOf(useApp.getState().players[p.identity]?.name) * prefs.master * h.gain;
    chain.track.setVolume(vol);
    chain.lowpass.frequency.setTargetAtTime(h.muffled ? 900 : 18000, c.currentTime, 0.12);
    const r = sampleRemote(p.identity);
    if (r) {
      const dx = r.x - self.x;
      const dz = r.z - self.z;
      const d = Math.hypot(dx, dz) || 1;
      const pan = (h.mode === "clear" && d < 1.2) || megaphoneId() === p.identity ? 0 : ((dx * right.x + dz * right.z) / d) * 0.75;
      chain.pan.pan.setTargetAtTime(pan, c.currentTime, 0.1);
    }
  }
}
