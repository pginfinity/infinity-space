import { devices } from "@playwright/test";
import { expect, test, type Page } from "./setup.ts";

/**
 * Primeiros passos na sala de treino: o Orbi se apresenta, leva a pessoa para uma sala à parte (o mesmo
 * mapa; quem está no escritório não vê nem ouve) e a lista se marca sozinha conforme ela pratica
 * (andar, microfone, chat, emote, sentar, foco, chamar, tela, jogo, 2D/3D). Dá para pular, voltar a um
 * passo, sair e retomar. Ao voltar, a pessoa reaparece onde estava, disponível. A tecla ? abre os atalhos.
 * O atalho de desenvolvimento (?nome=) não abre o tutorial sozinho; &tutorial=1 força.
 */

interface Hook {
  store: { getState(): { selfId: string | null; players: Record<string, { name: string; status: string }>; games: Record<string, { kind: string; table: string }>; openGame(t: string | null): void } };
  self: { x: number; z: number; anim: string };
  walkTo(p: { x: number; z: number }): boolean;
  interact: { getState(): { target: { label: string } | null } };
  acts: { state: { getState(): { acts: Record<string, { state: unknown }> } } };
  media: { state: { getState(): { status: string; error: string | null; mic: boolean } } };
  world(): { map: { desks: Array<{ seat: { x: number; z: number } }> } };
}
type W = { __infinity: Hook };

const SHOTS = "test-results/screens";
const KEY = "infinity-space:primeiros-passos";

async function open(page: Page, query: string): Promise<void> {
  await page.goto(`/?${query}`);
  await page.waitForFunction(() => !!(window as unknown as Partial<W>).__infinity?.store.getState().selfId, null, { timeout: 30_000 });
}

const card = (p: Page) => p.getByRole("region", { name: "Primeiros passos" });
const progress = (p: Page) => card(p).getByText(/^\d+ de \d+$/);
const banner = (p: Page) => p.getByRole("status").filter({ hasText: "Sala de treino" });
/** Abre a busca (Ctrl+K) e espera o foco no campo. */
async function palette(p: Page): Promise<void> {
  await p.keyboard.press("Control+KeyK");
  await expect(p.getByRole("dialog", { name: "Buscar e comandos" }).getByRole("combobox")).toBeFocused();
}
const saved = (p: Page) => p.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "null") as { phase: string; done: string[] } | null, KEY);
/** Quem mais esta pessoa vê na sala. */
const others = (p: Page) =>
  p.evaluate(() => {
    const s = (window as unknown as W).__infinity.store.getState();
    return Object.values(s.players)
      .filter((x) => x !== s.players[s.selfId ?? ""])
      .map((x) => x.name);
  });
const pos = (p: Page) => p.evaluate(() => ({ x: (window as unknown as W).__infinity.self.x, z: (window as unknown as W).__infinity.self.z }));
const tourTarget = (p: Page) => p.locator("html");

