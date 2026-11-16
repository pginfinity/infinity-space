import { Packr } from "msgpackr";
import { PROTOCOL_VERSION, type ClientMsg, type InfoPatch, type ServerMsg } from "@infinity/world";
import { useApp } from "../state/store.ts";
import { clearRemote, playEmote, pushRemote, removeRemote, self, setSelf } from "../world/registry.ts";
import { joinRtc, leaveRtc, onMediaInfo, setAudience } from "../media/rtc.ts";
import { dispatchActEvent, setAct, setActs } from "../activities/registry.ts";
import { recheckSession } from "./auth.ts";


const packr = new Packr({ useRecords: false });

let socket: WebSocket | null = null;
let wanted = false;
let attempt = 0;
let retryTimer: number | undefined;
let pingTimer: number | undefined;
let everConnected = false;
let welcomed = false;

/** Diferença entre o relógio do servidor e o daqui (ms). Refinada a cada ping. */
let clockOffset = 0;
let bestRtt = Infinity;

/** Agora, no relógio do servidor (para contagens regressivas e "há X min" iguais para todos). */
export function serverNow(): number {
  return Date.now() + clockOffset;
}

/** Conectado e com a sala recebida: só então o movimento é enviado. */
export function isReady(): boolean {
  return welcomed && socket?.readyState === WebSocket.OPEN;
}

/** Endereço do WebSocket. Em desenvolvimento o Vite faz proxy de /ws para o servidor. */
function wsUrl(): string {
  const env = import.meta.env.VITE_WS_URL as string | undefined;
  if (env) return env;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws`;
}

export function send(msg: ClientMsg): void {
  // No navegador o msgpackr devolve Uint8Array (os tipos dele declaram Buffer do Node).
  if (socket?.readyState === WebSocket.OPEN) socket.send(packr.pack(msg) as unknown as BufferSource);
}

export function sendInfo(patch: InfoPatch): void {
  send({ t: "info", patch });
}

/** Entra no escritório e mantém a conexão viva, reconectando sozinho se cair. */
export function connect(): void {
  // Mic e câmera ligados/desligados viram status visível para todos. Registrado aqui (e não ao
  // carregar o módulo) porque sessão, mídia e movimento se importam em ciclo: no carregamento,
  // a mídia pode ainda não estar inicializada.
  onMediaInfo((patch) => sendInfo(patch));
  wanted = true;
  attempt = 0;
  everConnected = false;
  open();
}

export function disconnect(): void {
  wanted = false;
  welcomed = false;
  window.clearTimeout(retryTimer);
  window.clearInterval(pingTimer);
  socket?.close(1000, "leave");
  void leaveRtc();
  socket = null;
  clearRemote();
}

function open(): void {
  const app = useApp.getState();
  app.setConn(everConnected ? "reconnecting" : "connecting");
  const ws = new WebSocket(wsUrl());
  ws.binaryType = "arraybuffer";
  socket = ws;

  ws.onopen = () => {
    const { profile, lens } = useApp.getState();
    send({
      t: "hello",
      v: PROTOCOL_VERSION,
      name: profile.name,
      look: profile.look,
      lens,
      ...(everConnected ? { at: { x: self.x, z: self.z } } : {}),
    });
    window.clearInterval(pingTimer);
    pingTimer = window.setInterval(() => send({ t: "ping", at: performance.now() }), 10_000);
  };

  ws.onmessage = (ev) => {
    let msg: ServerMsg;
    try {
      msg = packr.unpack(new Uint8Array(ev.data as ArrayBuffer)) as ServerMsg;
    } catch {
      return;
    }
    handle(msg);
  };

  ws.onclose = (ev) => {
    window.clearInterval(pingTimer);
    if (socket !== ws) return;
    // Recusado (sem sessão) ou removido pelo admin: volta para o login se a sessão acabou.
    if (ev.code === 4001 || !welcomed) void recheckSession();
    welcomed = false;
    socket = null;
    if (!wanted) return;
    attempt++;
    if (!everConnected && attempt >= 4) {
      useApp.getState().setConn("error");
      return;
    }
    useApp.getState().setConn(everConnected ? "reconnecting" : "connecting");
    const delay = Math.min(5000, 400 * 2 ** Math.min(attempt, 4)) + Math.random() * 300;
    retryTimer = window.setTimeout(open, delay);
  };
}

function handle(msg: ServerMsg): void {
  const app = useApp.getState();
  switch (msg.t) {
    case "welcome": {
      clockOffset = msg.serverTime - Date.now();
      bestRtt = Infinity;
      everConnected = true;
      attempt = 0;
      clearRemote();
      const now = performance.now();
      for (const [id, x, z, yaw, anim] of msg.poses) {
        if (id === msg.you) setSelf(x, z, yaw);
        else pushRemote(id, x, z, yaw, anim, now);
      }
      app.welcome(msg.you, msg.players);
      app.setGames(msg.games ?? []);
      setActs(msg.acts ?? []);
      app.setConn("open");
      welcomed = true;
      // Depois de entrar no mundo, entra na sala de áudio e vídeo (nova sessão a cada reconexão).
      void leaveRtc().then(() => send({ t: "rtc" }));
      break;
    }
    case "emote":
      playEmote(msg.id, msg.e);
      break;
    case "rtc":
      void joinRtc(msg.url, msg.token);
      break;
    case "audience":
      setAudience(msg.ids);
      break;
    case "game":
      app.setGame(msg.game);
      break;
    case "act":
      setAct(msg.act);
      break;
    case "actev":
      dispatchActEvent(msg.id, msg.ev, msg.data, msg.from);
      break;
    case "join":
      app.addPlayer(msg.player);
      pushRemote(msg.player.id, msg.pose[1], msg.pose[2], msg.pose[3], msg.pose[4]);
      break;
    case "leave":
      app.removePlayer(msg.id);
      removeRemote(msg.id);
      break;
    case "poses": {
      const now = performance.now();
      const me = app.selfId;
      for (const [id, x, z, yaw, anim] of msg.list) if (id !== me) pushRemote(id, x, z, yaw, anim, now);
      break;
    }
    case "info":
      app.patchPlayer(msg.id, msg.patch);
      break;
    case "correct":
      setSelf(msg.x, msg.z);
      break;
    case "error":
      if (msg.code === "version") {
        wanted = false;
        app.setConn("error", msg.message);
      }
      break;
    case "pong": {
      // Relógio do servidor: vale a estimativa do ping mais rápido (metade da ida e volta).
      const rtt = performance.now() - msg.at;
      if (rtt >= 0 && rtt < bestRtt) {
        bestRtt = rtt;
        clockOffset = msg.serverTime + rtt / 2 - Date.now();
      }
      break;
    }
  }
}
