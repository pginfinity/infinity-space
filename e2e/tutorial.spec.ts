import { devices } from "@playwright/test";
import { expect, test, type Page } from "./setup.ts";

/**
 * Primeiros passos: o Orbi se apresenta, vem até a pessoa e a lista se marca sozinha conforme ela faz
 * cada coisa (andar, E, microfone, chat, busca, mapa, 2D/3D). A tecla ? abre os atalhos.
 * O atalho de desenvolvimento (?nome=) não abre o tutorial sozinho; &tutorial=1 força.
 */

interface Hook {
  store: { getState(): { selfId: string | null } };
  self: { x: number; z: number };
  walkTo(p: { x: number; z: number }): boolean;
  interact: { getState(): { target: { label: string } | null } };
  acts: { state: { getState(): { acts: Record<string, { state: unknown }> } } };
  media: { state: { getState(): { status: string; mic: boolean } } };
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
/** Abre a busca (Ctrl+K) e espera o foco no campo. */
async function palette(p: Page): Promise<void> {
  await p.keyboard.press("Control+KeyK");
  await expect(p.getByRole("dialog", { name: "Buscar e comandos" }).getByRole("combobox")).toBeFocused();
}
const saved = (p: Page) => p.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "null") as { phase: string; done: string[] } | null, KEY);

test("primeiros passos: o Orbi apresenta, vem até a pessoa e a lista se marca sozinha", async ({ browser }) => {
  test.setTimeout(180_000);
  const ctx = await browser.newContext();
  await ctx.grantPermissions(["microphone", "camera"]);
  const a = await ctx.newPage();
  await open(a, "nome=Ana&lente=2d&tutorial=1");

  // Apresentação.
  await expect(card(a).getByText("Oi, Ana! Eu sou o Orbi.")).toBeVisible({ timeout: 10_000 });
  await a.waitForTimeout(500);
  await a.screenshot({ path: `${SHOTS}/tutorial-intro-2d.png` });
  await card(a).getByRole("button", { name: "Vamos lá" }).click();
  await expect(progress(a)).toHaveText("0 de 7");
  expect((await saved(a))?.phase).toBe("steps");

  // O Orbi vem dar boas-vindas (segue a Ana).
  await expect
    .poll(() => a.evaluate(() => ((window as unknown as W).__infinity.acts.state.getState().acts.orbi?.state as { follow: { name: string } | null } | undefined)?.follow?.name ?? null), { timeout: 10_000 })
    .toBe("Ana");

  // Andar 4 m.
  const from = await a.evaluate(() => ({ x: (window as unknown as W).__infinity.self.x, z: (window as unknown as W).__infinity.self.z }));
  await a.evaluate((p) => (window as unknown as W).__infinity.walkTo({ x: p.x + 4, z: p.z }), from);
  await expect(progress(a)).toHaveText("1 de 7", { timeout: 15_000 });

  // Usar com E: quando o Orbi chega, aparece "Fazer carinho no Orbi".
  await expect
    .poll(() => a.evaluate(() => (window as unknown as W).__infinity.interact.getState().target?.label ?? ""), { timeout: 40_000 })
    .toMatch(/Orbi/);
  await a.screenshot({ path: `${SHOTS}/tutorial-orbi-chegou-2d.png` });
  await a.keyboard.press("KeyE");
  await expect(progress(a)).toHaveText("2 de 7");

  // Microfone: o botão fica destacado; M liga.
  await expect(a.locator("html")).toHaveAttribute("data-tour", "mic");
  await expect.poll(() => a.evaluate(() => (window as unknown as W).__infinity.media.state.getState().status), { timeout: 30_000 }).toBe("on");
  await a.screenshot({ path: `${SHOTS}/tutorial-destaque-mic-2d.png` });
  await a.keyboard.press("KeyM");
  await expect(progress(a)).toHaveText("3 de 7", { timeout: 20_000 });

  // Chat (C) e busca (Ctrl+K).
  await expect(a.locator("html")).toHaveAttribute("data-tour", "chat");
  await a.keyboard.press("KeyC");
  await expect(progress(a)).toHaveText("4 de 7");
  await a.keyboard.press("Escape");
  await palette(a);
  await expect(progress(a)).toHaveText("5 de 7");
  await a.keyboard.press("Escape");
  await expect(a.getByRole("dialog", { name: "Buscar e comandos" })).toBeHidden();

  // Mapa: o botão de ampliar fica destacado.
  await expect(a.locator("html")).toHaveAttribute("data-tour", "mapa");
  await a.waitForTimeout(400);
  await a.screenshot({ path: `${SHOTS}/tutorial-destaque-mapa-2d.png` });
  await a.getByRole("button", { name: "Ampliar mapa" }).click();
  await expect(progress(a)).toHaveText("6 de 7");
  await a.getByRole("button", { name: "Diminuir mapa" }).click();

  // 2D/3D (L): terminou.
  await a.keyboard.press("KeyL");
  await expect(a.getByText("Pronto! Você já sabe o essencial.")).toBeVisible();
  expect((await saved(a))?.phase).toBe("done");
  await a.waitForSelector('[role="application"][data-ready="true"]', { timeout: 60_000 });
  await a.waitForTimeout(600);
  await a.screenshot({ path: `${SHOTS}/tutorial-pronto-3d.png` });

  // Atalhos: pelo botão do parabéns, e pela tecla ?.
  await card(a).getByRole("button", { name: /Ver atalhos/ }).click();
  const sheet = a.getByRole("dialog", { name: "Atalhos" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Sussurrar para quem está mais perto (segure)")).toBeVisible();
  await a.waitForTimeout(300);
  await a.screenshot({ path: `${SHOTS}/tutorial-atalhos.png` });
  await a.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await a.keyboard.press("?");
  await expect(sheet).toBeVisible();
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

test("no celular: sem a troca de lente, sem teclas, e o cartão cabe acima da doca", async ({ browser }) => {
  const ctx = await browser.newContext({ ...devices["Pixel 7"] });
  const a = await ctx.newPage();
  await open(a, "nome=Caio&lente=2d&tutorial=1");
  await expect(card(a).getByText("Oi, Caio! Eu sou o Orbi.")).toBeVisible({ timeout: 10_000 });
  await card(a).getByRole("button", { name: "Vamos lá" }).click();
  await expect(progress(a)).toHaveText("0 de 6");
  await expect(card(a).getByText("Veja em 2D e 3D")).toHaveCount(0);
  await expect(card(a).locator("kbd")).toHaveCount(0);
  await expect(card(a).getByText("Toque no chão para ir até lá.")).toBeVisible();
  const vw = a.viewportSize()!;
  const box = (await card(a).boundingBox())!;
  const dock = (await a.getByRole("toolbar", { name: "Controles" }).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vw.width);
  expect(box.y + box.height).toBeLessThan(dock.y);
  await a.waitForTimeout(400);
  await a.screenshot({ path: `${SHOTS}/tutorial-celular.png` });
  // Minimiza e volta.
  await card(a).getByRole("button", { name: "Minimizar" }).click();
  await expect(a.getByRole("button", { name: "Abrir primeiros passos" })).toBeVisible();
  await a.getByRole("button", { name: "Abrir primeiros passos" }).click();
  await expect(progress(a)).toHaveText("0 de 6");
});
