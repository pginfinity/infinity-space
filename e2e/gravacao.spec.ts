import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "./setup.ts";

/**
 * Gravação de reunião: Ana e Bruno na Sala Eclipse com microfone (tom falso do Chrome).
 * Ana grava; os dois veem o aviso; Ana para; o arquivo Opus fica salvo no servidor
 * (sem conta do Google configurada, fica na fila para o Drive).
 */

interface Hook {
  store: { getState(): { selfId: string | null } };
  self: { x: number; z: number };
  walkTo(p: { x: number; z: number }): boolean;
  media: { state: { getState(): { status: string; mic: boolean; audience: number } } };
  acts: { state: { getState(): { acts: Record<string, { state: { sessions: Record<string, { status: string; note?: string }> } }> } } };
}
type W = { __infinity: Hook };

const DIR = join(process.cwd(), "apps/server/data/gravacoes");

async function enter(page: Page, name: string) {
  await page.context().grantPermissions(["microphone", "camera"]);
  await page.goto(`/?nome=${name}&lente=2d`);
  await page.waitForFunction(() => !!(window as unknown as Partial<W>).__infinity?.store.getState().selfId, null, { timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__infinity.media.state.getState().status), { timeout: 20_000 }).toBe("on");
}

async function walk(page: Page, x: number, z: number) {
  await page.evaluate(([x, z]) => (window as unknown as W).__infinity.walkTo({ x: x!, z: z! }), [x, z]);
  await expect.poll(() => page.evaluate(([x, z]) => Math.hypot((window as unknown as W).__infinity.self.x - x!, (window as unknown as W).__infinity.self.z - z!), [x, z]), { timeout: 30_000 }).toBeLessThan(0.6);
}

const session = (p: Page) => p.evaluate(() => (window as unknown as W).__infinity.acts.state.getState().acts["gravacao"]?.state.sessions["eclipse"] ?? null);

test("grava a reunião da sala e salva o áudio", async ({ browser }) => {
  test.setTimeout(120_000);
  const before = existsSync(DIR) ? new Set(readdirSync(DIR)) : new Set<string>();
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await enter(a, "Ana");
  await enter(b, "Bruno");
  await Promise.all([walk(a, -23.6, 1.2), walk(b, -23.6, 3.4)]);
  await a.keyboard.press("KeyM");
  await b.keyboard.press("KeyM");

  // Ana pede para gravar e confirma.
  await a.getByRole("button", { name: "Gravar reunião" }).click();
  await expect(a.getByRole("dialog", { name: "Gravar esta reunião?" })).toBeVisible();
  await a.screenshot({ path: "test-results/screens/v3-gravar-confirmar.png" });
  await a.getByRole("button", { name: "Gravar", exact: true }).click();

  // Os dois veem que está gravando; o gravador não conta como "pessoa que te ouve".
  for (const p of [a, b]) await expect(p.getByText("Gravando", { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  await expect(b.getByText(/Iniciada por Ana/)).toBeVisible();
  await expect(a.getByRole("button", { name: /Desligar microfone/ })).toContainText("1 ouve");
  await a.waitForTimeout(6000);
  await a.screenshot({ path: "test-results/screens/v3-gravando.png" });

  // Para: o arquivo é salvo (sem Drive configurado, fica no servidor).
  await b.getByRole("button", { name: "Parar a gravação" }).click();
  await expect.poll(async () => (await session(a))?.status, { timeout: 30_000 }).toMatch(/saved|uploaded/);
  const created = readdirSync(DIR).filter((f) => f.startsWith("eclipse-") && f.endsWith(".ogg") && !before.has(f));
  expect(created.length).toBe(1);
  expect(statSync(join(DIR, created[0]!)).size).toBeGreaterThan(10_000);
  await a.screenshot({ path: "test-results/screens/v3-gravacao-salva.png" });
});
