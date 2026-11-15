import { spawn, type ChildProcess } from "node:child_process";
import { AudioStream, Room, RoomEvent, TrackKind, TrackSource, dispose, type RemoteParticipant, type RemoteTrack, type RemoteTrackPublication } from "@livekit/rtc-node";
import { Mixer, RATE } from "./mixer.ts";

/**
 * Processo gravador (um por reunião, separado do servidor do mundo: se cair, o escritório segue).
 * Entra na sala do LiveKit como participante oculto, recebe só as vozes que o servidor liberou
 * para ele (as de quem está na sala gravada), mistura num relógio fixo e entrega ao ffmpeg (Opus/Ogg).
 *
 * Mensagens do pai: { t: "start", url, token, file, ffmpeg } e { t: "stop" }.
 * Mensagens para o pai: { t: "ready" }, { t: "stopped", ms }, { t: "error", message }.
 */

type FromParent = { t: "start"; url: string; token: string; file: string; ffmpeg: string } | { t: "stop" };

const send = (m: unknown) => process.send?.(m);
const mixer = new Mixer();
const readers = new Map<string, AudioStream>();
let room: Room | null = null;
let ff: ChildProcess | null = null;
let clock: NodeJS.Timeout | undefined;
let startedAt = 0;
let written = 0;
let stopping = false;

process.on("message", (msg: FromParent) => {
  if (msg.t === "start") void start(msg).catch((e) => fail(e));
  if (msg.t === "stop") void stop();
});
process.on("disconnect", () => void stop());

async function start(o: Extract<FromParent, { t: "start" }>): Promise<void> {
  // Opus em Ogg: ótimo para fala, arquivo pequeno e legível mesmo se o processo for interrompido.
  ff = spawn(o.ffmpeg, ["-hide_banner", "-loglevel", "error", "-f", "s16le", "-ar", String(RATE), "-ac", "1", "-i", "pipe:0", "-c:a", "libopus", "-b:a", "48k", "-application", "voip", "-y", o.file], {
    stdio: ["pipe", "ignore", "pipe"],
  });
  ff.stderr?.on("data", (d) => console.error(`[gravador] ffmpeg: ${String(d).trim()}`));
  ff.on("error", (e) => fail(e));

  room = new Room();
  room.on(RoomEvent.TrackSubscribed, onTrack).on(RoomEvent.TrackUnsubscribed, (_t: RemoteTrack, pub: RemoteTrackPublication, p: RemoteParticipant) => drop(key(p, pub)));
  room.on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
    for (const k of [...readers.keys()]) if (k.startsWith(`${p.identity}:`)) drop(k);
  });
  await room.connect(o.url, o.token, { autoSubscribe: true, dynacast: false });

  // Relógio: a cada 20 ms escreve o que o tempo real pede (corrige atrasos do timer).
  startedAt = performance.now();
  clock = setInterval(tick, 20);
  send({ t: "ready" });
}

function key(p: RemoteParticipant, pub: RemoteTrackPublication): string {
  return `${p.identity}:${pub.sid}`;
}

function onTrack(track: RemoteTrack, pub: RemoteTrackPublication, p: RemoteParticipant): void {
  // Só voz e som de tela compartilhada; vídeo não interessa ao gravador.
  if (track.kind !== TrackKind.KIND_AUDIO) {
    pub.setSubscribed(false);
    return;
  }
  if (pub.source !== TrackSource.SOURCE_MICROPHONE && pub.source !== TrackSource.SOURCE_SCREENSHARE_AUDIO) return;
  const k = key(p, pub);
  const stream = new AudioStream(track, RATE, 1);
  readers.set(k, stream);
  void (async () => {
    try {
      for await (const frame of stream) {
        if (readers.get(k) !== stream) break;
        mixer.push(k, frame.data);
      }
    } catch {
      // faixa encerrada
    }
  })();
}

function drop(k: string): void {
  const s = readers.get(k);
  readers.delete(k);
  mixer.remove(k);
  void s?.cancel().catch(() => undefined);
}

function tick(): void {
  if (!ff?.stdin?.writable) return;
  const due = Math.floor(((performance.now() - startedAt) / 1000) * RATE);
  let n = due - written;
  // Nunca escreve mais que 1 s de uma vez (se o processo travou, segue do agora).
  if (n > RATE) {
    written = due - RATE;
    n = RATE;
  }
  if (n <= 0) return;
  const pcm = mixer.pull(n);
  written += n;
  ff.stdin.write(Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength));
}

async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  clearInterval(clock);
  for (const k of [...readers.keys()]) drop(k);
  await room?.disconnect().catch(() => undefined);
  const ms = Math.round((written / RATE) * 1000);
  if (ff) {
    const done = new Promise<void>((resolve) => ff!.once("close", () => resolve()));
    ff.stdin?.end();
    await Promise.race([done, new Promise((r) => setTimeout(r, 10_000))]);
  }
  send({ t: "stopped", ms });
  await dispose().catch(() => undefined);
  process.exit(0);
}

function fail(e: unknown): void {
  send({ t: "error", message: e instanceof Error ? e.message : String(e) });
  void stop();
}
