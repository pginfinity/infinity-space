import type { Page } from "@playwright/test";
import { expect, test } from "./setup.ts";
import { SHOTS, enter, waitOnline, walk, type W } from "./escritorio-helpers.ts";

const hasGuest = (p: Page) => p.evaluate(() => Object.values((window as unknown as W).__infinity.store.getState().players).some((x) => x.name === "Carla Cliente (convidado)"));

/**
 * Convite de cliente: Ana, na Sala Eclipse, gera o link; a cliente abre, diz o nome e espera na porta.
 * Só quem está na sala vê o pedido. Dentro, a cliente vê só a sala (Ana), liga o microfone e sai.
 */
test("convite: cliente entra pelo link com o sim de quem está na sala", async ({ browser }) => {
  test.setTimeout(150_000);
  const a = await enter(browser, "Ana", "2d");
  const b = await enter(browser, "Bia", "2d");
  await waitOnline(a, 2);
  const chip = a.getByRole("button", { name: "Convidar cliente" });
  // No Átrio não há convite.
  await expect(chip).toHaveCount(0);

  await walk(a, { x: -20, z: -1 });
  await chip.click();
  const card = a.getByRole("dialog", { name: "Convite · Sala Eclipse" });
  await expect(card).toBeVisible();
  const url = await card.getByRole("textbox", { name: "Link do convite" }).inputValue();
  expect(url).toMatch(/\?convite=[\w-]{20,}$/);

  const g = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await g.goto(url);
  await g.getByLabel("Seu nome").fill("Carla Cliente");
  await g.getByRole("button", { name: "Pedir para entrar" }).click();
  await expect(g.getByText("Aguardando alguém da Sala Eclipse deixar você entrar…")).toBeVisible();

  const ask = (p: Page) => p.getByRole("alertdialog", { name: "Carla Cliente (convidado de fora) quer entrar na reunião" });
  await expect(ask(a)).toBeVisible({ timeout: 5000 });
  await expect(ask(b)).toHaveCount(0);
  await ask(a).getByRole("button", { name: "Deixar entrar" }).click();

  await expect(g.getByRole("heading", { name: "Sala Eclipse" })).toBeVisible();
  await expect(g.getByRole("listitem").filter({ hasText: "Ana" })).toBeVisible();
  await expect(g.getByText("Bia")).toHaveCount(0);
  await expect.poll(() => hasGuest(a), { timeout: 5000 }).toBe(true);
  await expect.poll(() => hasGuest(b), { timeout: 5000 }).toBe(true);
  await expect(ask(a)).toHaveCount(0);

  // Microfone: só liga depois que a conexão de voz (LiveKit) sobe.
  const mic = g.getByRole("button", { name: "Microfone" });
  await expect(mic).toBeEnabled({ timeout: 20_000 });
  await mic.click();
  await expect(mic).toHaveAttribute("aria-pressed", "true", { timeout: 15_000 });
  await g.screenshot({ path: `${SHOTS}/escritorio-convite-cliente.png` });
  await a.screenshot({ path: `${SHOTS}/escritorio-convite-sala.png` });

  await g.getByRole("button", { name: "Sair" }).click();
  await expect(g.getByText("Você saiu da reunião.")).toBeVisible();
  await expect.poll(() => hasGuest(a), { timeout: 5000 }).toBe(false);

  // Link que não existe: avisa e não deixa pedir de novo.
  await g.goto(url.replace(/=[\w-]+$/, "=inventado123456789012"));
  await g.getByLabel("Seu nome").fill("Carla Cliente");
  await g.getByRole("button", { name: "Pedir para entrar" }).click();
  await expect(g.getByText(/Este convite expirou ou não vale mais/)).toBeVisible();
});

test("convite: recusado na porta", async ({ browser }) => {
  test.setTimeout(120_000);
  const a = await enter(browser, "Ana", "2d");
  await walk(a, { x: -20, z: -1 });
  await a.getByRole("button", { name: "Convidar cliente" }).click();
  const url = await a.getByRole("textbox", { name: "Link do convite" }).inputValue();

  const g = await (await browser.newContext()).newPage();
  await g.goto(url);
  await g.getByLabel("Seu nome").fill("Davi");
  await g.getByRole("button", { name: "Pedir para entrar" }).click();
  await a.getByRole("alertdialog", { name: /^Davi \(convidado de fora\)/ }).getByRole("button", { name: "Agora não" }).click();
  await expect(g.getByText("Não deixaram você entrar agora.")).toBeVisible();
});
