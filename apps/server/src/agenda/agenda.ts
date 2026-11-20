import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { Hono, type Context } from "hono";
import { agendaBookings, agendaFromGoogle, type AgendaEvent, type AgendaView, type GoogleEvent, type Zone } from "@infinity/world";
import type { Store } from "../store.ts";
import { PUBLIC_URL, sameAppOrigin } from "../auth/routes.ts";

/**
 * Google Agenda (opcional): cada pessoa conecta a própria agenda, só com leitura de eventos.
 * Configuração (variáveis de ambiente; passo a passo em docs/infra.md):
 * - GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET do app OAuth do Google Cloud (tipo "interno" no Workspace);
 * - o endereço de volta `${PUBLIC_URL}/api/agenda/volta` cadastrado nesse app.
 * Sem as duas variáveis a agenda some do app.
 *
 * O token de cada pessoa fica cifrado (AES-GCM, chave tirada do secret) em DATA_DIR/agenda/tokens.json:
 * quem lê só os arquivos do servidor não chega à agenda de ninguém. Trocar o secret pede reconexão.
 * Os eventos ficam só na memória.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";
const TOKENS = "agenda/tokens";
const FORM = { "Content-Type": "application/x-www-form-urlencoded" };
const H = 60 * 60_000;
/** De quanto em quanto tempo o servidor relê as agendas conectadas. */
export const AGENDA_REFRESH_MS = 3 * 60_000;
/** Tempo para a pessoa autorizar no Google e voltar. */
const STATE_MS = 10 * 60_000;

const OFF: AgendaView = { configured: false, connected: false, events: [], rooms: [] };

export const agendaConfigured = (): boolean => !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
const redirectUri = () => `${PUBLIC_URL}/api/agenda/volta`;

const key = () => createHash("sha256").update(`infinity-space/agenda:${process.env.GOOGLE_CLIENT_SECRET}`).digest();

