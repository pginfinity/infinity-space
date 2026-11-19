import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { cleanLook, cleanName } from "../clean.ts";
import { Accounts, INVITE_LINK_MS, MIN_PASSWORD, SESSION_MS, cleanEmail, type Role } from "./accounts.ts";
import { linkMail, mailConfigured, outbox, sendMail } from "./mail.ts";

/**
 * Login por convite com link mágico (sem senha).
 *
 * Configuração (variáveis de ambiente):
 * - AUTH_REQUIRED=true liga o login (em desenvolvimento fica desligado e vale o atalho ?nome=);
 * - PUBLIC_URL: endereço do app (ex.: https://space.ai-infinity.io), usado nos links e no cookie seguro;
 * - ADMIN_EMAILS: quem administra (convida e remove pessoas), separado por vírgula;
 * - ALLOWED_DOMAINS: domínios que entram sem convite (opcional);
 * - SMTP_* e MAIL_FROM: envio dos e-mails (ver mail.ts).
 */

export const AUTH_REQUIRED = process.env.AUTH_REQUIRED === "true";
export const PUBLIC_URL = (process.env.PUBLIC_URL ?? "http://localhost:5173").replace(/\/$/, "");
export const COOKIE = "is_sessao";
const SECURE = PUBLIC_URL.startsWith("https://");

/** Sessão a partir do cabeçalho Cookie (usado no WebSocket). */
export function sessionIdFromCookie(header: string | undefined): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === COOKIE) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

/** Pedido que muda algo vindo do próprio app? (proteção contra CSRF, além do SameSite) */
export function sameAppOrigin(origin: string | undefined): boolean {
  return !origin || origin === PUBLIC_URL || (!SECURE && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
}

/** IP de quem pediu (atrás do Caddy e da Cloudflare), para limites de frequência. */
export const clientIp = (c: Context): string => c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("cf-connecting-ip") ?? "local";

/** Limite simples por chave: N tentativas por janela. */
export class Limiter {
  private readonly hits = new Map<string, number[]>();
  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}
  allow(key: string): boolean {
    const now = Date.now();
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (list.length >= this.max) {
      this.hits.set(key, list);
      return false;
    }
    list.push(now);
    this.hits.set(key, list);
    return true;
  }
}

export interface AuthEvents {
  /** Uma pessoa foi removida: derruba as conexões dela. */
  removed(email: string): void;
}

