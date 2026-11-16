import { expect, test } from "./setup.ts";
import { actState, enter, frontOf, promptLabel, walkNear, zoomIn, type W } from "./vivo-util.ts";

/**
 * Jukebox: a Ana escolhe uma faixa, ela entra na fila do servidor e toca; o Bruno, perto, vê o
 * minitocador com a mesma faixa e ouve (nível do som > 0). Longe, atrás da parede, fica baixinho.
 */

interface Juke {
  playing: { track: string; by: string; startAt: number } | null;
  queue: Array<{ track: string; by: string }>;
}

test("pôr música na fila e ouvir junto, por proximidade", async ({ browser }) => {
  test.setTimeout(150_000);
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await enter(a, "Ana", "2d");
  await enter(b, "Bruno", "3d");

  const spot = await frontOf(a, "jukebox", 1.1);
  await walkNear(a, spot, 0.9);
  await walkNear(b, { x: spot.x + 1.5, z: spot.z + 1.8 }, 1.0);
  await expect.poll(() => promptLabel(a)).toBe("Escolher música");
  await zoomIn(a, 3);
  await a.keyboard.press("KeyE");
  const panel = a.getByRole("dialog", { name: "Jukebox" });
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Pôr na fila: Lagoa" }).click();
  await expect(a.getByText("“Lagoa” entrou na fila.")).toBeVisible({ timeout: 5000 });

  // Lagoa está tocando ou na fila (a jukebox é do escritório inteiro e pode já ter fila).
  const st = await actState<Juke>(b, "jukebox");
  expect(st.playing?.track === "lagoa" || st.queue.some((e) => e.track === "lagoa" && e.by === "Ana")).toBe(true);
  await a.waitForTimeout(800);
  await a.screenshot({ path: "test-results/screens/vivo-jukebox-painel.png" });
  await a.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);

  // Os dois veem a mesma faixa tocando, com a mesma hora de início, e ouvem.
  const playing = (await actState<Juke>(a, "jukebox")).playing!;
  expect(playing).toBeTruthy();
  const pb = (await actState<Juke>(b, "jukebox")).playing!;
  expect(pb.track).toBe(playing.track);
  expect(pb.startAt).toBe(playing.startAt);
  await expect.poll(() => b.evaluate(() => (window as unknown as W).__vivo.musicLevel()), { timeout: 8000 }).toBeGreaterThan(0.2);
  const title = await b.locator('[role="status"]').filter({ hasText: /./ }).allTextContents();
  expect(title.join(" ").length).toBeGreaterThan(0);
  await b.waitForTimeout(1500);
  await b.screenshot({ path: "test-results/screens/vivo-jukebox-3d.png" });
  await a.screenshot({ path: "test-results/screens/vivo-jukebox-2d.png" });

  // Volume é de cada um: a Ana silencia, o Bruno continua ouvindo.
  await a.getByRole("button", { name: "Silenciar a jukebox" }).first().click();
  await expect.poll(() => b.evaluate(() => (window as unknown as W).__vivo.musicLevel())).toBeGreaterThan(0.2);

  // Bruno vai para a copa (outra sala): o som chega fraco e abafado.
  await walkNear(b, { x: -6.5, z: 18.5 }, 1.0);
  await expect.poll(() => b.evaluate(() => (window as unknown as W).__vivo.musicLevel())).toBeLessThan(0.15);
});