function seal(text: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

function unseal(sealed: string): string | null {
  try {
    const [iv, tag, data] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
    const d = createDecipheriv("aes-256-gcm", key(), iv!);
    d.setAuthTag(tag!);
    return Buffer.concat([d.update(data!), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

interface TokenReply {
  ok: boolean;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
}

export class Agenda {
  private readonly events = new Map<string, AgendaEvent[]>();
  private readonly access = new Map<string, { token: string; exp: number }>();
  private readonly states = new Map<string, { email: string; exp: number }>();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly store: Store,
    private readonly zones: readonly Zone[],
    private readonly nameOf: (email: string) => string,
  ) {}

  private tokens(): Record<string, string> {
    return this.store.get<Record<string, string>>(TOKENS, {});
  }

  connected(email: string): boolean {
    return !!this.tokens()[email];
  }

  /** Endereço do Google para a pessoa autorizar; o `state` amarra a volta à sessão dela. */
  authUrl(email: string): string {
    const now = Date.now();
    for (const [k, s] of this.states) if (s.exp < now) this.states.delete(k);
    const state = randomBytes(24).toString("base64url");
    this.states.set(state, { email, exp: now + STATE_MS });
    const q = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: redirectUri(),
      response_type: "code",
      scope: SCOPE,
      access_type: "offline",
      prompt: "consent",
      login_hint: email,
      state,
    });
    return `${AUTH_URL}?${q}`;
  }

  /** Volta do Google: confere o `state`, troca o código pelo token e guarda (cifrado). */
  async finish(email: string, state: string, code: string): Promise<boolean> {
    const s = this.states.get(state);
    this.states.delete(state);
    if (!s || s.exp < Date.now() || s.email !== email || !code) return false;
    const r = await this.tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri() });
    if (!r.ok || !r.refresh_token) return false;
    this.store.set(TOKENS, { ...this.tokens(), [email]: seal(r.refresh_token) });
    if (r.access_token) this.access.set(email, { token: r.access_token, exp: Date.now() + (r.expires_in ?? 3600) * 1000 });
    await this.refresh(email).catch((e) => console.error("[agenda] falha ao ler a agenda:", (e as Error).message));
    return true;
  }

  /** Desconecta: apaga o token daqui e revoga no Google. */
  async disconnect(email: string): Promise<void> {
    const sealed = this.tokens()[email];
    this.forget(email);
    const token = sealed ? unseal(sealed) : null;
    if (token) await fetch(REVOKE_URL, { method: "POST", headers: FORM, body: new URLSearchParams({ token }) }).catch(() => undefined);
  }

  private forget(email: string): void {
    const { [email]: _, ...rest } = this.tokens();
    this.store.set(TOKENS, rest);
    this.events.delete(email);
    this.access.delete(email);
  }

  /** O que a pessoa vê: os próprios eventos e as reservas de sala de todo mundo (sem título). */
  view(email: string | null | undefined): AgendaView {
    if (!agendaConfigured() || !email) return OFF;
    const people = Object.keys(this.tokens()).map((e) => ({ name: this.nameOf(e), events: this.events.get(e) ?? [] }));
    return { configured: true, connected: this.connected(email), events: this.events.get(email) ?? [], rooms: agendaBookings(people, Date.now()) };
  }

  /** Relê os eventos de agora até o fim do dia (janela de 6 h para trás e 18 h para frente). */
  async refresh(email: string): Promise<void> {
    const token = await this.accessToken(email);
    if (!token) return;
    const now = Date.now();
    const q = new URLSearchParams({
      singleEvents: "true",
      orderBy: "startTime",
      timeMin: new Date(now - 6 * H).toISOString(),
      timeMax: new Date(now + 18 * H).toISOString(),
      maxResults: "100",
      // Só a própria pessoa na lista de convidados (para saber se ela recusou).
      maxAttendees: "1",
      fields: "items(id,summary,location,status,transparency,eventType,start,end,hangoutLink,conferenceData/entryPoints(entryPointType,uri),attendees(self,responseStatus))",
    });
    const r = await fetch(`${EVENTS_URL}?${q}`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.status === 401) {
      this.access.delete(email);
      return;
    }
    if (!r.ok) throw new Error(`Calendar respondeu ${r.status}`);
    const body = (await r.json()) as { items?: GoogleEvent[] };
    this.events.set(email, agendaFromGoogle(body.items ?? [], this.zones));
  }

  private async accessToken(email: string): Promise<string | null> {
    const a = this.access.get(email);
    if (a && a.exp - 60_000 > Date.now()) return a.token;
    const sealed = this.tokens()[email];
    const refresh = sealed ? unseal(sealed) : null;
    if (!refresh) return null;
    const r = await this.tokenRequest({ grant_type: "refresh_token", refresh_token: refresh });
    if (!r.ok || !r.access_token) {
      // A pessoa tirou o acesso no Google (ou o token venceu): volta a "não conectada".
      if (r.error === "invalid_grant") this.forget(email);
      return null;
    }
    this.access.set(email, { token: r.access_token, exp: Date.now() + (r.expires_in ?? 3600) * 1000 });
    return r.access_token;
  }

  private async tokenRequest(params: Record<string, string>): Promise<TokenReply> {
    const r = await fetch(TOKEN_URL, {
      method: "POST",
      headers: FORM,
      body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...params }),
    });
    const body = (await r.json().catch(() => ({}))) as Omit<TokenReply, "ok">;
    return { ...body, ok: r.ok };
  }

  async refreshAll(): Promise<void> {
    for (const email of Object.keys(this.tokens())) await this.refresh(email).catch((e) => console.error("[agenda] falha ao ler a agenda:", (e as Error).message));
  }

  start(): void {
    if (!agendaConfigured() || this.timer) return;
    void this.refreshAll();
    this.timer = setInterval(() => void this.refreshAll(), AGENDA_REFRESH_MS);
    this.timer.unref();
  }
}

export function agendaRoutes(agenda: Agenda, sessionEmail: (c: Context) => string | null | undefined): Hono {
  const app = new Hono();

  app.get("/", (c) => c.json(agenda.view(sessionEmail(c))));

  app.get("/conectar", (c) => {
    const email = sessionEmail(c);
    if (!agendaConfigured() || !email) return c.redirect("/?agenda=erro");
    return c.redirect(agenda.authUrl(email));
  });

  app.get("/volta", async (c) => {
    const email = sessionEmail(c);
    const state = c.req.query("state") ?? "";
    if (!email || c.req.query("error")) return c.redirect("/?agenda=cancelada");
    const ok = await agenda.finish(email, state, c.req.query("code") ?? "").catch(() => false);
    return c.redirect(ok ? "/?agenda=conectada" : "/?agenda=erro");
  });

  app.post("/desconectar", async (c) => {
    if (!sameAppOrigin(c.req.header("origin"))) return c.json({ error: "origem" }, 403);
    const email = sessionEmail(c);
    if (!email) return c.json({ error: "sessao" }, 401);
    await agenda.disconnect(email);
    return c.json(agenda.view(email));
  });

  return app;
}
