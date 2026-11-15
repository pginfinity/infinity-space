import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { WebSocketServer } from "ws";
import { OfficeRoom } from "./room.ts";

const PORT = Number(process.env.PORT ?? 2567);
const HOST = process.env.HOST ?? "0.0.0.0";
const startedAt = Date.now();

const room = new OfficeRoom();
await room.init();
room.start();

const app = new Hono();
app.get("/health", (c) => c.json({ ok: true, online: room.size, uptime: Math.round((Date.now() - startedAt) / 1000) }));

const server = serve({ fetch: app.fetch, port: PORT, hostname: HOST }, (info) => {
  console.log(`[servidor] Infinity Space no ar em http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${info.port} · WebSocket em /ws`);
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname !== "/ws") {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => room.accept(ws));
});

function shutdown(): void {
  console.log("[servidor] desligando…");
  room.stop();
  wss.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
