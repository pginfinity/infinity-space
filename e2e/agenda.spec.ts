import { writeFileSync } from "node:fs";
import { expect, test } from "./setup.ts";
import { SHOTS, selfId, type W } from "./escritorio-helpers.ts";

/**
 * Google Agenda: o /api/agenda é trocado por um falso (o Google de verdade não entra no teste).
 * Com uma reunião na Sala Eclipse começando agora: o balão vira "Em reunião até HH:MM", aparece o
 * cartão com Entrar (que leva até a sala), a TV da sala mostra a reserva e Ajustes › Agenda desconecta.
 */

type Hook = W["__infinity"] & {
  world(): { zones: { zoneAt(p: { x: number; z: number }): { id: string } | undefined } };
  tvs: { mesh(id: string): { material: { map?: { image?: HTMLCanvasElement } } } | null };
};
type HW = { __infinity: Hook };

test("agenda: em reunião no balão, Entrar leva à sala, a TV mostra a reserva e dá para desconectar", async ({ browser }) => {
  test.setTimeout(120_000);
  const now = Date.now();
  const ev = { id: "ev1", title: "Plano trimestral", start: now - 60_000, end: now + 30 * 60_000, zone: "eclipse", meet: "https://meet.google.com/abc-defg-hij" };
  let view = { configured: true, connected: true, events: [ev], rooms: [{ zone: "eclipse", start: ev.start, end: ev.end, by: "Otto" }] };
  const off = { configured: true, connected: false, events: [], rooms: [] };

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route("**/api/agenda", (r) => r.fulfill({ json: view }));
  await ctx.route("**/api/agenda/desconectar", (r) => {
    view = off;
    return r.fulfill({ json: off });
  });
  const page = await ctx.newPage();
  await page.goto("/?nome=Otto&lente=3d");
  await page.waitForFunction(() => !!(window as unknown as Partial<W>).__infinity?.store.getState().selfId, null, { timeout: 30_000 });
  const id = await selfId(page);
  const note = () => page.evaluate((id) => (window as unknown as HW).__infinity.store.getState().players[id]?.note ?? "", id);

  // Cartão de Entrar e balão automático.
  const card = page.getByRole("dialog", { name: "Reunião agora" });
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card).toContainText("Plano trimestral");
  await expect(card).toContainText("Sala Eclipse");
  await expect(card.getByRole("button", { name: "Abrir o Meet" })).toBeVisible();
  const until = await page.evaluate((end) => new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(end), ev.end);
  await expect.poll(note).toBe(`📅 Em reunião até ${until}`);
  await page.screenshot({ path: `${SHOTS}/agenda-cartao.png` });

  // TV da Eclipse: a linha laranja da reserva aparece embaixo da data.
  const orange = () =>
    page.evaluate(() => {
      const c = (window as unknown as HW).__infinity.tvs.mesh("eclipse")?.material.map?.image;
      if (!c) return -1;
      const d = c.getContext("2d")!.getImageData(120, 306, 400, 28).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i]! > 200 && d[i + 1]! > 60 && d[i + 1]! < 120 && d[i + 2]! < 80) n++;
      return n;
    });
  await expect.poll(orange, { timeout: 15_000 }).toBeGreaterThan(50);
  const png = await page.evaluate(() => (window as unknown as HW).__infinity.tvs.mesh("eclipse")!.material.map!.image!.toDataURL("image/png"));
  writeFileSync(`${SHOTS}/agenda-tv.png`, Buffer.from(png.split(",")[1]!, "base64"));

  // Entrar: anda até a sala e o cartão some.
  await card.getByRole("button", { name: "Entrar" }).click();
  await expect(card).toBeHidden();
  await expect.poll(() => page.evaluate(() => (window as unknown as HW).__infinity.world().zones.zoneAt((window as unknown as HW).__infinity.self)?.id), { timeout: 40_000 }).toBe("eclipse");

  // Ajustes › Agenda: desconectar tira o balão e a reserva.
  await page.getByRole("button", { name: "Áudio e vídeo" }).click();
  const settings = page.getByRole("dialog", { name: "Áudio e vídeo" });
  await settings.getByRole("button", { name: "Desconectar a Google Agenda" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/agenda-ajustes.png` });
  await settings.getByRole("button", { name: "Desconectar a Google Agenda" }).click();
  await expect(settings.getByRole("button", { name: "Conectar a Google Agenda" })).toBeVisible();
  await expect.poll(note, { timeout: 20_000 }).toBe("");
  await expect.poll(orange, { timeout: 15_000 }).toBe(0);
});

test("agenda: o balão escolhido pela pessoa não é trocado", async ({ browser }) => {
  const now = Date.now();
  const view = { configured: true, connected: true, events: [{ id: "ev2", title: "1:1", start: now - 60_000, end: now + 20 * 60_000 }], rooms: [] };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.route("**/api/agenda", (r) => r.fulfill({ json: view }));
  const page = await ctx.newPage();
  await page.goto("/?nome=Quela&lente=2d");
  await page.waitForFunction(() => !!(window as unknown as Partial<W>).__infinity?.store.getState().selfId, null, { timeout: 30_000 });
  const id = await selfId(page);
  const note = () => page.evaluate((id) => (window as unknown as HW).__infinity.store.getState().players[id]?.note ?? "", id);
  await expect.poll(note).toMatch(/^📅 Em reunião até /);
  // Sem sala nem Meet: não há cartão de Entrar.
  await expect(page.getByRole("dialog", { name: /Reunião/ })).toHaveCount(0);
  // A pessoa troca o balão: a agenda não mexe mais nele.
  await page.getByRole("button", { name: /^Status: 📅 Em reunião/ }).click();
  await page.getByLabel("Escreva um status").fill("Revisando PR");
  await page.keyboard.press("Enter");
  await expect.poll(note).toBe("Revisando PR");
  await page.waitForTimeout(16_000);
  expect(await note()).toBe("Revisando PR");
});
