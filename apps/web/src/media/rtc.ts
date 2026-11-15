import { create } from "zustand";
import {
  ConnectionState,
  RemoteAudioTrack,
  Room,
  RoomEvent,
  ScreenSharePresets,
  Track,
  VideoPresets,
  type LocalAudioTrack,
  type LocalTrackPublication,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from "livekit-client";
import { dirOfYaw, hearing, type Hearing } from "@infinity/world";
import { world } from "../world/world.ts";
import { sampleRemote, self } from "../world/registry.ts";
import { getHeading } from "../engine/movement.ts";
import { useApp } from "../state/store.ts";
import { personVolumeOf, useMediaSettings, VIDEO_RES, type MediaSettings } from "./settings.ts";
import { noiseProcessor } from "./noise.ts";

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
  error: string | null;
  /** Você está compartilhando a tela. */
  screen: boolean;
  /** Telas compartilhadas que chegam até você (e a sua, como prévia), por id de quem compartilha. */
  screens: Record<string, HTMLVideoElement>;
}

export const useMedia = create<MediaState>(() => ({ status: "off", mic: false, cam: false, speaking: {}, videos: {}, audience: 0, error: null, screen: false, screens: {} }));

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
    adaptiveStream: true,
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
      const speaking: Record<string, true> = {};
      for (const s of speakers) speaking[s.identity] = true;
      useMedia.setState({ speaking });
    })
    .on(RoomEvent.LocalTrackPublished, onLocalPublished)
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
  useMedia.setState({ status: "off", mic: false, cam: false, speaking: {}, videos: {}, audience: 0, screen: false, screens: {} });
}

/** Lista do servidor: quem pode ouvir você agora. */
export function setAudience(ids: string[]): void {
  audienceIds = ids;
  useMedia.setState({ audience: ids.length });
  applyAudience();
}

function applyAudience(): void {
  if (!room || room.state !== ConnectionState.Connected) return;
  room.localParticipant.setTrackSubscriptionPermissions(
    false,
    audienceIds.map((id) => ({ participantIdentity: id, allowAll: true })),
  );
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

function camCapture(s: MediaSettings = useMediaSettings.getState()) {
  const r = VIDEO_RES[s.video];
  return { deviceId: s.camId ?? undefined, resolution: { width: r.width, height: r.height, frameRate: r.frameRate } };
}

function micTrack(): LocalAudioTrack | undefined {
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
 * Compartilha a tela. "document" prioriza nitidez (texto, código, planilha); "video" prioriza fluidez.
 * A imagem vai direto do navegador para quem assiste, sem passar por canvas.
 */
export async function startShare(intent: ShareIntent, withAudio: boolean): Promise<void> {
  if (!room) return;
  try {
    const pub = await room.localParticipant.setScreenShareEnabled(
      true,
      {
        audio: withAudio,
        contentHint: intent === "document" ? "detail" : "motion",
        resolution: intent === "document" ? ScreenSharePresets.h1080fps15.resolution : ScreenSharePresets.h1080fps30.resolution,
        selfBrowserSurface: "exclude",
        surfaceSwitching: "include",
        systemAudio: withAudio ? "include" : "exclude",
      },
      {
        videoCodec: "vp9",
        screenShareEncoding: intent === "document" ? ScreenSharePresets.h1080fps15.encoding : ScreenSharePresets.h1080fps30.encoding,
        degradationPreference: intent === "document" ? "maintain-resolution" : "maintain-framerate",
      },
    );
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
    const name = e instanceof DOMException ? e.name : "";
    if (name !== "NotAllowedError" && name !== "AbortError") useMedia.setState({ error: "Não foi possível compartilhar a tela." });
  }
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

/** Quanto eu ouço cada pessoa, com a mesma regra do servidor. */
export function hearingOf(id: string): Hearing | null {
  const p = sampleRemote(id);
  if (!p) return null;
  const { map, zones } = world();
  const me = { x: self.x, z: self.z };
  return hearing(map.walls, { pos: me, zone: zones.zoneAt(me) }, { pos: { x: p.x, z: p.z }, zone: zones.zoneAt({ x: p.x, z: p.z }) });
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
      const pan = h.mode === "clear" && d < 1.2 ? 0 : ((dx * right.x + dz * right.z) / d) * 0.75;
      chain.pan.pan.setTargetAtTime(pan, c.currentTime, 0.1);
    }
  }
}
