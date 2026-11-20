import type { Page } from "@playwright/test";
import { expect, test } from "./setup.ts";
import { SHOTS, enter, waitOnline, walk } from "./escritorio-helpers.ts";

type WQ = { __quadro?: { getSceneElements(): { type: string }[] } };
const count = (p: Page, type: string) => p.evaluate((type) => (window as unknown as WQ).__quadro?.getSceneElements().filter((e) => e.type === type).length ?? -1, type);

/** Desenha arrastando o mouse no meio do quadro com a ferramenta escolhida. */
async function draw(p: Page, tool: string, dx: number) {
  // O rádio fica por baixo do ícone da ferramenta.
  await p.getByTestId(`toolbar-${tool}`).click({ force: true });
  const box = (await p.locator(".excalidraw").boundingBox())!;
  const x = box.x + box.width / 2 + dx;
  const y = box.y + box.height / 2;
  await p.mouse.move(x, y);
  await p.mouse.down();
  await p.mouse.move(x + 160, y + 110, { steps: 6 });
  await p.mouse.up();
}

/** Espera o quadro receber o que o servidor guarda e devolve quantos elementos do tipo há. */
async function synced(p: Page, type: string): Promise<number> {
  await expect.poll(() => count(p, type), { timeout: 20_000 }).toBeGreaterThanOrEqual(0);
  return count(p, type);
}

/**
 * Quadro branco: Ana e Bia na Sala Eclipse desenham juntas; o desenho fica guardado; quem sai da
 * sala perde o quadro (e no corredor não há quadro para abrir).
 */
test("quadro branco: quem está na sala desenha junto e o desenho fica", async ({ browser }) => {
  test.setTimeout(150_000);
  const a = await enter(browser, "Ana", "2d");
  const b = await enter(browser, "Bia", "3d");
  await waitOnline(a, 2);
  const chip = (p: Page) => p.getByRole("button", { name: /^Quadro branco/ });
  // No Átrio não há quadro.
  await expect(chip(a)).toHaveCount(0);

  await walk(a, { x: -22, z: -1 });
  await walk(b, { x: -22, z: 2 });
  await chip(a).click();
  const dlgA = a.getByRole("dialog", { name: "Quadro branco · Sala Eclipse" });
  await expect(dlgA).toBeVisible();
  // O quadro fica guardado entre as reuniões: conta o que já havia.
  const r0 = await synced(a, "rectangle");
  const e0 = await count(a, "ellipse");
  await expect(chip(b)).toHaveText(/· 1/, { timeout: 5000 });
  await chip(b).click();
  expect(await synced(b, "rectangle")).toBe(r0);
  await expect(dlgA.getByText("mais 1 pessoa com o quadro aberto")).toBeVisible({ timeout: 5000 });

  await draw(a, "rectangle", -200);
  await expect.poll(() => count(a, "rectangle")).toBe(r0 + 1);
  await expect.poll(() => count(b, "rectangle"), { timeout: 5000 }).toBe(r0 + 1);
  await draw(b, "ellipse", 100);
  await expect.poll(() => count(a, "ellipse"), { timeout: 5000 }).toBe(e0 + 1);
  await a.screenshot({ path: `${SHOTS}/escritorio-quadro.png` });

  // Fecha e abre de novo: o desenho continua lá.
  await dlgA.getByRole("button", { name: "Fechar quadro" }).click();
  await expect(dlgA).toHaveCount(0);
  await chip(a).click();
  expect(await synced(a, "rectangle")).toBe(r0 + 1);
  expect(await count(a, "ellipse")).toBe(e0 + 1);

  // A Bia sai da sala: o quadro dela fecha e no corredor não há quadro.
  await walk(b, { x: 0, z: -5.5 });
  await expect(b.getByRole("dialog", { name: /Quadro branco/ })).toHaveCount(0, { timeout: 5000 });
  await expect(chip(b)).toHaveCount(0);
});
