import { expect, test } from "./setup.ts";
import { enter, selfId, walkNear, zoomIn, type W } from "./vivo-util.ts";

/**
 * Itens na mão: a Ana segura cada item da lista; o chip "Segurando" aparece e o Bruno vê o item
 * (no estado e desenhado). G solta. Screenshots de todos os itens nas duas lentes, andando e sentada.
 */

const ITEMS = ["coffee", "tea", "water", "juice", "popcorn", "paper", "microphone", "trophy", "flower", "watering-can"] as const;
const NAMES: Record<(typeof ITEMS)[number], string> = {
  coffee: "Café",
  tea: "Chá",
  water: "Água",
  juice: "Suco",
  popcorn: "Pipoca",
  paper: "Papel",
  microphone: "Microfone",
  trophy: "Troféu",
  flower: "Flor",
  "watering-can": "Regador",
};

test("segurar e soltar itens, visto pelos dois lados", async ({ browser }) => {
  test.setTimeout(150_000);
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await enter(a, "Ana", "2d");
  await enter(b, "Bruno", "3d");
  const anaId = await selfId(a);

  // Os dois no Átrio: a Ana de frente para o Bruno (a câmera dele olha para o norte, para ela).
  await walkNear(a, { x: 4.0, z: 3.2 }, 0.5);
  await walkNear(b, { x: 4.0, z: 6.0 }, 0.5);
  await a.evaluate(() => ((window as unknown as W).__infinity.self.yaw = Math.PI));
  await b.evaluate(() => ((window as unknown as W).__infinity.self.yaw = 0));
  await zoomIn(a, 6);
  await zoomIn(b, 3);

  for (const it of ITEMS) {
    await a.evaluate((it) => (window as unknown as W).__vivo.hold(it), it);
    await expect(a.getByRole("status").filter({ hasText: "Segurando" })).toContainText(NAMES[it], { timeout: 5000 });
    await expect.poll(() => b.evaluate((id) => (window as unknown as W).__infinity.store.getState().players[id]?.held, anaId)).toBe(it);
    await a.waitForTimeout(500);
    await a.screenshot({ path: `test-results/screens/vivo-mao-2d-${it}.png`, clip: { x: 520, y: 250, width: 400, height: 400 } });
    await b.screenshot({ path: `test-results/screens/vivo-mao-3d-${it}.png`, clip: { x: 540, y: 0, width: 360, height: 330 } });
  }

  // O gole: parada com o café, em alguns segundos ela bebe.
  await a.evaluate(() => (window as unknown as W).__vivo.hold("coffee"));
  await a.waitForTimeout(3300);
  await b.screenshot({ path: "test-results/screens/vivo-mao-3d-gole.png", clip: { x: 540, y: 0, width: 360, height: 330 } });
  await b.screenshot({ path: "test-results/screens/vivo-mao-3d-cena.png" });

  // G solta: o chip some para ela e o item some para ele.
  await a.keyboard.press("KeyG");
  await expect(a.getByRole("status").filter({ hasText: "Segurando" })).toHaveCount(0, { timeout: 5000 });
  await expect.poll(() => b.evaluate((id) => (window as unknown as W).__infinity.store.getState().players[id]?.held ?? null, anaId)).toBeNull();

  // Sentada com o suco, numa banqueta da copa.
  await a.evaluate(() => (window as unknown as W).__vivo.hold("juice"));
  await walkNear(a, { x: -7.6, z: 14.6 }, 0.9);
  await expect.poll(() => a.evaluate(() => (window as unknown as W).__infinity.interact.getState().target?.label ?? "")).toContain("Sentar");
  await a.keyboard.press("KeyE");
  await expect.poll(() => a.evaluate(() => (window as unknown as W).__infinity.self.anim)).toBe("sit");
  await a.waitForTimeout(900);
  await a.screenshot({ path: "test-results/screens/vivo-mao-2d-sentada.png", clip: { x: 520, y: 250, width: 400, height: 400 } });
  await a.keyboard.press("KeyG");
});
