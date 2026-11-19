import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { Store } from "../store.ts";
import { Accounts } from "./accounts.ts";
import { authRoutes } from "./routes.ts";
import { outbox } from "./mail.ts";

process.env.ADMIN_EMAILS = "admin@empresa.com";
delete process.env.SMTP_URL;
delete process.env.SMTP_HOST;

const ORIGIN = { Origin: "http://localhost:5173", "Content-Type": "application/json" };

function setup() {
  const store = new Store(mkdtempSync(join(tmpdir(), "infinity-auth-")));
  const accounts = new Accounts(store);
  const removed: string[] = [];
  const app = authRoutes(accounts, { removed: (e) => removed.push(e) });
  return { app, accounts, removed };
}

type App = ReturnType<typeof setup>["app"];

const post = (app: App, path: string, body: unknown, headers: Record<string, string> = {}) =>
  app.request(path, { method: "POST", headers: { ...ORIGIN, ...headers }, body: JSON.stringify(body) });

/** Pede o link, pega o token do último e-mail e entra; devolve o cookie da sessão. */
async function login(app: App, email: string): Promise<string> {
  outbox.length = 0;
  const r = await post(app, "/auth/link", { email });
  expect(r.status).toBe(200);
  const mail = outbox.at(-1);
  expect(mail?.to).toBe(email);
  return enterWith(app, tokenOf(mail!.text));
}

function tokenOf(text: string): string {
  return /[?&]t=([\w-]+)/.exec(text)![1]!;
}

async function enterWith(app: App, token: string): Promise<string> {
  const r = await app.request(`/auth/entrar?t=${token}`);
  expect(r.status).toBe(302);
  expect(r.headers.get("location")).toBe("/");
  const cookie = r.headers.get("set-cookie")!;
  expect(cookie).toMatch(/HttpOnly/i);
  return cookie.split(";")[0]!;
}

describe("login por convite", () => {
  beforeEach(() => {
    outbox.length = 0;
  });

  it("e-mail sem convite recebe a mesma resposta, mas nenhum e-mail sai", async () => {
    const { app } = setup();
    const r = await post(app, "/auth/link", { email: "estranho@fora.com" });
    expect(r.status).toBe(200);
    expect(outbox.length).toBe(0);
  });

  it("admin entra pelo link, que só funciona uma vez", async () => {
    const { app } = setup();
    await post(app, "/auth/link", { email: "Admin@Empresa.com " });
    const token = tokenOf(outbox.at(-1)!.text);
    const cookie = await enterWith(app, token);
    const me = await app.request("/me", { headers: { Cookie: cookie } });
    expect(await me.json()).toMatchObject({ email: "admin@empresa.com", role: "admin" });
    const again = await app.request(`/auth/entrar?t=${token}`);
    expect(again.headers.get("location")).toBe("/?login=expirado");
  });

  it("convite: a pessoa entra pelo link do e-mail e vira membro", async () => {
    const { app } = setup();
    const admin = await login(app, "admin@empresa.com");
    outbox.length = 0;
    const inv = await post(app, "/admin/convites", { emails: ["bruno.lima@empresa.com", "invalido"] }, { Cookie: admin });
    expect(await inv.json()).toEqual({ invited: ["bruno.lima@empresa.com"] });
    expect(outbox.at(-1)!.subject).toMatch(/convidado/);
    const bruno = await enterWith(app, tokenOf(outbox.at(-1)!.text));
    const me = await (await app.request("/me", { headers: { Cookie: bruno } })).json();
    expect(me).toMatchObject({ email: "bruno.lima@empresa.com", name: "Bruno Lima", role: "member" });
    // Membro não administra.
    expect((await app.request("/admin/pessoas", { headers: { Cookie: bruno } })).status).toBe(403);
    const list = (await (await app.request("/admin/pessoas", { headers: { Cookie: admin } })).json()) as { users: { email: string }[] };
    expect(list.users.map((u) => u.email).sort()).toEqual(["admin@empresa.com", "bruno.lima@empresa.com"]);
  });

  it("perfil: nome e visual são limpos e salvos na conta", async () => {
    const { app } = setup();
    const admin = await login(app, "admin@empresa.com");
    const r = await app.request("/me", { method: "PATCH", headers: { ...ORIGIN, Cookie: admin }, body: JSON.stringify({ name: "  Ana\u0007 Souza ", look: { skin: "#FFDDCC", hair: 999, topColor: "vermelho" } }) });
    const me = (await r.json()) as { name: string; look: { skin: string; hair: number } };
    expect(me.name).toBe("Ana Souza");
    expect(me.look.skin).toBe("#FFDDCC");
    expect(me.look.hair).not.toBe(999);
  });

  it("remover a pessoa derruba a sessão dela", async () => {
    const { app, removed } = setup();
    const admin = await login(app, "admin@empresa.com");
    await post(app, "/admin/convites", { emails: ["caio@empresa.com"] }, { Cookie: admin });
    const caio = await enterWith(app, tokenOf(outbox.at(-1)!.text));
    const del = await app.request("/admin/pessoas/caio%40empresa.com", { method: "DELETE", headers: { ...ORIGIN, Cookie: admin } });
    expect(del.status).toBe(200);
    expect(removed).toEqual(["caio@empresa.com"]);
    expect((await app.request("/me", { headers: { Cookie: caio } })).status).toBe(401);
  });

  it("pedidos de outra origem são recusados", async () => {
    const { app } = setup();
    const r = await app.request("/auth/link", { method: "POST", headers: { Origin: "https://malicioso.example", "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@empresa.com" }) });
    expect(r.status).toBe(403);
  });

  it("limita pedidos de link repetidos", async () => {
    const { app } = setup();
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await post(app, "/auth/link", { email: "admin@empresa.com" })).status);
    expect(codes.slice(0, 5).every((c) => c === 200)).toBe(true);
    expect(codes[5]).toBe(429);
  });

  it("sair encerra a sessão", async () => {
    const { app } = setup();
    const admin = await login(app, "admin@empresa.com");
    await app.request("/auth/sair", { method: "POST", headers: { ...ORIGIN, Cookie: admin } });
    expect((await app.request("/me", { headers: { Cookie: admin } })).status).toBe(401);
  });
});

