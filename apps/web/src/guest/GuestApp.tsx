import { useEffect, useRef, useState, type FormEvent } from "react";
import { Packr } from "msgpackr";
import { ConnectionState, Room, RoomEvent, Track, VideoPresets } from "livekit-client";
import { Mic, MicOff, PhoneOff, Video, VideoOff, Volume2 } from "lucide-react";
import { clsx } from "clsx";
import { CONVITE_PARAM, DEFAULT_LOOK, PROTOCOL_VERSION, type ClientMsg, type ServerMsg } from "@infinity/world";
import { Logo } from "../ui/Logo.tsx";
import { wsUrl } from "../net/wsUrl.ts";

/**
 * Página do cliente convidado por link (`/?convite=…`): diz o nome, espera alguém da sala deixar
 * entrar e participa só com voz, vídeo e a lista de quem está na sala. O mundo nem carrega.
 * O servidor só manda a ele o que é da reunião (ver GUEST_MSGS em apps/server/src/room.ts).
 */

const packr = new Packr({ useRecords: false });

type Fim = "recusado" | "cheio" | "invalido" | "caiu" | "saiu" | "versao";
type Stage = "nome" | "conectando" | "aguardando" | "dentro" | "fim";
interface Pessoa {
  id: string;
  name: string;
}
interface Tile {
  key: string;
  who: string;
  screen: boolean;
  track: Track;
}

const T = {
  title: "Entrar na reunião",
  intro: "Você foi convidado para uma reunião no escritório virtual da IA Infinity.",
  name: "Seu nome",
  namePh: "Como quer ser chamado",
  ask: "Pedir para entrar",
  mediaOff: "Microfone e câmera começam desligados.",
  connecting: "Conectando…",
  waiting: (sala: string) => `Aguardando alguém da ${sala || "sala"} deixar você entrar…`,
  giveUp: "Desistir",
  alone: "Ninguém na sala agora. Quem te convidou já deve chegar.",
  recording: "Esta reunião está sendo gravada",
  mic: "Microfone",
  cam: "Câmera",
  leave: "Sair",
  startAudio: "Ativar o som",
  someone: "Alguém do escritório",
  you: "Você",
  mediaDenied: "O navegador não deixou usar o microfone ou a câmera.",
  linking: "Ligando o áudio e o vídeo…",
  rtcFail: "Não deu para ligar o áudio e o vídeo. Saia e entre de novo.",
  again: "Entrar de novo",
  fim: {
    recusado: "Não deixaram você entrar agora.",
    cheio: "Muita gente esperando para entrar agora. Tente de novo em alguns minutos.",
    invalido: "Este convite expirou ou não vale mais. Peça um link novo a quem te convidou.",
    caiu: "A conexão caiu. Para voltar, entre de novo: alguém da sala precisa deixar você entrar outra vez.",
    saiu: "Você saiu da reunião.",
    versao: "O Space foi atualizado. Recarregue a página.",
  } satisfies Record<Fim, string>,
};

const inputClass =
  "mt-2 w-full rounded-xl border border-offwhite/12 bg-deep/70 px-4 py-3 text-base text-offwhite placeholder:text-slate/70 focus:border-signal focus:outline-none";

/** Vídeo das pessoas (câmera e tela) que esta página recebe agora. */
function collect(r: Room): Tile[] {
  const out: Tile[] = [];
  for (const p of r.remoteParticipants.values()) {
    for (const pub of p.trackPublications.values()) {
      if (pub.track && pub.kind === Track.Kind.Video && !pub.isMuted) {
        out.push({ key: pub.trackSid, who: p.identity, screen: pub.source === Track.Source.ScreenShare, track: pub.track });
      }
    }
  }
  return out;
}

