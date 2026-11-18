import { expect, test } from "./setup.ts";
import { SHOTS, enter, pos, selfId, statusOf, waitOnline, walk, type W } from "./presenca-util.ts";

/**
 * Busca e comandos (Ctrl+K): abre e fecha pelo teclado, busca sem acento, setas e Enter,
 * e executa ir até uma sala, chamar alguém, mudar o status e trocar a lente.
 */
test("paleta: Ctrl+K, busca sem acento, setas, Enter e Esc", async ({ browser }) => {
  test.setTimeout(150_000);
  const a = await enter(browser, "Ana");
  const b = await enter(browser, "Bruno");
  await waitOnline(a, 2);
  const ida = await selfId(a);
  await walk(a, { x: -2, z: 3.5 });

  const dialog = a.getByRole("dialog", { name: "Buscar e comandos" });
  const input = dialog.getByRole("combobox");
  const active = dialog.locator('[role="option"][aria-selected="true"]');

  // Abre com Ctrl+K, já com o foco no campo; Esc fecha.
  await a.keyboard.press("Control+KeyK");
  await expect(dialog).toBeVisible();
  await expect(input).toBeFocused();
  await expect(dialog.getByRole("option", { name: /Bruno/ }).first()).toBeVisible();
  await a.waitForTimeout(250);
  await a.screenshot({ path: `${SHOTS}/presenca-paleta.png` });
  await a.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // Setas andam pela lista; letras digitadas não movem o avatar nem disparam atalhos.
  const start = await pos(a);
  await a.keyboard.press("Control+KeyK");
  await expect(input).toBeFocused();
  const first = await active.getAttribute("id");
  await a.keyboard.press("ArrowDown");
  await a.keyboard.press("ArrowDown");
  expect(await active.getAttribute("id")).not.toBe(first);
  await a.keyboard.press("ArrowUp");
  await a.keyboard.press("ArrowUp");
  expect(await active.getAttribute("id")).toBe(first);

  // Sem acento: "eclipse" acha a Sala Eclipse; Enter leva até lá.
  await input.fill("eclipse");
  await expect(active).toContainText("Sala Eclipse");
  await a.screenshot({ path: `${SHOTS}/presenca-paleta-busca.png` });
  const moved = await pos(a);
  expect(Math.hypot(moved.x - start.x, moved.z - start.z)).toBeLessThan(0.2);
  await a.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect
    .poll(() => a.evaluate(() => (window as unknown as W).__infinity.world().zones.zoneAt((window as unknown as W).__infinity.self)?.id ?? null), { timeout: 25_000 })
    .toBe("eclipse");

  // "chamar bru" acha a ação de chamar o Bruno.
  await a.keyboard.press("Control+KeyK");
  await input.fill("chamar bru");
  await expect(active).toContainText("Chamar Bruno");
  await a.keyboard.press("Enter");
  await expect(b.getByRole("alertdialog", { name: "Ana está te chamando" })).toBeVisible({ timeout: 5000 });
  await b.getByRole("alertdialog", { name: "Ana está te chamando" }).getByRole("button", { name: "Agora não" }).click();

  // Status pelo teclado: o Bruno vê a Ana em Foco.
  await a.keyboard.press("Control+KeyK");
  await input.fill("status foco");
  await expect(active).toContainText("Status: Foco");
  await a.keyboard.press("Enter");
  await expect.poll(() => statusOf(b, ida), { timeout: 5000 }).toBe("focus");


  // Nada encontrado.
  await a.keyboard.press("Control+KeyK");
  await input.fill("xyzw");
  await expect(dialog.getByText("Nada encontrado.")).toBeVisible();

  // Ajustes de presença abrem o painel na seção certa.
  await input.fill("ajustes de presenca");
  await expect(active).toContainText("Ajustes de presença");
  await a.keyboard.press("Enter");
  const settings = a.getByRole("dialog", { name: "Áudio e vídeo" });
  await expect(settings).toBeVisible();
  await expect(settings.getByRole("radiogroup", { name: "Ficar Ausente sozinho" })).toBeInViewport({ timeout: 5000 });
  await expect(settings.getByRole("radio", { name: "Foco" })).toHaveAttribute("aria-checked", "true");
  await a.keyboard.press("Escape");
  await expect(settings).toBeHidden();

  // Botão da doca também abre. Por último, trocar a lente.
  await a.getByRole("button", { name: "Buscar e comandos (Ctrl+K)" }).click();
  await expect(dialog).toBeVisible();
  await input.fill("ver em 3d");
  await expect(active).toContainText("Ver em 3D");
  await a.keyboard.press("Enter");
  await expect.poll(() => a.evaluate(() => (window as unknown as W).__infinity.store.getState().lens)).toBe("3d");
});