test("sala de treino: pratica de verdade, sem atrapalhar o escritório, e volta para o mesmo lugar", async ({ browser }) => {
  test.setTimeout(300_000);
  // Bruno fica no escritório o tempo todo.
  const b = await (await browser.newContext()).newPage();
  await open(b, "nome=Bruno&lente=2d");
  const ctx = await browser.newContext();
  await ctx.grantPermissions(["microphone", "camera"]);
  const a = await ctx.newPage();
  await open(a, "nome=Ana&lente=2d&tutorial=1");
  await expect.poll(() => others(b), { timeout: 15_000 }).toContain("Ana");

  // Apresentação (oferecida, não forçada).
  await expect(card(a).getByText("Oi, Ana! Eu sou o Orbi.")).toBeVisible({ timeout: 10_000 });
  await a.waitForTimeout(500);
  await a.screenshot({ path: `${SHOTS}/tutorial-intro-2d.png` });
  const office = await pos(a);
  await card(a).getByRole("button", { name: "Vamos lá" }).click();
  await expect(progress(a)).toHaveText("0 de 10");
  expect((await saved(a))?.phase).toBe("steps");

  // Na sala de treino: a faixa avisa, e Ana e Bruno não se veem.
  await expect(banner(a)).toBeVisible();
  await expect.poll(() => others(b), { timeout: 15_000 }).not.toContain("Ana");
  await expect.poll(() => others(a), { timeout: 15_000 }).not.toContain("Bruno");

  // O Orbi vem dar boas-vindas (segue a Ana, na sala de treino).
  await expect
    .poll(() => a.evaluate(() => ((window as unknown as W).__infinity.acts.state.getState().acts.orbi?.state as { follow: { name: string } | null } | undefined)?.follow?.name ?? null), { timeout: 10_000 })
    .toBe("Ana");

  // Andar 4 m.
  const from = await pos(a);
  await a.evaluate((p) => (window as unknown as W).__infinity.walkTo({ x: p.x + 4, z: p.z }), from);
  await expect(progress(a)).toHaveText("1 de 10", { timeout: 15_000 });

  // Sair no meio e retomar: volta ao escritório (Bruno vê de novo) e a pílula leva de volta ao treino.
  await banner(a).getByRole("button", { name: "Voltar ao escritório" }).click();
  await expect(banner(a)).toBeHidden();
  await expect(a.getByRole("button", { name: "Abrir primeiros passos" })).toBeVisible();
  await expect.poll(() => others(b), { timeout: 15_000 }).toContain("Ana");
  await a.getByRole("button", { name: "Abrir primeiros passos" }).click();
  await expect(banner(a)).toBeVisible();
  await expect(progress(a)).toHaveText("1 de 10");
  await expect.poll(() => others(b), { timeout: 15_000 }).not.toContain("Ana");

  // Microfone: o botão fica destacado; M liga.
  await expect(tourTarget(a)).toHaveAttribute("data-tour", "mic");
  // Na falha, mostra o erro do LiveKit (sob carga a conexão pode cair por prazo).
  await expect.poll(() => a.evaluate(() => { const m = (window as unknown as W).__infinity.media.state.getState(); return m.status === "error" ? `error: ${m.error}` : m.status; }), { timeout: 30_000 }).toBe("on");
  await a.screenshot({ path: `${SHOTS}/tutorial-sala-treino-2d.png` });
  await a.keyboard.press("KeyM");
  await expect(progress(a)).toHaveText("2 de 10", { timeout: 20_000 });

  // Chat (C).
  await expect(tourTarget(a)).toHaveAttribute("data-tour", "chat");
  await a.keyboard.press("KeyC");
  await expect(progress(a)).toHaveText("3 de 10");
  // Fecha só com o campo já focado (senão o Esc chega antes e o "1" do emote vai parar no campo).
  const chat = a.getByRole("dialog", { name: "Chat" });
  await expect(chat.getByRole("textbox", { name: "Escrever mensagem" })).toBeFocused();
  await a.keyboard.press("Escape");
  await expect(chat).toBeHidden();

  // Emote (1).
  await expect(tourTarget(a)).toHaveAttribute("data-tour", "emote");
  await a.keyboard.press("Digit1");
  await expect(progress(a)).toHaveText("4 de 10", { timeout: 10_000 });

  // Sentar: anda até a cadeira mais perto e aperta E.
  const seat = await a.evaluate(() => {
    const h = (window as unknown as W).__infinity;
    const seats = h.world().map.desks.map((d) => d.seat);
    const s = seats.sort((p, q) => Math.hypot(p.x - h.self.x, p.z - h.self.z) - Math.hypot(q.x - h.self.x, q.z - h.self.z))[0]!;
    h.walkTo(s);
    return s;
  });
  await expect.poll(() => a.evaluate((s) => Math.hypot((window as unknown as W).__infinity.self.x - s.x, (window as unknown as W).__infinity.self.z - s.z), seat), { timeout: 30_000 }).toBeLessThan(0.8);
  await expect.poll(() => a.evaluate(() => (window as unknown as W).__infinity.interact.getState().target?.label ?? ""), { timeout: 10_000 }).toBe("Sentar");
  await a.keyboard.press("KeyE");
  await expect(progress(a)).toHaveText("5 de 10", { timeout: 10_000 });

  // Foco: em Áudio e vídeo, o status Foco.
  await expect(tourTarget(a)).toHaveAttribute("data-tour", "status");
  await a.getByRole("button", { name: "Áudio e vídeo" }).click();
  await a.getByRole("radio", { name: "Foco" }).click();
  // O status só muda com o eco do servidor; com a CPU cheia a página chegou a levar mais de 5 s.
  await expect(a.getByRole("radio", { name: "Foco" })).toHaveAttribute("aria-checked", "true", { timeout: 15_000 });
  await expect(progress(a)).toHaveText("6 de 10", { timeout: 10_000 });
  await a.getByRole("button", { name: "Áudio e vídeo" }).click();

  // Chamar: sozinha no treino, volta um passo, segue e pula.
  await expect(tourTarget(a)).toHaveAttribute("data-tour", "pessoas");
  await expect(card(a).getByText(/Se só você está treinando, pule este/)).toBeVisible();
  await card(a).getByRole("button", { name: "Voltar", exact: true }).click();
  await expect(card(a).getByText(/escolha Foco/)).toBeVisible();
  await expect(card(a).getByRole("button", { name: "Pular este" })).toHaveCount(0);
  await card(a).getByRole("button", { name: "Próximo" }).click();
  await expect(card(a).getByText(/Se só você está treinando, pule este/)).toBeVisible();
  await card(a).getByRole("button", { name: "Pular este" }).click();
  await expect(progress(a)).toHaveText("7 de 10");

  // Tela: pula (o navegador de teste não escolhe janela).
  await expect(tourTarget(a)).toHaveAttribute("data-tour", "tela");
  await card(a).getByRole("button", { name: "Pular este" }).click();
  await expect(progress(a)).toHaveText("8 de 10");

  // Jogo: abre uma mesa da sala de treino.
  await expect(tourTarget(a)).toHaveAttribute("data-tour", "mapa");
  await a.evaluate(() => {
    const s = (window as unknown as W).__infinity.store.getState();
    s.openGame(Object.values(s.games).find((g) => g.kind === "connect4")!.table);
  });
  await expect(progress(a)).toHaveText("9 de 10", { timeout: 10_000 });
  await a.getByRole("dialog", { name: "Lig 4" }).getByRole("button", { name: "Fechar (Esc)" }).click();

  // 2D/3D (L): terminou, ainda na sala de treino.
  await a.keyboard.press("KeyL");
  await expect(a.getByText("Pronto! Você já sabe o essencial.")).toBeVisible();
  expect((await saved(a))?.phase).toBe("done");
  await a.waitForSelector('[role="application"][data-ready="true"]', { timeout: 60_000 });
  await expect(banner(a)).toBeVisible();
  await a.waitForTimeout(600);
  await a.screenshot({ path: `${SHOTS}/tutorial-pronto-3d.png` });

  // Volta ao escritório: no mesmo lugar, disponível de novo, e o Bruno vê a Ana.
  await card(a).getByRole("button", { name: "Voltar ao escritório" }).click();
  await expect(banner(a)).toBeHidden();
  await expect(card(a)).toBeHidden();
  await expect.poll(() => others(b), { timeout: 15_000 }).toContain("Ana");
  const back = await pos(a);
  expect(Math.hypot(back.x - office.x, back.z - office.z)).toBeLessThan(1.5);
  await expect
    .poll(() => b.evaluate(() => Object.values((window as unknown as W).__infinity.store.getState().players).find((p) => p.name === "Ana")?.status ?? null), { timeout: 10_000 })
    .toBe("available");

  // Atalhos pela tecla ?.
  const sheet = a.getByRole("dialog", { name: "Atalhos" });
  await a.keyboard.press("?");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Sussurrar para quem está mais perto (segure)")).toBeVisible();
  await a.waitForTimeout(300);
  await a.screenshot({ path: `${SHOTS}/tutorial-atalhos.png` });
  await a.keyboard.press("?");
  await expect(sheet).toBeHidden();

  // Terminado, não volta sozinho.
  await open(a, "nome=Ana&lente=2d");
  await a.waitForTimeout(2500);
  await expect(card(a)).toBeHidden();
});

