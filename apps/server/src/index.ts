import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { WebSocketServer } from "ws";
import { OfficeRoom } from "./room.ts";
import { Accounts } from "./auth/accounts.ts";
import { AUTH_REQUIRED, PUBLIC_URL, authRoutes, sessionIdFromCookie } from "./auth/routes.ts";

const PORT = Number(process.env.PORT ?? 2567);
const HOST = process.env.HOST ?? "0.0.0.0";
const startedAt = Date.now();

const room = new OfficeRoom();
await room.init();
room.start();

const app = new Hono();
const accounts = new Accounts(room.store);
app.route("/api", authRoutes(accounts, { removed: (email) => room.disconnectEmail(email) }));
app.get("/health", (c) => c.json({ ok: true, online: room.size, uptime: Math.round((Date.now() - startedAt) / 1000) }));

const server = serve({ fetch: app.fetch, port: PORT, hostname: HOST }, (info) => {
  console.log(`[servidor] login ${AUTH_REQUIRED ? "ligado" : "desligado (desenvolvimento)"}`);
  console.log(`[servidor] Infinity Space no ar em http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${info.port} · WebSocket em /ws`);
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname !== "/ws") {
    socket.destroy();
    return;
  }
  // Com login ligado: só entra com sessão válida e vindo do próprio app (evita sequestro do WebSocket).
  const email = accounts.sessionEmail(sessionIdFromCookie(req.headers.cookie));
  if (AUTH_REQUIRED) {
    const origin = req.headers.origin;
    const sameApp = !origin || origin === PUBLIC_URL || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    if (!email || !sameApp) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
  }
  const auth = email ? { email, name: accounts.user(email)?.name ?? email } : undefined;
  wss.handleUpgrade(req, socket, head, (ws) => room.accept(ws, auth));
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
