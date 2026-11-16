import { readFileSync } from "node:fs";
import { expect, test } from "./setup.ts";
import { SHOTS, enter, objectOf, waitOnline, walk, type W } from "./escritorio-helpers.ts";

/**
 * Cabine de fotos: a Ana liga o timer no tripé e corre para a frente do fundo, onde o Bruno já
 * está. Os dois veem a contagem; no fim, cada um gera a foto no próprio navegador (vista do tripé,
 * com moldura da marca) e pode baixar o PNG. Quem está longe não recebe nada.
 */
test("cabine de fotos: timer, flash e foto com moldura para quem está na cabine", async ({ browser }) => {
  test.setTimeout(150_000);
  const a = await enter(browser, "Ana", "2d");
  const b = await enter(browser, "Bruno", "3d");
  const c = await enter(browser, "Caio", "2d");
  await waitOnline(a, 3);

  const backdrop = await objectOf(a, "backdrop");
  const tripod = await objectOf(a, "camera-tripod");
  // Frente do fundo (o papel desce para o sul): Bruno fica no quadro, a Ana vai até o tripé.
  await walk(b, { x: backdrop.pos.x + 0.5, z: backdrop.pos.z + 1.4 }, 0.5);
  await walk(a, { x: tripod.pos.x + 0.9, z: tripod.pos.z + 0.4 }, 0.5);

  await expect(a.getByText(/Tirar foto da turma/)).toBeVisible({ timeout: 8000 });
  await a.keyboard.press("KeyE");
  for (const p of [a, b]) await expect(p.getByRole("status").filter({ hasText: "Cabine de fotos" })).toBeVisible({ timeout: 5000 });
  await expect(c.getByText("Cabine de fotos")).toHaveCount(0);
  // A Ana corre para o quadro, ao lado do Bruno.
  await a.evaluate((p) => (window as unknown as W).__infinity.walkTo(p), { x: backdrop.pos.x - 0.6, z: backdrop.pos.z + 1.5 });
  await b.keyboard.press("Digit4"); // comemora para a foto
  await a.screenshot({ path: `${SHOTS}/escritorio-cabine-contagem.png` });

  // A foto chega para os dois (render local), com botão de baixar.
  for (const p of [a, b]) {
    const card = p.getByRole("dialog", { name: "Sua foto" });
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card.getByRole("link", { name: "Baixar PNG" })).toHaveAttribute("download", /infinity-space-.*\.png/);
  }
  await expect(c.getByRole("dialog", { name: "Sua foto" })).toHaveCount(0);
  await b.waitForTimeout(400);
  await b.screenshot({ path: `${SHOTS}/escritorio-cabine-foto-3d.png` });
  await a.screenshot({ path: `${SHOTS}/escritorio-cabine-foto-2d.png` });

  // O PNG baixado tem a moldura (1600×1200 + bordas) e é uma imagem válida.
  const download = a.waitForEvent("download");
  await a.getByRole("dialog", { name: "Sua foto" }).getByRole("link", { name: "Baixar PNG" }).click();
  const file = await (await download).path();
  const png = readFileSync(file);
  expect(png.subarray(1, 4).toString()).toBe("PNG");
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  expect(width).toBe(1600 + 88);
  expect(height).toBe(1200 + 44 + 168);
  // Guarda a foto para revisão visual.
  const { writeFileSync } = await import("node:fs");
  writeFileSync(`${SHOTS}/escritorio-cabine-png.png`, png);

  await a.keyboard.press("Escape");
  await expect(a.getByRole("dialog", { name: "Sua foto" })).toHaveCount(0);
});