test("agora não: some, avisa como rever e volta pela busca", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  await open(a, "nome=Bia&lente=2d&tutorial=1");
  await expect(card(a).getByText("Oi, Bia! Eu sou o Orbi.")).toBeVisible({ timeout: 10_000 });
  await card(a).getByRole("button", { name: "Agora não" }).click();
  await expect(card(a)).toBeHidden();
  await expect(banner(a)).toHaveCount(0);
  await expect(a.getByText(/Quando quiser, aperte\s\?/)).toBeVisible();
  expect((await saved(a))?.phase).toBe("done");

  // Ctrl+K → "Primeiros passos".
  await palette(a);
  await a.keyboard.type("primeiros");
  await a.keyboard.press("Enter");
  await expect(card(a).getByText("Oi, Bia! Eu sou o Orbi.")).toBeVisible();
  // E a lista de atalhos também está na busca.
  await card(a).getByRole("button", { name: "Agora não" }).click();
  await palette(a);
  await a.keyboard.type("atalhos");
  await a.keyboard.press("Enter");
  await expect(a.getByRole("dialog", { name: "Atalhos" })).toBeVisible();
});

test("no celular: sem lente e sem tela, sem teclas, e o cartão cabe acima da doca", async ({ browser }) => {
  const ctx = await browser.newContext({ ...devices["Pixel 7"] });
  const a = await ctx.newPage();
  await open(a, "nome=Caio&lente=2d&tutorial=1");
  await expect(card(a).getByText("Oi, Caio! Eu sou o Orbi.")).toBeVisible({ timeout: 10_000 });
  await card(a).getByRole("button", { name: "Vamos lá" }).click();
  await expect(progress(a)).toHaveText("0 de 8");
  await expect(banner(a)).toBeVisible();
  await expect(card(a).getByText("Veja em 2D e 3D")).toHaveCount(0);
  await expect(card(a).getByText("Compartilhe a tela")).toHaveCount(0);
  await expect(card(a).locator("kbd")).toHaveCount(0);
  await expect(card(a).getByText("Toque no chão para ir até lá.")).toBeVisible();
  const vw = a.viewportSize()!;
  const box = (await card(a).boundingBox())!;
  const dock = (await a.getByRole("toolbar", { name: "Controles" }).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vw.width);
  expect(box.y + box.height).toBeLessThan(dock.y);
  const strip = (await banner(a).boundingBox())!;
  expect(strip.x).toBeGreaterThanOrEqual(0);
  expect(strip.x + strip.width).toBeLessThanOrEqual(vw.width);
  // A faixa fica abaixo do Status (não cobre o botão).
  const chip = (await a.getByText("Status", { exact: true }).boundingBox())!;
  expect(strip.y).toBeGreaterThanOrEqual(chip.y + chip.height);
  await a.waitForTimeout(400);
  await a.screenshot({ path: `${SHOTS}/tutorial-celular.png` });
  // Minimiza e volta.
  await card(a).getByRole("button", { name: "Minimizar" }).click();
  await expect(a.getByRole("button", { name: "Abrir primeiros passos" })).toBeVisible();
  await a.getByRole("button", { name: "Abrir primeiros passos" }).click();
  await expect(progress(a)).toHaveText("0 de 8");
});