export function GuestApp({ token }: { token: string }) {
  const [stage, setStage] = useState<Stage>("nome");
  const [fim, setFim] = useState<Fim>("saiu");
  const [sala, setSala] = useState("");
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [selfCam, setSelfCam] = useState<Track | null>(null);
  const [mic, setMic] = useState(false);
  const [cam, setCam] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [semSom, setSemSom] = useState(false);
  const [falando, setFalando] = useState<string[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ligado, setLigado] = useState(false);
  const ws = useRef<WebSocket | null>(null);
  const room = useRef<Room | null>(null);
  const stageRef = useRef<Stage>("nome");
  const audience = useRef<string[]>([]);
  const audioBox = useRef<HTMLDivElement>(null);

  const go = (s: Stage) => {
    stageRef.current = s;
    setStage(s);
  };
  const send = (m: ClientMsg) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(packr.pack(m) as unknown as BufferSource);
  };
  const end = (motivo: Fim) => {
    if (stageRef.current === "fim") return;
    go("fim");
    setFim(motivo);
    ws.current?.close();
    void room.current?.disconnect();
    room.current = null;
  };
  // A voz, o vídeo e a tela do convidado vão só para quem o servidor diz que ouve (a sala).
  const applyAudience = () => {
    const r = room.current;
    if (r?.state !== ConnectionState.Connected) return;
    r.localParticipant.setTrackSubscriptionPermissions(
      false,
      audience.current.map((id) => ({ participantIdentity: id, allowAll: true })),
    );
  };

  const joinRoom = async (url: string, tok: string) => {
    if (room.current) return;
    const r = new Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      videoCaptureDefaults: { resolution: VideoPresets.h360.resolution },
    });
    room.current = r;
    const sync = () => setTiles(collect(r));
    r.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === Track.Kind.Audio) (audioBox.current ?? document.body).append(track.attach());
      sync();
    })
      .on(RoomEvent.TrackUnsubscribed, (track) => {
        for (const el of track.detach()) el.remove();
        sync();
      })
      .on(RoomEvent.TrackMuted, sync)
      .on(RoomEvent.TrackUnmuted, sync)
      .on(RoomEvent.ParticipantDisconnected, sync)
      .on(RoomEvent.ActiveSpeakersChanged, (sp) => setFalando(sp.map((p) => p.identity)))
      .on(RoomEvent.AudioPlaybackStatusChanged, () => setSemSom(!r.canPlaybackAudio))
      .on(RoomEvent.LocalTrackPublished, applyAudience);
    try {
      await r.connect(url, tok);
      applyAudience();
      setSemSom(!r.canPlaybackAudio);
      setLigado(true);
    } catch {
      room.current = null;
      setAviso(T.rtcFail);
    }
  };

  const start = (name: string) => {
    go("conectando");
    const sock = new WebSocket(`${wsUrl()}?${CONVITE_PARAM}=${encodeURIComponent(token)}`);
    sock.binaryType = "arraybuffer";
    ws.current = sock;
    sock.onopen = () => send({ t: "hello", v: PROTOCOL_VERSION, name, look: DEFAULT_LOOK, lens: "2d" });
    sock.onmessage = (e) => {
      const msg = packr.unpack(new Uint8Array(e.data as ArrayBuffer)) as ServerMsg;
      if (msg.t === "convidado") {
        setSala(msg.sala);
        if (msg.estado === "aguardando") go("aguardando");
        else if (msg.estado === "dentro") {
          if (stageRef.current !== "dentro") {
            go("dentro");
            send({ t: "rtc" });
          }
          setPessoas(msg.pessoas ?? []);
        } else end(msg.estado);
      } else if (msg.t === "rtc") void joinRoom(msg.url, msg.token);
      else if (msg.t === "audience") {
        audience.current = msg.ids;
        setGravando(msg.ids.some((id) => id.startsWith("gravador-")));
        applyAudience();
      } else if (msg.t === "error" && msg.code === "version") end("versao");
    };
    // Fechou sem aviso: antes de chegar à porta, o link não vale (o servidor recusa a conexão).
    sock.onclose = () => end(stageRef.current === "conectando" ? "invalido" : "caiu");
  };

  useEffect(
    () => () => {
      stageRef.current = "fim";
      ws.current?.close();
      void room.current?.disconnect();
    },
    [],
  );

  const toggle = async (kind: "mic" | "cam") => {
    const r = room.current;
    if (r?.state !== ConnectionState.Connected) return;
    const on = kind === "mic" ? !mic : !cam;
    try {
      if (kind === "mic") {
        await r.localParticipant.setMicrophoneEnabled(on);
        setMic(on);
      } else {
        await r.localParticipant.setCameraEnabled(on);
        setCam(on);
        setSelfCam(on ? (r.localParticipant.getTrackPublication(Track.Source.Camera)?.track ?? null) : null);
      }
      send({ t: "info", patch: { [kind]: on } });
      setAviso(null);
    } catch {
      setAviso(T.mediaDenied);
    }
  };

  if (stage === "dentro") {
    const nameOf = (id: string) => pessoas.find((p) => p.id === id)?.name ?? T.someone;
    const screens = tiles.filter((t) => t.screen);
    const camOf = (id: string) => tiles.find((t) => !t.screen && t.who === id)?.track;
    return (
      <div className="flex h-full flex-col bg-space text-offwhite">
        <div ref={audioBox} hidden />
        <header className="flex items-center justify-between gap-3 border-b border-offwhite/8 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Logo size="sm" />
            <h1 className="truncate font-display text-sm font-medium uppercase tracking-[0.1em]">{sala}</h1>
          </div>
          {gravando && (
            <p role="status" className="flex shrink-0 items-center gap-2 rounded-full border border-danger/40 px-3 py-1 text-xs">
              <span className="size-2 rounded-full bg-danger" aria-hidden />
              {T.recording}
            </p>
          )}
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
          {screens.map((t) => (
            <VideoTile key={t.key} track={t.track} label={nameOf(t.who)} className="mb-3 aspect-video w-full" contain />
          ))}
          {pessoas.length === 0 && <p className="py-10 text-center text-sm text-slate">{T.alone}</p>}
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,220px),1fr))] gap-3">
            {pessoas.map((p) => {
              const track = camOf(p.id);
              return (
                <li key={p.id} className={clsx("rounded-2xl ring-2 transition", falando.includes(p.id) ? "ring-signal" : "ring-transparent")}>
                  {track ? (
                    <VideoTile track={track} label={p.name} className="aspect-video w-full" />
                  ) : (
                    <div className="grid aspect-video place-items-center rounded-2xl bg-card/60">
                      <span className="grid size-14 place-items-center rounded-full bg-offwhite/10 font-display text-xl">{p.name.trim().charAt(0).toUpperCase()}</span>
                      <span className="text-sm text-offwhite/85">{p.name}</span>
                    </div>
                  )}
                </li>
              );
            })}
            {selfCam && (
              <li>
                <VideoTile track={selfCam} label={T.you} className="aspect-video w-full" mirror />
              </li>
            )}
          </ul>
        </main>
        <footer className="flex flex-wrap items-center justify-center gap-2 border-t border-offwhite/8 px-4 py-3">
          {aviso ? <p className="w-full text-center text-xs text-warn">{aviso}</p> : !ligado && <p className="w-full text-center text-xs text-slate">{T.linking}</p>}
          {semSom && (
            <button type="button" onClick={() => void room.current?.startAudio()} className="flex items-center gap-2 rounded-full bg-signal px-4 py-2 text-sm font-semibold text-space">
              <Volume2 className="size-4" aria-hidden />
              {T.startAudio}
            </button>
          )}
          <ToggleButton on={mic} disabled={!ligado} label={T.mic} onClick={() => void toggle("mic")} icon={mic ? Mic : MicOff} />
          <ToggleButton on={cam} disabled={!ligado} label={T.cam} onClick={() => void toggle("cam")} icon={cam ? Video : VideoOff} />
          <button type="button" onClick={() => end("saiu")} className="flex items-center gap-2 rounded-full bg-danger px-4 py-2 text-sm font-semibold text-offwhite hover:brightness-110">
            <PhoneOff className="size-4" aria-hidden />
            {T.leave}
          </button>
        </footer>
      </div>
    );
  }

  return (
    <div className="relative grid h-full place-items-center overflow-y-auto bg-space px-5 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgb(0_183_255/0.14),transparent)]" />
      <div className="relative w-full max-w-sm">
        <Logo size="md" />
        <div className="mt-8 rounded-[var(--radius-panel)] border border-offwhite/10 bg-card/60 p-6">
          {stage === "nome" ? (
            <NameForm onSubmit={start} />
          ) : stage === "fim" ? (
            <>
              <p className="text-sm leading-relaxed text-offwhite/90">{T.fim[fim]}</p>
              {fim !== "invalido" && (
                <button type="button" onClick={() => location.reload()} className="mt-5 w-full rounded-xl bg-orange px-4 py-3 font-semibold text-offwhite transition hover:brightness-110">
                  {T.again}
                </button>
              )}
            </>
          ) : (
            <div aria-live="polite">
              <span className="relative flex size-3">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-signal opacity-60" />
                <span className="relative inline-flex size-3 rounded-full bg-signal" />
              </span>
              <p className="mt-4 text-sm leading-relaxed text-offwhite/90">{stage === "conectando" ? T.connecting : T.waiting(sala)}</p>
              <button type="button" onClick={() => end("saiu")} className="mt-5 text-sm text-slate underline-offset-4 hover:text-offwhite hover:underline">
                {T.giveUp}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NameForm({ onSubmit }: { onSubmit: (name: string) => void }) {
  const [name, setName] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) onSubmit(name.trim());
  };
  return (
    <form onSubmit={submit}>
      <h1 className="font-display text-base font-medium uppercase tracking-[0.06em]">{T.title}</h1>
      <p className="mt-1.5 text-sm text-slate">{T.intro}</p>
      <label htmlFor="guest-name" className="label-caps mt-5 block">
        {T.name}
      </label>
      <input id="guest-name" autoFocus required maxLength={32} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder={T.namePh} className={inputClass} />
      <p className="mt-2 text-xs text-slate">{T.mediaOff}</p>
      <button type="submit" disabled={!name.trim()} className="mt-5 w-full rounded-xl bg-orange px-4 py-3 font-semibold text-offwhite transition hover:brightness-110 disabled:opacity-50">
        {T.ask}
      </button>
    </form>
  );
}

function ToggleButton({ on, disabled, label, onClick, icon: Icon }: { on: boolean; disabled: boolean; label: string; onClick: () => void; icon: typeof Mic }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      aria-label={label}
      title={label}
      className={clsx("grid size-11 place-items-center rounded-full transition disabled:opacity-40", on ? "bg-offwhite text-space" : "bg-offwhite/10 text-offwhite hover:bg-offwhite/20")}
    >
      <Icon className="size-5" aria-hidden />
    </button>
  );
}

function VideoTile({ track, label, className, contain, mirror }: { track: Track; label: string; className?: string; contain?: boolean; mirror?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current!;
    track.attach(el);
    return () => void track.detach(el);
  }, [track]);
  return (
    <figure className={clsx("relative overflow-hidden rounded-2xl bg-deep", className)}>
      <video ref={ref} autoPlay playsInline muted className={clsx("size-full", contain ? "object-contain" : "object-cover", mirror && "-scale-x-100")} />
      <figcaption className="absolute bottom-2 left-2 rounded-md bg-space/80 px-2 py-0.5 text-xs">{label}</figcaption>
    </figure>
  );
}
