import { expect, test, type Page } from "./setup.ts";

/** Screenshots de revisão visual (entrada, 2D isométrico, 3D). Não falha por estética: serve para olhar. */

const SHOTS = "test-results/screens";

async function enter(page: Page, name: string, lens: "2d" | "3d") {
  await page.goto(`/?nome=${encodeURIComponent(name)}&lente=${lens}`);
  await page.waitForFunction(() => !!(window as unknown as { __infinity?: { store: { getState(): { selfId: string | null } } } }).__infinity?.store.getState().selfId, null, { timeout: 30_000 });
}

test("entrada com criador de avatar", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Entre no escritório" })).toBeVisible();
  await page.getByLabel("Seu nome").fill("Marina");
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/v2-entrada.png` });
  await page.getByRole("tab", { name: "Cabelo" }).click();
  await page.getByRole("radio", { name: "Topete" }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/v2-entrada-cabelo.png` });
});

test("2D isométrico e 3D com duas pessoas", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await enter(a, "Ana", "2d");
  await enter(b, "Bruno", "3d");
  await expect(a.getByText("2 pessoas online")).toBeVisible({ timeout: 15_000 });
  await a.waitForTimeout(3000);
  await a.keyboard.press("Digit2"); // dança
  await b.keyboard.press("Digit1"); // aceno
  await a.waitForTimeout(1200);
  await a.screenshot({ path: `${SHOTS}/v2-iso.png` });
  await b.waitForTimeout(2500);
  await b.screenshot({ path: `${SHOTS}/v2-3d.png` });
  // Zoom afastado no 2D para ver a estação.
  await a.mouse.move(720, 450);
  for (let i = 0; i < 6; i++) await a.mouse.wheel(0, 400);
  await a.waitForTimeout(1500);
  await a.screenshot({ path: `${SHOTS}/v2-iso-longe.png` });
});
