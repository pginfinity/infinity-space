import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync } from "node:fs";
import { relative, resolve } from "node:path";
import { WebSocketServer } from "ws";
import { OfficeRoom } from "./room.ts";
import { Accounts, cleanEmail } from "./auth/accounts.ts";
import { AUTH_REQUIRED, PUBLIC_URL, authRoutes, sessionIdFromCookie } from "./auth/routes.ts";
import { PHOTOWALL_API, PHOTOWALL_ID } from "@infinity/world";
import { photoWallRoutes } from "./activities/escritorio/photowall-http.ts";
import type { PhotoWallActivity } from "./activities/escritorio/photowall.ts";

const PORT = Number(process.env.PORT ?? 2567);
const HOST = process.env.HOST ?? "0.0.0.0";
const startedAt = Date.now();

const room = new OfficeRoom();
await room.init();
room.start();
// Sala de treino do tutorial (/ws?sala=treino): o mesmo mapa, sem afetar o escritório.
const training = new OfficeRoom(true);
await training.init();
training.start();

const app = new Hono();
const accounts = new Accounts(room.store);
// Superadmin da casa (SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD no .env): ganha a senha só enquanto não tiver uma.
const seed = cleanEmail(process.env.SEED_ADMIN_EMAIL);
if (seed && process.env.SEED_ADMIN_PASSWORD && !accounts.hasPassword(seed)) {
  accounts.ensureUser(seed, undefined, "admin");
  accounts.setPassword(seed, process.env.SEED_ADMIN_PASSWORD);
}
app.route(
  "/api",
  authRoutes(accounts, {
    removed: (email) => {
      room.disconnectEmail(email);
      training.disconnectEmail(email);
    },
  }),
);
// Mural de fotos da copa: envio da foto da cabine e as imagens (ver activities/escritorio/photowall-http.ts).
app.route(
  PHOTOWALL_API,
  photoWallRoutes({
    wall: () => room.acts.get(PHOTOWALL_ID) as PhotoWallActivity | undefined,
    sessionEmail: (c) => accounts.sessionEmail(sessionIdFromCookie(c.req.header("cookie"))) ?? undefined,
    authRequired: AUTH_REQUIRED,
  }),
);
app.get("/health", (c) => c.json({ ok: true, online: room.size, uptime: Math.round((Date.now() - startedAt) / 1000) }));
app.all("/api/*", (c) => c.json({ error: "não encontrado" }, 404));
// Produção: o próprio servidor entrega o app compilado (apps/web/dist), com cache longo nos arquivos com hash.
const STATIC_DIR = process.env.STATIC_DIR ? resolve(process.env.STATIC_DIR) : null;
if (STATIC_DIR && existsSync(STATIC_DIR)) {
  const root = relative(process.cwd(), STATIC_DIR) || ".";
  app.use("/assets/*", async (c, next) => {
    await next();
    c.header("Cache-Control", "public, max-age=31536000, immutable");
  });
  app.use("*", serveStatic({ root }));
  // Qualquer outra rota de página volta para o app (ele decide o que mostrar).
  app.get("*", serveStatic({ root, path: "index.html" }));
}

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
  const target = url.searchParams.get("sala") === "treino" ? training : room;
  wss.handleUpgrade(req, socket, head, (ws) => target.accept(ws, auth));
});

function shutdown(): void {
  console.log("[servidor] desligando…");
  room.stop();
  training.stop();
  wss.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
