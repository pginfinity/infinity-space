import { expect, test } from "./setup.ts";
import { audienceCount, audio, enter, idOf, micTrackOf, walk } from "./portas-util.ts";

/**
 * Sussurro: segurando B perto de alguém, a voz vai só para essa pessoa; quem está a pouco mais de 1 m
 * para de ouvir enquanto durar, mas continua vendo a câmera. Ao soltar, tudo volta.
 */

const ANA = { x: 0, z: -5.5 };
const BRUNO = { x: 1.0, z: -5.5 };
const CAIO = { x: -1.3, z: -5.5 };

const trackOf = async (listener: Parameters<typeof micTrackOf>[0], speakerId: string, source: string) =>
  listener.evaluate(
    ([id, src]) => {
      const h = (window as unknown as { __infinity: { media: { debug(): { id: string; tracks: { source: string; subscribed: boolean; permission: string }[] }[] } } }).__infinity;
      return h.media.debug().find((p) => p.id === id)?.tracks.find((t) => t.source === src) ?? null;
    },
    [speakerId, source] as const,
  );

test("sussurro chega só a uma pessoa e não corta o vídeo dos outros", async ({ browser }) => {
  test.setTimeout(150_000);
  const ana = await enter(browser, "Ana");
  const bruno = await enter(browser, "Bruno");
  const caio = await enter(browser, "Caio");
  const [anaId] = await Promise.all([idOf(ana), idOf(bruno), idOf(caio)]);

  await Promise.all([walk(ana, ANA), walk(bruno, BRUNO), walk(caio, CAIO)]);
  // Ana liga a câmera (V): durante o sussurro, quem não ouve continua vendo.
  await ana.keyboard.press("KeyV");
  await expect.poll(() => audio(bruno), { timeout: 20_000 }).toContain(anaId);
  await expect.poll(() => audio(caio), { timeout: 20_000 }).toContain(anaId);
  await expect.poll(async () => (await trackOf(caio, anaId, "camera"))?.subscribed ?? false, { timeout: 20_000 }).toBe(true);
  await expect(ana.getByRole("button", { name: /Sussurrar para Bruno/ })).toBeVisible({ timeout: 10_000 });

  // Segura B: a voz vai só para o Bruno.
  await ana.keyboard.down("KeyB");
  await expect(ana.getByText("Sussurrando para Bruno")).toBeVisible({ timeout: 5000 });
  await expect(bruno.getByText("Ana está sussurrando para você")).toBeVisible({ timeout: 5000 });
  await expect.poll(() => audio(caio), { timeout: 10_000 }).not.toContain(anaId);
  expect(await audio(bruno)).toContain(anaId);
  await expect.poll(() => audienceCount(ana), { timeout: 5000 }).toBe(1);
  // No LiveKit: o cliente do Caio ainda quer a voz da Ana (não sabe do sussurro), mas o SFU não entrega,
  // porque a Ana só liberou a voz para o Bruno. A câmera continua chegando.
  await expect.poll(async () => (await micTrackOf(caio, anaId))?.subscribed, { timeout: 10_000 }).toBe(false);
  expect(await trackOf(caio, anaId, "camera")).toMatchObject({ subscribed: true });
  await caio.waitForTimeout(1500);
  expect(await audio(caio)).not.toContain(anaId);
  await ana.screenshot({ path: "test-results/screens/portas-sussurro-ana.png" });
  await bruno.screenshot({ path: "test-results/screens/portas-sussurro-bruno.png" });

  // Solta B: o Caio volta a ouvir.
  await ana.keyboard.up("KeyB");
  await expect.poll(() => audio(caio), { timeout: 20_000 }).toContain(anaId);
  await expect.poll(() => audienceCount(ana), { timeout: 5000 }).toBe(2);
});
