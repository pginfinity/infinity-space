import { expect, test } from "./setup.ts";
import { SHOTS, enter, selfId, statusOf, waitOnline, type W } from "./presenca-util.ts";

/**
 * "Ausente" automático com o tempo escolhido por cada um (no teste, o minuto vale 300 ms):
 * desligado por padrão; ligado, fica ausente sem mexer e volta a Disponível ao mexer; se a pessoa
 * escolheu outro status na mão, o automático não passa por cima.
 */
test("ausente automático: escolha no painel, volta ao mexer, respeita o status escolhido", async ({ browser }) => {
  test.setTimeout(120_000);
  const a = await enter(browser, "Ana");
  const b = await enter(browser, "Bruno");
  await waitOnline(a, 2);
  const ida = await selfId(a);
  await a.evaluate(() => (window as unknown as W).__presenca.setAwayMinuteMs(300));

  const settings = a.getByRole("dialog", { name: "Áudio e vídeo" });
  await a.getByRole("button", { name: "Áudio e vídeo" }).click();
  await expect(settings).toBeVisible();
  const auto = settings.getByRole("radiogroup", { name: "Ficar Ausente sozinho" });
  await auto.scrollIntoViewIfNeeded();
  // Padrão: desligado. Nada muda mesmo parado.
  await expect(auto.getByRole("radio", { name: "Desligado" })).toHaveAttribute("aria-checked", "true");
  await a.waitForTimeout(2500);
  expect(await statusOf(b, ida)).toBe("available");

  // 5 min (1,5 s no teste): parada, fica Ausente.
  await auto.getByRole("radio", { name: "5 min", exact: true }).click();
  await expect.poll(() => statusOf(b, ida), { timeout: 10_000 }).toBe("away");
  expect(await a.evaluate(() => (window as unknown as W).__presenca.awayIsAuto())).toBe(true);
  await expect(settings.getByRole("radio", { name: "Ausente" })).toHaveAttribute("aria-checked", "true");
  await a.screenshot({ path: `${SHOTS}/presenca-ausente-ajustes.png` });

  // Mexeu o mouse: volta a Disponível.
  await a.mouse.move(700, 400);
  await a.mouse.move(720, 420);
  await expect.poll(() => statusOf(b, ida), { timeout: 5000 }).toBe("available");

  // Foco escolhido na mão: o automático não troca por Ausente.
  await settings.getByRole("radio", { name: "Foco" }).click();
  await expect.poll(() => statusOf(b, ida), { timeout: 5000 }).toBe("focus");
  await a.waitForTimeout(3000);
  expect(await statusOf(b, ida)).toBe("focus");

  // De volta a Disponível e ausente de novo; desligado, fica Disponível de vez.
  await settings.getByRole("radio", { name: "Disponível" }).click();
  await expect.poll(() => statusOf(b, ida), { timeout: 10_000 }).toBe("away");
  await auto.getByRole("radio", { name: "Desligado" }).click();
  await expect.poll(() => statusOf(b, ida), { timeout: 5000 }).toBe("available");
  await a.waitForTimeout(2500);
  expect(await statusOf(b, ida)).toBe("available");
});
