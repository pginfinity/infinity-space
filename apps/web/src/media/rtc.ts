import { create } from "zustand";
import {
  ConnectionState,
  RemoteAudioTrack,
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  type LocalTrackPublication,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from "livekit-client";
import { dirOfYaw, hearing, type Hearing } from "@infinity/world";
import { world } from "../world/world.ts";
import { sampleRemote, self } from "../world/registry.ts";
import { getHeading } from "../engine/movement.ts";

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
}

export const useMedia = create<MediaState>(() => ({ status: "off", mic: false, cam: false, speaking: {}, videos: {}, audience: 0, error: null }));

let room: Room | null = null;
let ctx: AudioContext | null = null;
let loop: number | undefined;
let audienceIds: string[] = [];
let pendingInfo: ((p: { mic?: boolean; cam?: boolean }) => void) | null = null;
const chains = new Map<string, { track: RemoteAudioTrack; lowpass: BiquadFilterNode; pan: StereoPannerNode; el: HTMLMediaElement }>();
/** Volume por pessoa escolhido pelo usuário (0 a 1.5). */
export const personVolume = new Map<string, number>();

function audioContext(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: "interactive" });
    // O navegador só libera áudio depois de um gesto da pessoa.
    const resume = () => void ctx?.resume();
    window.addEventListener("pointerdown", resume);
    window.addEventListener("keydown", resume);
  }
  return ctx;
}

/** Quem avisa os outros sobre mic e câmera (a sessão do mundo registra). */
export function onMediaInfo(fn: (p: { mic?: boolean; cam?: boolean }) => void): void {
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
  useMedia.setState({ status: "off", mic: false, cam: false, speaking: {}, videos: {}, audience: 0 });
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
    await room.localParticipant.setMicrophoneEnabled(on);
    useMedia.setState({ mic: on });
    pendingInfo?.({ mic: on });
  } catch (e) {
    useMedia.setState({ error: deviceError(e, "microfone") });
  }
}

export async function setCam(on: boolean): Promise<void> {
  if (!room) return;
  try {
    await room.localParticipant.setCameraEnabled(on);
    useMedia.setState({ cam: on });
    pendingInfo?.({ cam: on });
  } catch (e) {
    useMedia.setState({ error: deviceError(e, "câmera") });
  }
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
  for (const p of room.remoteParticipants.values()) {
    const h = hearingOf(p.identity);
    const audible = !!h && h.mode !== "none";
    const seeVideo = !!h && h.mode === "clear" && h.gain >= 0.4;
    for (const pub of p.trackPublications.values()) {
      const want = pub.kind === Track.Kind.Audio ? audible : pub.source === Track.Source.Camera ? seeVideo : false;
      if (pub.isSubscribed !== want) pub.setSubscribed(want);
    }
    const chain = chains.get(p.identity);
    if (!chain || !h) continue;
    const vol = (personVolume.get(p.identity) ?? 1) * h.gain;
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