describe("login com senha", () => {
  const senha = (app: App, body: unknown) => post(app, "/auth/senha", body);

  it("admin define a senha no primeiro acesso e depois entra com ela", async () => {
    const { app, accounts } = setup();
    expect((await senha(app, { email: "admin@empresa.com", password: "segredo-123" })).status).toBe(409);
    expect((await senha(app, { email: "admin@empresa.com", password: "curta", confirm: "curta" })).status).toBe(400);
    expect((await senha(app, { email: "admin@empresa.com", password: "segredo-123", confirm: "outra-coisa" })).status).toBe(400);
    const first = await senha(app, { email: "admin@empresa.com", password: "segredo-123", confirm: "segredo-123" });
    expect(first.status).toBe(200);
    expect(JSON.stringify(accounts.user("admin@empresa.com"))).not.toContain("segredo-123");
    expect((await senha(app, { email: "admin@empresa.com", password: "errada-000" })).status).toBe(401);
    const ok = await senha(app, { email: "Admin@Empresa.com", password: "segredo-123" });
    expect(ok.status).toBe(200);
    const cookie = ok.headers.get("set-cookie")!.split(";")[0]!;
    expect(await (await app.request("/me", { headers: { Cookie: cookie } })).json()).toMatchObject({ role: "admin" });
    // Com senha definida, não dá para "definir de novo".
    expect((await senha(app, { email: "admin@empresa.com", password: "tomar-conta-1", confirm: "tomar-conta-1" })).status).toBe(401);
  });

  it("e-mail sem convite não cria senha", async () => {
    const { app } = setup();
    expect((await senha(app, { email: "estranho@fora.com", password: "qualquer-1", confirm: "qualquer-1" })).status).toBe(401);
  });

  it("admin cria usuário, redefine a senha e só admin gerencia", async () => {
    const { app, removed } = setup();
    const admin = await login(app, "admin@empresa.com");
    const criar = (body: unknown, cookie = admin) => post(app, "/admin/usuarios", body, { Cookie: cookie });
    expect((await criar({ email: "dani@empresa.com", name: "Dani Souza", role: "member" })).status).toBe(200);
    expect((await criar({ email: "dani@empresa.com" })).status).toBe(409);
    const list = (await (await app.request("/admin/pessoas", { headers: { Cookie: admin } })).json()) as { users: { email: string; name: string; password: boolean }[] };
    expect(list.users.find((u) => u.email === "dani@empresa.com")).toMatchObject({ name: "Dani Souza", password: false });

    const dani1 = await senha(app, { email: "dani@empresa.com", password: "senha-da-dani", confirm: "senha-da-dani" });
    const dani = dani1.headers.get("set-cookie")!.split(";")[0]!;
    expect((await criar({ email: "outro@empresa.com" }, dani)).status).toBe(403);
    expect((await post(app, "/admin/pessoas/dani%40empresa.com/senha", {}, { Cookie: dani })).status).toBe(403);

    expect((await post(app, "/admin/pessoas/dani%40empresa.com/senha", {}, { Cookie: admin })).status).toBe(200);
    expect(removed).toContain("dani@empresa.com");
    expect((await app.request("/me", { headers: { Cookie: dani } })).status).toBe(401);
    expect((await senha(app, { email: "dani@empresa.com", password: "senha-da-dani" })).status).toBe(409);
  });

  it("limita tentativas de senha", async () => {
    const { app } = setup();
    await senha(app, { email: "admin@empresa.com", password: "segredo-123", confirm: "segredo-123" });
    const codes: number[] = [];
    for (let i = 0; i < 10; i++) codes.push((await senha(app, { email: "admin@empresa.com", password: `errada-${i}xx` })).status);
    expect(codes.at(-1)).toBe(429);
  });
});
