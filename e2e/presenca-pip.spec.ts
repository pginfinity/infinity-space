import { expect, test, type Page } from "./setup.ts";
import { SHOTS, enter, selfId, waitOnline, walk, type W } from "./presenca-util.ts";

/**
 * Janela flutuante: com a câmera de alguém por perto, o botão aparece na doca; abrir leva os
 * vídeos para a janelinha (Document Picture-in-Picture) e fechar devolve tudo para a página.
 */

const mediaOn = (p: Page) => p.evaluate(() => (window as unknown as W).__infinity.media.state.getState().status);

test("janela flutuante: aparece com vídeo por perto, abre com os vídeos e devolve ao fechar", async ({ browser }) => {
  test.setTimeout(150_000);
  const a = await enter(browser, "Ana", "2d", { media: true });
  const b = await enter(browser, "Bruno", "2d", { media: true });
  await waitOnline(a, 2);
  await expect.poll(() => mediaOn(a), { timeout: 20_000 }).toBe("on");
  await expect.poll(() => mediaOn(b), { timeout: 20_000 }).toBe("on");
  await walk(a, { x: -2, z: 3.5 });
  await walk(b, { x: -0.5, z: 3.8 });
  const idb = await selfId(b);

  const dock = a.getByRole("toolbar", { name: "Controles" });
  // Sem vídeo de ninguém: sem botão.
  await expect(dock.getByRole("button", { name: "Janela flutuante" })).toHaveCount(0);

  // Bruno liga a câmera: a Ana recebe o vídeo e o botão aparece.
  await b.keyboard.press("KeyV");
  await expect.poll(() => a.evaluate((id) => !!(window as unknown as W).__infinity.media.state.getState().videos[id], idb), { timeout: 20_000 }).toBe(true);
  const button = dock.getByRole("button", { name: "Janela flutuante" });
  await expect(button).toBeVisible({ timeout: 5000 });
  await a.screenshot({ path: `${SHOTS}/presenca-pip-botao.png` });
  // Ana também liga a câmera: a janela mostra os dois (você por último).
  await a.keyboard.press("KeyV");
  await a.waitForTimeout(1500);

  const hasDocPip = await a.evaluate(() => "documentPictureInPicture" in window);
  const popup = a.context().waitForEvent("page", { timeout: 8000 }).catch(() => null);
  await button.click();
  if (hasDocPip) {
    await expect.poll(() => a.evaluate(() => !!(window as unknown as W).__presenca.pip.getState().win), { timeout: 8000 }).toBe(true);
    // O vídeo do Bruno foi para a janelinha (o próprio elemento, para a transmissão não pausar).
    const inPip = () =>
      a.evaluate((id) => {
        const win = (window as unknown as W).__presenca.pip.getState().win;
        const el = (window as unknown as W).__infinity.media.state.getState().videos[id] as HTMLVideoElement | undefined;
        return !!win && !!el && el.ownerDocument === win.document;
      }, idb);
    await expect.poll(inPip, { timeout: 5000 }).toBe(true);
    const pip = await popup;
    if (pip) {
      // O tamanho de verdade da janelinha.
      await pip.setViewportSize({ width: 380, height: 460 }).catch(() => undefined);
      await pip.waitForTimeout(800);
      await pip.screenshot({ path: `${SHOTS}/presenca-pip-janela.png` });
    }
    await expect(dock.getByRole("button", { name: "Fechar janela flutuante" })).toBeVisible();
    // Fechar devolve o vídeo para a bolha do avatar, na página.
    await dock.getByRole("button", { name: "Fechar janela flutuante" }).click();
    await expect.poll(() => a.evaluate(() => !!(window as unknown as W).__presenca.pip.getState().win), { timeout: 5000 }).toBe(false);
    await expect
      .poll(() => a.evaluate((id) => ((window as unknown as W).__infinity.media.state.getState().videos[id] as HTMLVideoElement | undefined)?.ownerDocument === document, idb), { timeout: 5000 })
      .toBe(true);
  } else {
    // Navegador sem Document PiP: PiP de vídeo comum.
    await expect.poll(() => a.evaluate(() => !!document.pictureInPictureElement), { timeout: 8000 }).toBe(true);
  }
});
