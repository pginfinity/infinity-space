import { expect, test } from "./setup.ts";

/**
 * Build de produção, do jeito que a pessoa usa (sem atalhos de desenvolvimento): tela de entrada,
 * escritório no 2D, troca para o 3D e volta. Só roda contra um servidor de produção:
 *   npm run build; NODE_ENV=production STATIC_DIR=apps/web/dist PORT=4321 node --import tsx apps/server/src/index.ts
 *   E2E_PROD=1 E2E_BASE_URL=http://localhost:4321 npx playwright test e2e/producao.spec.ts
 */

test("produção: entrar, 3D, 2D e voltar, sem erros", async ({ browser }) => {
  test.skip(!process.env.E2E_PROD, "só contra o build de produção (E2E_PROD=1)");
  test.setTimeout(180_000);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon/.test(m.text())) errors.push(m.text());
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Entre no escritório" })).toBeVisible({ timeout: 30_000 });
  // Em produção não há ganchos de teste no window.
  expect(await page.evaluate(() => "__infinity" in window)).toBe(false);
  await page.getByLabel("Seu nome").fill("Produção");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("1 pessoa online")).toBeVisible({ timeout: 30_000 });
  // A tela de entrada começa no 3D (carregado sob demanda); depois 2D e volta.
  await page.waitForSelector('[role="application"][data-ready="true"]', { timeout: 120_000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: "test-results/screens/producao-3d.png" });
  await page.getByRole("radio", { name: "2D" }).click();
  await expect(page.getByRole("application", { name: "Escritório em 2D isométrico" })).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: "test-results/screens/producao-2d.png" });
  await page.getByRole("radio", { name: "3D" }).click();
  await page.waitForSelector('[role="application"][data-ready="true"]', { timeout: 120_000 });

  // App instalável: manifesto e service worker no ar.
  const manifest = await page.evaluate(async () => (await fetch("/manifest.webmanifest")).status);
  expect(manifest).toBe(200);
  expect(errors).toEqual([]);
});
