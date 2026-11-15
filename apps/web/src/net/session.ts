import { Packr } from "msgpackr";
import { PROTOCOL_VERSION, type ClientMsg, type InfoPatch, type ServerMsg } from "@infinity/world";
import { useApp } from "../state/store.ts";
import { clearRemote, pushRemote, removeRemote, self, setSelf } from "../world/registry.ts";

const packr = new Packr({ useRecords: false });

let socket: WebSocket | null = null;
let wanted = false;
let attempt = 0;
let retryTimer: number | undefined;
let pingTimer: number | undefined;
let everConnected = false;
let welcomed = false;

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

  ws.onclose = () => {
    window.clearInterval(pingTimer);
    if (socket !== ws) return;
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
      everConnected = true;
      attempt = 0;
      clearRemote();
      const now = performance.now();
      for (const [id, x, z, yaw, anim] of msg.poses) {
        if (id === msg.you) setSelf(x, z, yaw);
        else pushRemote(id, x, z, yaw, anim, now);
      }
      app.welcome(msg.you, msg.players);
      app.setConn("open");
      welcomed = true;
      break;
    }
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
    case "pong":
      break;
  }
}
