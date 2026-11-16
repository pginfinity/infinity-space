import { expect, test } from "./setup.ts";
import { SHOTS, desksIn, enter, expectDrawnMatchesState, priv, reset, send, sitAt, walk, type DeskInfo } from "./mesas-util.ts";

/**
 * Visual das mesas nas duas lentes: objetos pessoais em cada tipo de mesa (dupla e em pé),
 * plaquinha azul (check-in) e dourada (fixa), etiquetas de perto. Gera screenshots para olhar.
 * Cada pessoa faz o check-in e sai (o check-in fica): poucas janelas com WebGL abertas ao mesmo tempo.
 */
test("mesas: objetos e plaquinhas nas duas lentes", async ({ browser }) => {
  test.setTimeout(300_000);
  const checkin = async (name: string, pick: (dev: DeskInfo[]) => DeskInfo, items: string[], extra = "") => {
    const p = await enter(browser, name, "2d", extra);
    await reset(p);
    const d = pick(await desksIn(p, "dev"));
    await sitAt(p, d);
    await send(p, "checkin", { desk: d.id });
    await send(p, "objetos", { items });
    await p.waitForTimeout(400);
    return { p, d };
  };
  const dualOf = (dev: DeskInfo[]) => dev.filter((d) => d.type === "desk-dual").sort((p, q) => p.pos.x - q.pos.x)[0]!;
  const standingOf = (dev: DeskInfo[]) => dev.filter((d) => d.type === "standing-desk")[0]!;

  const ana = await checkin("Ana", dualOf, ["caneca", "cacto", "foguete"], "&admin=1");
  const dual = ana.d;
  const dev = await desksIn(ana.p, "dev");
  const neighbor = dev
    .filter((d) => d.type === "desk-dual" && d.id !== dual.id)
    .sort((p, q) => Math.hypot(p.pos.x - dual.pos.x, p.pos.z - dual.pos.z) - Math.hypot(q.pos.x - dual.pos.x, q.pos.z - dual.pos.z))[0]!;
  // Mesa vizinha fixa de quem não está (com os objetos dela, escolhidos antes).
  await expect.poll(async () => (await priv(ana.p)).admin).toBe(true);
  await send(ana.p, "fixar", { desk: neighbor.id, name: "Carla" });
  await ana.p.waitForTimeout(300);
  await ana.p.context().close();
  const carla = await enter(browser, "Carla", "2d");
  await send(carla, "objetos", { items: ["vasinho", "porta-retrato", "gatinho"] });
  await carla.waitForTimeout(300);
  await carla.context().close();
  const bia = await checkin("Bia", standingOf, ["fones", "luminaria", "globo"]);
  const standing = bia.d;
  await bia.p.context().close();

  // Observador no 2D: perto, com zoom máximo, e na mesa em pé.
  const o2 = await enter(browser, "Olho", "2d");
  await expectDrawnMatchesState(o2);
  await walk(o2, dual.side, 0.8);
  await o2.waitForTimeout(800);
  await o2.screenshot({ path: `${SHOTS}/mesas-mundo-2d.png` });
  await o2.mouse.move(720, 450);
  for (let i = 0; i < 6; i++) await o2.mouse.wheel(0, -300);
  await o2.waitForTimeout(800);
  await o2.screenshot({ path: `${SHOTS}/mesas-mundo-2d-zoom.png` });
  await walk(o2, standing.side, 0.8);
  await o2.waitForTimeout(800);
  await o2.screenshot({ path: `${SHOTS}/mesas-mundo-2d-empe.png` });
  await o2.context().close();

  // Observador no 3D.
  const o3 = await enter(browser, "Olho3d", "3d");
  await expectDrawnMatchesState(o3);
  await walk(o3, dual.side, 1.0);
  await o3.waitForTimeout(1200);
  await o3.screenshot({ path: `${SHOTS}/mesas-mundo-3d.png` });
  await walk(o3, standing.side, 1.0);
  await o3.waitForTimeout(1200);
  await o3.screenshot({ path: `${SHOTS}/mesas-mundo-3d-empe.png` });
  await o3.context().close();

  // Limpa: a Ana desfaz a mesa fixa e libera a dela; a Bia libera a dela.
  const a2 = await enter(browser, "Ana", "2d", "&admin=1");
  await expect.poll(async () => (await priv(a2)).admin).toBe(true);
  await send(a2, "fixar", { desk: neighbor.id, name: "" });
  await reset(a2);
  const b2 = await enter(browser, "Bia", "2d");
  await reset(b2);
  await b2.waitForTimeout(300);
});

/** Celular: o painel "Minha mesa" cabe na tela e não cobre a doca. */
test("mesas: painel no celular", async ({ browser }) => {
  test.setTimeout(90_000);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(`/?nome=Celia&lente=2d`);
  await page.waitForFunction(() => !!(window as unknown as Partial<{ __mesas: { ui: { getState(): { priv: unknown } } } }>).__mesas?.ui.getState().priv, null, { timeout: 30_000 });
  await page.evaluate(() => window.dispatchEvent(new Event("infinity:mesas")));
  const panel = page.getByRole("dialog", { name: "Minha mesa" });
  await expect(panel).toBeVisible();
  await page.waitForTimeout(500);
  const box = (await panel.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  const dock = (await page.getByRole("toolbar", { name: "Controles" }).boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(dock.y);
  await page.screenshot({ path: `${SHOTS}/mesas-celular.png` });
});
