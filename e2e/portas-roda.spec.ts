import { expect, test } from "./setup.ts";
import { audio, enter, idOf, portasState, prompt, walk } from "./portas-util.ts";

/**
 * Cadeado de conversa: quem fecha a roda leva só os vizinhos diretos; quem fica de fora para de ouvir
 * (mesmo a 1 m), vê o anel, pede para entrar e, com aceite, passa a ouvir.
 */

const ANA = { x: 0, z: -5.5 };
const BRUNO = { x: 1.5, z: -5.5 };
const CAIO_LONGE = { x: 3.8, z: -5.5 }; // 3,8 m da Ana: ouve a conversa, mas não entra na roda
const CAIO_PERTO = { x: 2.5, z: -5.5 }; // 1 m do Bruno, do lado de fora da roda

test("roda fechada isola quem está de fora, e entra quem é aceito", async ({ browser }) => {
  test.setTimeout(150_000);
  const ana = await enter(browser, "Ana");
  const bruno = await enter(browser, "Bruno");
  const caio = await enter(browser, "Caio");
  const [anaId, brunoId, caioId] = await Promise.all([idOf(ana), idOf(bruno), idOf(caio)]);

  await Promise.all([walk(ana, ANA), walk(bruno, BRUNO), walk(caio, CAIO_LONGE)]);
  // Antes: todo mundo se ouve no corredor.
  await expect.poll(() => audio(caio), { timeout: 20_000 }).toEqual(expect.arrayContaining([anaId, brunoId]));
  await expect.poll(() => audio(ana), { timeout: 20_000 }).toContain(caioId);

  // Ana fecha a roda: entra só o Bruno (vizinho direto), não o Caio.
  const close = ana.getByRole("button", { name: "Fechar a roda com Bruno" });
  await expect(close).toBeVisible({ timeout: 10_000 });
  await close.click();
  await expect.poll(async () => (await portasState(ana))?.circles.map((c) => [...c.members].sort())).toEqual([[anaId, brunoId].sort()]);

  // Quem está fora para de ouvir a roda, e a roda para de ouvir quem está fora.
  await expect.poll(() => audio(caio), { timeout: 15_000 }).not.toContain(anaId);
  await expect.poll(() => audio(caio), { timeout: 15_000 }).not.toContain(brunoId);
  await expect.poll(() => audio(ana), { timeout: 15_000 }).not.toContain(caioId);
  await expect.poll(() => audio(ana), { timeout: 15_000 }).toContain(brunoId);
  await ana.screenshot({ path: "test-results/screens/portas-roda-dentro.png" });

  // Caio chega a 1 m do Bruno: continua sem ouvir.
  await walk(caio, CAIO_PERTO);
  await caio.waitForTimeout(2000);
  expect(await audio(caio)).not.toContain(anaId);
  expect(await audio(caio)).not.toContain(brunoId);
  await expect.poll(() => prompt(caio)).toBe("Pedir para entrar na roda");
  await caio.screenshot({ path: "test-results/screens/portas-roda-fora.png" });

  // Pede para entrar; Ana aceita; Caio passa a ouvir.
  await caio.keyboard.press("KeyE");
  const card = ana.getByRole("alertdialog", { name: "Caio quer entrar na roda" });
  await expect(card).toBeVisible({ timeout: 10_000 });
  await card.getByRole("button", { name: "Deixar entrar" }).click();
  await expect.poll(async () => (await portasState(caio))?.circles[0]?.members ?? []).toContain(caioId);
  await expect.poll(() => audio(caio), { timeout: 20_000 }).toEqual(expect.arrayContaining([anaId, brunoId]));

  // Quem se afasta de todos sai; com um só, a roda some.
  await Promise.all([walk(bruno, { x: 8, z: -5.5 }), walk(caio, { x: -8, z: -5.5 })]);
  await expect.poll(async () => (await portasState(ana))?.circles.length, { timeout: 15_000 }).toBe(0);
});