export function authRoutes(accounts: Accounts, events: AuthEvents): Hono {
  const app = new Hono();
  const byEmail = new Limiter(5, 15 * 60 * 1000);
  const byIp = new Limiter(20, 15 * 60 * 1000);

  const sessionEmail = (c: Context) => accounts.sessionEmail(getCookie(c, COOKIE));
  const ip = clientIp;

  // Pedidos que mudam algo só valem vindos do próprio app (proteção contra CSRF, além do SameSite).
  app.use("*", async (c, next) => {
    if (c.req.method !== "GET" && c.req.method !== "HEAD" && !sameAppOrigin(c.req.header("origin"))) return c.json({ error: "origem" }, 403);
    await next();
  });

  app.get("/config", (c) => c.json({ auth: AUTH_REQUIRED }));

  // Só nos testes de ponta a ponta (E2E_MAILBOX=true e sem SMTP): o último e-mail "enviado".
  if (process.env.E2E_MAILBOX === "true" && !mailConfigured()) {
    app.get("/dev/caixa", (c) => c.json(outbox.at(-1) ?? null));
  }

  /** Pede o link de entrada. Responde igual para qualquer e-mail (não revela quem tem conta). */
  app.post("/auth/link", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { email?: unknown };
    const email = cleanEmail(body.email);
    if (!email) return c.json({ error: "email" }, 400);
    if (!byIp.allow(ip(c)) || !byEmail.allow(email)) return c.json({ error: "muitas-tentativas" }, 429);
    if (accounts.canEnter(email)) {
      const token = accounts.createLink(email);
      await sendMail(linkMail(email, `${PUBLIC_URL}/api/auth/entrar?t=${token}`, "login")).catch((e) => console.error("[login] falha no e-mail:", e));
    } else {
      console.log(`[login] pedido de link para e-mail sem convite (ignorado)`);
    }
    return c.json({ ok: true, sent: true });
  });

  const startSession = (c: Context, email: string) =>
    setCookie(c, COOKIE, accounts.createSession(email), { httpOnly: true, secure: SECURE, sameSite: "Lax", path: "/", maxAge: Math.floor(SESSION_MS / 1000) });

  /** Link do e-mail: entra, cria a sessão e volta para o app. */
  app.get("/auth/entrar", (c) => {
    const email = accounts.consumeLink(c.req.query("t") ?? "");
    if (!email) return c.redirect("/?login=expirado");
    startSession(c, email);
    return c.redirect("/");
  });

  /**
   * Entrar com e-mail e senha. Quem ainda não tem senha (primeiro acesso ou senha redefinida)
   * recebe 409 "primeiro-acesso" e manda de novo com `confirm` igual à senha para criá-la.
   */
  const byEmailPw = new Limiter(10, 15 * 60 * 1000);
  app.post("/auth/senha", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { email?: unknown; password?: unknown; confirm?: unknown };
    const email = cleanEmail(body.email);
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password || password.length > 200) return c.json({ error: "email" }, 400);
    if (!byIp.allow(ip(c)) || !byEmailPw.allow(email)) return c.json({ error: "muitas-tentativas" }, 429);
    if (accounts.canSetFirstPassword(email)) {
      if (body.confirm === undefined) return c.json({ error: "primeiro-acesso" }, 409);
      if (password.length < MIN_PASSWORD) return c.json({ error: "senha-curta" }, 400);
      if (body.confirm !== password) return c.json({ error: "confirmacao" }, 400);
      accounts.setPassword(email, password);
    } else if (!accounts.checkPassword(email, password)) {
      return c.json({ error: "senha" }, 401);
    }
    startSession(c, email);
    return c.json({ ok: true });
  });

  app.get("/me", (c) => {
    const email = sessionEmail(c);
    if (!email) return c.json({ error: "sessao" }, 401);
    const u = accounts.user(email)!;
    return c.json({ email, name: u.name, look: u.look ?? null, role: accounts.roleOf(email) });
  });

  app.patch("/me", async (c) => {
    const email = sessionEmail(c);
    if (!email) return c.json({ error: "sessao" }, 401);
    const body = (await c.req.json().catch(() => ({}))) as { name?: unknown; look?: unknown };
    const patch: { name?: string; look?: ReturnType<typeof cleanLook> } = {};
    if (typeof body.name === "string" && body.name.trim()) patch.name = cleanName(body.name);
    if (body.look) patch.look = cleanLook(body.look);
    const u = accounts.updateProfile(email, patch)!;
    return c.json({ email, name: u.name, look: u.look ?? null, role: accounts.roleOf(email) });
  });

  app.post("/auth/sair", (c) => {
    accounts.endSession(getCookie(c, COOKIE));
    deleteCookie(c, COOKIE, { path: "/" });
    return c.json({ ok: true });
  });

  // ---- administração ----

  const admin = (c: Context): string | null => {
    const email = sessionEmail(c);
    return email && accounts.roleOf(email) === "admin" ? email : null;
  };

  app.get("/admin/pessoas", (c) => {
    if (!admin(c)) return c.json({ error: "admin" }, 403);
    const users = Object.values(accounts.users()).map((u) => ({ email: u.email, name: u.name, role: accounts.roleOf(u.email), password: !!u.pw }));
    const invites = Object.values(accounts.invites()).map((i) => ({ email: i.email, role: i.role, at: i.at }));
    return c.json({ users, invites, mail: mailConfigured() });
  });

  /** Convida uma lista de e-mails: cada um recebe um link de entrada que vale 7 dias. */
  app.post("/admin/convites", async (c) => {
    const by = admin(c);
    if (!by) return c.json({ error: "admin" }, 403);
    const body = (await c.req.json().catch(() => ({}))) as { emails?: unknown; role?: unknown };
    const role: Role = body.role === "admin" ? "admin" : "member";
    const list = Array.isArray(body.emails) ? body.emails : [];
    const emails = [...new Set(list.map(cleanEmail).filter((e): e is string => !!e))].slice(0, 50);
    const byName = accounts.user(by)?.name;
    const invited: string[] = [];
    for (const email of emails) {
      if (accounts.user(email)) continue;
      accounts.invite(email, by, role);
      const token = accounts.createLink(email, INVITE_LINK_MS);
      await sendMail(linkMail(email, `${PUBLIC_URL}/api/auth/entrar?t=${token}`, "invite", byName)).catch((e) => console.error("[login] falha no convite:", e));
      invited.push(email);
    }
    return c.json({ invited });
  });

  /** Cria a conta direto (sem e-mail). A pessoa define a senha no primeiro acesso. */
  app.post("/admin/usuarios", async (c) => {
    if (!admin(c)) return c.json({ error: "admin" }, 403);
    const body = (await c.req.json().catch(() => ({}))) as { email?: unknown; name?: unknown; role?: unknown };
    const email = cleanEmail(body.email);
    if (!email) return c.json({ error: "email" }, 400);
    if (accounts.user(email)) return c.json({ error: "existe" }, 409);
    const name = typeof body.name === "string" && body.name.trim() ? cleanName(body.name) : undefined;
    accounts.ensureUser(email, name, body.role === "admin" ? "admin" : "member");
    return c.json({ ok: true });
  });

  /** Redefine a senha: apaga a atual e derruba as sessões; a pessoa cria outra no próximo acesso. */
  app.post("/admin/pessoas/:email/senha", (c) => {
    if (!admin(c)) return c.json({ error: "admin" }, 403);
    const email = cleanEmail(decodeURIComponent(c.req.param("email")));
    if (!email || !accounts.user(email)) return c.json({ error: "email" }, 400);
    accounts.clearPassword(email);
    events.removed(email);
    return c.json({ ok: true });
  });

  app.delete("/admin/pessoas/:email", (c) => {
    const by = admin(c);
    if (!by) return c.json({ error: "admin" }, 403);
    const email = cleanEmail(decodeURIComponent(c.req.param("email")));
    if (!email || email === by) return c.json({ error: "email" }, 400);
    accounts.remove(email);
    events.removed(email);
    return c.json({ ok: true });
  });

  return app;
}
