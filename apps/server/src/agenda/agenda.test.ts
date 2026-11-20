import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildStationMap } from "@infinity/world";
import { Store } from "../store.ts";
import { Agenda, agendaRoutes } from "./agenda.ts";

const zones = buildStationMap().zones;
const NAMES: Record<string, string> = { "ana@empresa.com": "Ana", "bruno@empresa.com": "Bruno" };

/** Google de mentira: token, eventos e revogação; anota os pedidos. */
function fakeGoogle(opts: { refresh?: "ok" | "invalid" } = {}) {
  const calls: Array<{ url: string; body: string; auth: string | null }> = [];
  const soon = new Date(Date.now() + 60 * 60_000).toISOString();
  const now = new Date(Date.now() - 5 * 60_000).toISOString();
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const body = init.body ? String(init.body) : "";
    calls.push({ url, body, auth: new Headers(init.headers).get("authorization") });
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      if (body.includes("grant_type=refresh_token") && opts.refresh === "invalid") return Response.json({ error: "invalid_grant" }, { status: 400 });
      return Response.json({ access_token: "acesso-1", refresh_token: "renovar-segredo", expires_in: 3600 });
    }
    if (url.startsWith("https://www.googleapis.com/calendar/v3/")) {
      return Response.json({ items: [{ id: "ev1", summary: "Plano trimestral", location: "Sala Eclipse", start: { dateTime: now }, end: { dateTime: soon }, hangoutLink: "https://meet.google.com/abc-defg-hij" }] });
    }
    if (url.startsWith("https://oauth2.googleapis.com/revoke")) return new Response("");
    return new Response("?", { status: 404 });
  });
  return calls;
}

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "infinity-agenda-"));
  const store = new Store(dir);
  const agenda = new Agenda(store, zones, (e) => NAMES[e] ?? e);
  const app = agendaRoutes(agenda, (c) => c.req.header("x-email"));
  return { dir, store, agenda, app };
}

/** Faz o caminho completo: /conectar → Google → /volta. */
async function connect(app: ReturnType<typeof setup>["app"], email: string) {
  const go = await app.request("/conectar", { headers: { "x-email": email } });
  const google = new URL(go.headers.get("location")!);
  const back = await app.request(`/volta?code=codigo&state=${google.searchParams.get("state")}`, { headers: { "x-email": email } });
  return { google, back: back.headers.get("location") };
}

beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = "cliente.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET = "segredo-do-app";
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
});

describe("agenda do Google", () => {
  it("sem o app do Google configurado, some (e não conecta)", async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    const { app } = setup();
    expect(await (await app.request("/", { headers: { "x-email": "ana@empresa.com" } })).json()).toEqual({ configured: false, connected: false, events: [], rooms: [] });
    expect((await app.request("/conectar", { headers: { "x-email": "ana@empresa.com" } })).headers.get("location")).toBe("/?agenda=erro");
  });

  it("conecta, guarda o token cifrado e mostra o título só para a dona da agenda", async () => {
    const calls = fakeGoogle();
    const { app, agenda, store, dir } = setup();
    const { google, back } = await connect(app, "ana@empresa.com");
    expect(google.origin + google.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(google.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/calendar.events.readonly");
    expect(google.searchParams.get("redirect_uri")).toBe("http://localhost:5173/api/agenda/volta");
    expect(google.searchParams.get("access_type")).toBe("offline");
    expect(back).toBe("/?agenda=conectada");
    expect(calls.find((c) => c.url.includes("/calendar/"))?.auth).toBe("Bearer acesso-1");

    const ana = agenda.view("ana@empresa.com");
    expect(ana.connected).toBe(true);
    expect(ana.events).toMatchObject([{ id: "ev1", title: "Plano trimestral", zone: "eclipse", meet: "https://meet.google.com/abc-defg-hij" }]);
    // Quem não conectou vê só a reserva da sala, sem o título.
    const bruno = agenda.view("bruno@empresa.com");
    expect(bruno).toMatchObject({ configured: true, connected: false, events: [] });
    expect(bruno.rooms).toEqual([{ zone: "eclipse", start: ana.events[0]!.start, end: ana.events[0]!.end, by: "Ana" }]);
    expect(JSON.stringify(bruno)).not.toContain("Plano trimestral");

    store.flush();
    const saved = readFileSync(join(dir, "agenda/tokens.json"), "utf8");
    expect(saved).toContain("ana@empresa.com");
    expect(saved).not.toContain("renovar-segredo");
  });

  it("a volta do Google só vale para quem pediu e uma vez só", async () => {
    fakeGoogle();
    const { app, agenda } = setup();
    const go = await app.request("/conectar", { headers: { "x-email": "ana@empresa.com" } });
    const state = new URL(go.headers.get("location")!).searchParams.get("state");
    const other = await app.request(`/volta?code=c&state=${state}`, { headers: { "x-email": "bruno@empresa.com" } });
    expect(other.headers.get("location")).toBe("/?agenda=erro");
    const again = await app.request(`/volta?code=c&state=${state}`, { headers: { "x-email": "ana@empresa.com" } });
    expect(again.headers.get("location")).toBe("/?agenda=erro");
    expect(agenda.connected("ana@empresa.com")).toBe(false);
    expect((await app.request("/volta?error=access_denied", { headers: { "x-email": "ana@empresa.com" } })).headers.get("location")).toBe("/?agenda=cancelada");
  });

  it("acesso tirado no Google: volta a não conectada", async () => {
    fakeGoogle();
    const { app, store, dir } = setup();
    await connect(app, "ana@empresa.com");
    store.flush();
    // Servidor reiniciado (sem o token de acesso na memória) e o Google recusando a renovação.
    fakeGoogle({ refresh: "invalid" });
    const fresh = new Agenda(new Store(dir), zones, (e) => NAMES[e] ?? e);
    await fresh.refreshAll();
    expect(fresh.connected("ana@empresa.com")).toBe(false);
  });

  it("desconectar apaga o token, revoga no Google e exige a origem do app", async () => {
    const calls = fakeGoogle();
    const { app, agenda } = setup();
    await connect(app, "ana@empresa.com");
    const cross = await app.request("/desconectar", { method: "POST", headers: { "x-email": "ana@empresa.com", Origin: "https://outro.site" } });
    expect(cross.status).toBe(403);
    const r = await app.request("/desconectar", { method: "POST", headers: { "x-email": "ana@empresa.com", Origin: "http://localhost:5173" } });
    expect(await r.json()).toMatchObject({ connected: false, events: [], rooms: [] });
    expect(agenda.connected("ana@empresa.com")).toBe(false);
    expect(calls.find((c) => c.url.includes("/revoke"))?.body).toBe("token=renovar-segredo");
  });
});
