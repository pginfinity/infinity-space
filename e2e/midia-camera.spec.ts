import { expect, test, type Page } from "./setup.ts";
import { SHOTS, enter, selfId, waitOnline, walk, type W } from "./presenca-util.ts";

/**
 * Câmera acima do avatar: bolha grande nas duas lentes (Ana no 2D, Bruno no 3D) e o painel de fundos
 * com miniaturas, prévia ao vivo e imagem própria guardada só no navegador. Precisa do LiveKit rodando.
 */

const mediaOn = (p: Page) => p.evaluate(() => (window as unknown as W).__infinity.media.state.getState().status);

/** Tamanho na tela da bolha de vídeo de alguém (o <video> dele está dentro dela). */
const bubbleSize = (p: Page, id: string) =>
  p.evaluate((id) => {
    const v = (window as unknown as W).__infinity.media.state.getState().videos[id] as HTMLVideoElement | undefined;
    const r = v?.parentElement?.getBoundingClientRect();
    return r ? { w: Math.round(r.width), h: Math.round(r.height), video: v!.videoHeight } : null;
  }, id);

test("bolha da câmera grande nas duas lentes e fundos com prévia", async ({ browser }) => {
  test.setTimeout(150_000);
  const a = await enter(browser, "Ana", "2d", { media: true });
  const b = await enter(browser, "Bruno", "3d", { media: true });
  await waitOnline(a, 2);
  await expect.poll(() => mediaOn(a), { timeout: 20_000 }).toBe("on");
  await expect.poll(() => mediaOn(b), { timeout: 20_000 }).toBe("on");
  // Ana ao norte do Bruno: a câmera do 3D dele olha para ela.
  await walk(a, { x: -1, z: 2.4 });
  await walk(b, { x: -1, z: 4.6 });
  const ida = await selfId(a);
  const idb = await selfId(b);

  await a.keyboard.press("KeyV");
  await b.keyboard.press("KeyV");
  await expect.poll(() => a.evaluate((id) => !!(window as unknown as W).__infinity.media.state.getState().videos[id], idb), { timeout: 20_000 }).toBe(true);
  await expect.poll(() => b.evaluate((id) => !!(window as unknown as W).__infinity.media.state.getState().videos[id], ida), { timeout: 20_000 }).toBe(true);

  // Bolha grande (era 64 px) e com imagem chegando.
  await expect.poll(async () => (await bubbleSize(a, idb))?.w ?? 0, { timeout: 10_000 }).toBeGreaterThanOrEqual(120);
  await expect.poll(async () => (await bubbleSize(b, ida))?.w ?? 0, { timeout: 10_000 }).toBeGreaterThanOrEqual(120);
  await expect.poll(async () => (await bubbleSize(a, idb))?.video ?? 0, { timeout: 15_000 }).toBeGreaterThan(0);
  console.log(`[camera] bolha no 2D ${JSON.stringify(await bubbleSize(a, idb))}; no 3D ${JSON.stringify(await bubbleSize(b, ida))}`);

  // Bruno abre o microfone (o tom do microfone falso conta como fala): a bolha dele cresce e acende.
  await b.keyboard.press("KeyM");
  await a.waitForTimeout(2500);
  await a.screenshot({ path: `${SHOTS}/midia-bolha-2d.png` });
  await b.screenshot({ path: `${SHOTS}/midia-bolha-3d.png` });

  // Painel de fundos: miniaturas, prévia ao vivo.
  await a.getByRole("button", { name: "Áudio e vídeo" }).click();
  const panel = a.getByRole("dialog", { name: "Áudio e vídeo" });
  const fundos = panel.getByRole("radiogroup", { name: "Fundo da câmera" });
  await expect(fundos.getByRole("radio")).toHaveCount(12);
  await panel.getByRole("button", { name: "Testar câmera" }).click();
  await expect.poll(() => panel.locator("video").evaluate((v) => (v as HTMLVideoElement).videoWidth), { timeout: 10_000 }).toBeGreaterThan(0);
  await fundos.getByRole("radio", { name: "Escritório" }).click();
  await expect(fundos.getByRole("radio", { name: "Escritório" })).toHaveAttribute("aria-checked", "true");
  await expect.poll(() => a.evaluate(() => JSON.parse(localStorage.getItem("infinity.media.v1") ?? "{}").camBg)).toBe("escritorio");
  await fundos.getByRole("radio", { name: "Escritório" }).scrollIntoViewIfNeeded();
  await a.waitForTimeout(2500);
  await a.screenshot({ path: `${SHOTS}/midia-fundos-painel.png` });

  // Imagem própria: recortada e guardada só neste navegador, já escolhida.
  await panel.locator('input[type="file"]').setInputFiles("apps/web/public/fundos/natureza.jpg");
  await expect(fundos.getByRole("radio", { name: "Sua imagem" })).toHaveAttribute("aria-checked", "true");
  expect(await a.evaluate(() => localStorage.getItem("infinity.media.fundo.v1")?.slice(0, 23))).toBe("data:image/jpeg;base64,");
  await a.waitForTimeout(2000);
  await a.screenshot({ path: `${SHOTS}/midia-fundos-propria.png` });
  await panel.getByRole("button", { name: "Remover", exact: true }).click();
  await expect(fundos.getByRole("radio", { name: "Nenhum" })).toHaveAttribute("aria-checked", "true");
});
