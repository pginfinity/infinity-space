import { expect, test, type Page } from "./setup.ts";
import { SHOTS, enter, objects, selfId, settle, walkTo } from "./arcade-util.ts";

/**
 * Jogos de mesa do café: damas, dominó e truco. Em cada um, duas janelas (uma no 2D e outra no 3D)
 * sentam e jogam alguns lances pelo painel. Uma terceira pessoa assiste e confere que as mãos não chegam
 * a ela (nem a quem joga, a mão do outro). No fim, quem passa vê as partidas no tampo das mesas.
 */

interface Snap {
  table: string;
  kind: string;
  seats: Array<string | null>;
  phase: string;
  state: {
    turn: number;
    acting?: number[];
    moves: number;
    over: boolean;
    winner: number | null;
    hands?: Array<number[] | null>;
    counts?: number[];
    stock?: number[];
    seed?: number;
    raise?: { to: number; team: number } | null;
    score?: [number, number];
    stake?: number;
    lastHand?: { team: number; points: number; how: string } | null;
    lost?: [number, number];
  };
}

const snap = (page: Page, table: string) => page.evaluate((t) => (window as any).__infinity.store.getState().games[t] as Snap, table);
const openGame = (page: Page, table: string) => page.evaluate((t) => (window as any).__infinity.store.getState().openGame(t), table);
const cam = (page: Page, yaw: number, pitch?: number, dist?: number) => page.evaluate(([y, p, d]) => (window as any).__infinityCam?.(y, p, d), [yaw, pitch, dist] as const);

/** Mesa do tipo pedido (objeto do mapa com gameId). */
async function tableOf(page: Page, type: string) {
  const [t] = await objects(page, type);
  expect(t?.gameId, `a planta precisa ter uma mesa ${type} com gameId`).toBeTruthy();
  return t!;
}

/** Espera a pessoa poder agir (vez dela ou entre quem responde). */
async function waitAct(page: Page, table: string) {
  const me = await selfId(page);
  await expect
    .poll(
      async () => {
        const g = await snap(page, table);
        const seat = g.seats.indexOf(me);
        return g.phase === "playing" && seat >= 0 && (g.state.turn === seat || !!g.state.acting?.includes(seat));
      },
      { timeout: 15_000, message: "esperando a vez" },
    )
    .toBe(true);
}

/** Quem age agora, entre as janelas. */
async function actor(pages: Page[], table: string): Promise<Page> {
  const g = await snap(pages[0]!, table);
  for (const p of pages) {
    const seat = g.seats.indexOf(await selfId(p));
    if (seat >= 0 && (g.state.turn === seat || g.state.acting?.includes(seat))) return p;
  }
  throw new Error("ninguém na vez");
}

/** Anda até o ponto; se travar no caminho (alguém no meio), tenta de novo. */
async function reach(page: Page, p: { x: number; z: number }) {
  for (let i = 0; i < 3; i++) {
    try {
      await walkTo(page, p, 0.7);
      return;
    } catch (e) {
      if (i === 2) throw e;
    }
  }
}

/** Nenhuma mão alheia, nenhum monte e nenhuma semente no estado que chegou a esta janela. */
async function expectNoLeak(page: Page, table: string) {
  const me = await selfId(page);
  const g = await snap(page, table);
  const seat = g.seats.indexOf(me);
  expect(g.state.seed, "semente não sai do servidor").toBeUndefined();
  if (g.state.stock) expect(g.state.stock, "monte não sai do servidor").toEqual([]);
  if (g.state.over) return;
  (g.state.hands ?? []).forEach((h, i) => {
    if (i !== seat) expect(h, `mão do lugar ${i} escondida de ${me}`).toBeNull();
  });
}

test("Damas: captura obrigatória pelo painel, 2D e 3D", async ({ browser }) => {
  test.setTimeout(150_000);
  const ana = await enter(browser, "Ana", "2d");
  const bruno = await enter(browser, "Bruno", "3d");
  const table = await tableOf(ana, "checkers-table");
  const id = table.gameId!;
  await expect.poll(async () => (await snap(ana, id))?.kind, { timeout: 30_000 }).toBe("checkers");

  for (const p of [ana, bruno]) await openGame(p, id);
  const panelA = ana.getByRole("dialog", { name: "Damas" });
  const panelB = bruno.getByRole("dialog", { name: "Damas" });
  await panelA.getByRole("button", { name: "Sentar como Claras" }).click();
  await expect.poll(async () => (await snap(ana, id)).seats[0], { timeout: 40_000 }).toBe(await selfId(ana));
  await panelB.getByRole("button", { name: "Sentar como Escuras" }).click();
  await expect.poll(async () => (await snap(bruno, id)).phase, { timeout: 40_000 }).toBe("playing");

  const sq = (page: Page, name: string) => page.getByRole("dialog", { name: "Damas" }).getByRole("gridcell", { name: new RegExp(`^Casa ${name}\\b`) });
  // Escuras veem o tabuleiro virado.
  expect(await panelA.getByRole("gridcell").first().getAttribute("aria-label")).toMatch(/^Casa a8/);
  expect(await panelB.getByRole("gridcell").first().getAttribute("aria-label")).toMatch(/^Casa h1/);

  const move = async (page: Page, ...squares: string[]) => {
    await waitAct(page, id);
    const before = (await snap(page, id)).state.moves;
    for (const s of squares) await sq(page, s).click();
    await expect.poll(async () => (await snap(page, id)).state.moves, { timeout: 10_000 }).toBe(before + 1);
  };

  await move(ana, "c3", "d4");
  await move(bruno, "f6", "e5");
  // Captura obrigatória: a3-b4 não vale; o aviso aparece e só d4 pode ser escolhida.
  await waitAct(ana, id);
  await expect(panelA.getByText("Captura obrigatória")).toBeVisible();
  await sq(ana, "a3").click();
  await sq(ana, "b4").click();
  await ana.waitForTimeout(400);
  expect((await snap(ana, id)).state.moves).toBe(2);
  await move(ana, "d4", "f6");
  expect((await snap(ana, id)).state.lost).toEqual([0, 1]);
  await move(bruno, "g7", "e5");
  await move(ana, "e3", "f4");
  await waitAct(bruno, id);
  await settle(ana, 700);
  await panelA.screenshot({ path: `${SHOTS}/cafe-damas-painel.png` });
  await panelB.screenshot({ path: `${SHOTS}/cafe-damas-painel-escuras.png` });

  // O mundo nas duas lentes: painel fechado, a partida aparece no tampo.
  for (const p of [ana, bruno]) await p.keyboard.press("Escape");
  await cam(bruno, 200, 0.75, 4);
  await settle(bruno, 1500);
  await ana.screenshot({ path: `${SHOTS}/cafe-damas-2d.png` });
  await bruno.screenshot({ path: `${SHOTS}/cafe-damas-3d.png` });

  await openGame(ana, id);
  await panelA.getByRole("button", { name: "Desistir" }).click();
  await panelA.getByRole("button", { name: "Sim, desistir" }).click();
  await openGame(bruno, id);
  await expect(panelB.getByText("Você venceu!")).toBeVisible({ timeout: 10_000 });
  await panelA.getByRole("button", { name: "Levantar" }).click();
  await panelB.getByRole("button", { name: "Levantar" }).click();
  await expect.poll(async () => (await snap(ana, id)).seats).toEqual([null, null]);
});

test("Dominó: dois jogam pelo painel (2D e 3D), cada um vê só a própria mão", async ({ browser }) => {
  test.setTimeout(180_000);
  const ana = await enter(browser, "Ana", "2d");
  const bruno = await enter(browser, "Bruno", "3d");
  const carla = await enter(browser, "Carla", "2d");
  const table = await tableOf(ana, "domino-table");
  const id = table.gameId!;
  await expect.poll(async () => (await snap(ana, id))?.kind, { timeout: 30_000 }).toBe("domino");

  for (const p of [ana, bruno, carla]) await openGame(p, id);
  const panel = (p: Page) => p.getByRole("dialog", { name: "Dominó" });
  await panel(ana).getByRole("button", { name: "Sentar no lugar 1" }).click();
  await expect.poll(async () => (await snap(ana, id)).seats[0], { timeout: 40_000 }).toBe(await selfId(ana));
  await panel(bruno).getByRole("button", { name: "Sentar no lugar 3" }).click();
  await expect.poll(async () => (await snap(bruno, id)).seats[2], { timeout: 40_000 }).toBe(await selfId(bruno));
  // Quem assiste não começa; quem está sentado começa com dois.
  await expect(panel(carla).getByRole("button", { name: "Começar partida" })).toHaveCount(0);
  await settle(ana, 400);
  await panel(ana).screenshot({ path: `${SHOTS}/cafe-domino-espera.png` });
  await panel(ana).getByRole("button", { name: "Começar partida" }).click();
  await expect.poll(async () => (await snap(carla, id)).phase, { timeout: 10_000 }).toBe("playing");

  // Cada um tem 7 pedras na mão e vê só as suas; quem assiste não vê nenhuma; o monte não chega a ninguém.
  await expect(panel(ana).getByRole("region", { name: "Sua mão" }).getByRole("button", { name: /^Pedra/ })).toHaveCount(7);
  await expect(panel(bruno).getByRole("region", { name: "Sua mão" }).getByRole("button", { name: /^Pedra/ })).toHaveCount(7);
  await expect(panel(carla).getByRole("region", { name: "Sua mão" })).toHaveCount(0);
  for (const p of [ana, bruno, carla]) await expectNoLeak(p, id);
  expect((await snap(carla, id)).state.counts).toEqual([7, 0, 7, 0]);

  // Alguns lances, sempre pelo painel de quem está na vez.
  for (let i = 0; i < 8; i++) {
    const g = await snap(ana, id);
    if (g.phase !== "playing") break;
    const who = await actor([ana, bruno], id);
    const before = g.state.moves;
    const p = panel(who);
    const buy = p.getByRole("button", { name: "Comprar" });
    const pass = p.getByRole("button", { name: "Passar" });
    if (await buy.isVisible()) await buy.click();
    else if (await pass.isVisible()) await pass.click();
    else {
      const tiles = p.getByRole("region", { name: "Sua mão" }).getByRole("button", { name: /^Pedra/ });
      const first = await tiles.evaluateAll((els) => els.findIndex((e) => !(e as HTMLButtonElement).disabled));
      expect(first, "alguma pedra serve").toBeGreaterThanOrEqual(0);
      await tiles.nth(first).click();
      const ends = p.getByRole("group", { name: "Em qual ponta?" });
      if (await ends.isVisible().catch(() => false)) await ends.getByRole("button").first().click();
    }
    await expect.poll(async () => (await snap(ana, id)).state.moves, { timeout: 10_000 }).toBeGreaterThan(before);
    for (const q of [ana, bruno, carla]) await expectNoLeak(q, id);
    if (i === 3) {
      await settle(ana, 500);
      await panel(ana).screenshot({ path: `${SHOTS}/cafe-domino-painel.png` });
      await panel(bruno).screenshot({ path: `${SHOTS}/cafe-domino-painel-bruno.png` });
      await panel(carla).screenshot({ path: `${SHOTS}/cafe-domino-assistindo.png` });
    }
  }

  for (const p of [ana, bruno]) await p.keyboard.press("Escape");
  await cam(bruno, 200, 0.8, 3.6);
  await settle(bruno, 1500);
  await ana.screenshot({ path: `${SHOTS}/cafe-domino-2d.png` });
  await bruno.screenshot({ path: `${SHOTS}/cafe-domino-3d.png` });

  // Bruno desiste: Ana vence; as mãos aparecem para todos no fim.
  await openGame(bruno, id);
  await openGame(ana, id);
  await panel(bruno).getByRole("button", { name: "Desistir" }).click();
  await panel(bruno).getByRole("button", { name: "Sim, desistir" }).click();
  await expect(panel(ana).getByText("Você venceu!")).toBeVisible({ timeout: 10_000 });
  await expect(panel(carla).getByText("Ana venceu!")).toBeVisible({ timeout: 10_000 });
  await settle(ana, 1200);
  await panel(ana).screenshot({ path: `${SHOTS}/cafe-domino-fim.png` });
  await panel(ana).getByRole("button", { name: "Levantar" }).click();
  await panel(bruno).getByRole("button", { name: "Levantar" }).click();
  await expect.poll(async () => (await snap(ana, id)).seats).toEqual([null, null, null, null]);
});

test("Truco: mano a mano pelo painel (2D e 3D), com truco aceito e seis corrido", async ({ browser }) => {
  test.setTimeout(240_000);
  const ana = await enter(browser, "Ana", "2d");
  const bruno = await enter(browser, "Bruno", "3d");
  const carla = await enter(browser, "Carla", "3d");
  const table = await tableOf(ana, "cards-table");
  const id = table.gameId!;
  await expect.poll(async () => (await snap(ana, id))?.kind, { timeout: 30_000 }).toBe("truco");

  for (const p of [ana, bruno, carla]) await openGame(p, id);
  const panel = (p: Page) => p.getByRole("dialog", { name: "Truco" });
  await panel(ana).getByRole("button", { name: "Sentar no lugar 1" }).click();
  await expect.poll(async () => (await snap(ana, id)).seats[0], { timeout: 40_000 }).toBe(await selfId(ana));
  await panel(bruno).getByRole("button", { name: "Sentar no lugar 3" }).click();
  await expect.poll(async () => (await snap(bruno, id)).seats[2], { timeout: 40_000 }).toBe(await selfId(bruno));
  await panel(bruno).getByRole("button", { name: "Começar partida" }).click();
  await expect.poll(async () => (await snap(carla, id)).phase, { timeout: 10_000 }).toBe("playing");

  // Três cartas na mão de cada um; quem assiste não vê nenhuma.
  await expect(panel(ana).getByRole("region", { name: "Suas cartas" }).getByRole("button")).toHaveCount(3);
  await expect(panel(carla).getByRole("region", { name: "Suas cartas" })).toHaveCount(0);
  for (const p of [ana, bruno, carla]) await expectNoLeak(p, id);

  const playCard = async (p: Page) => {
    await waitAct(p, id);
    const before = (await snap(p, id)).state.moves;
    await panel(p).getByRole("region", { name: "Suas cartas" }).getByRole("button").first().click();
    await expect.poll(async () => (await snap(p, id)).state.moves, { timeout: 10_000 }).toBeGreaterThan(before);
  };

  // Quem começa pede truco e o outro aceita: a mão passa a valer 3.
  const first = await actor([ana, bruno], id);
  const second = first === ana ? bruno : ana;
  await panel(first).getByRole("button", { name: "Truco!" }).click();
  await expect(panel(second).getByText(/pediu truco!/)).toBeVisible({ timeout: 10_000 });
  await expect(panel(carla).getByText(/pediu truco!/)).toBeVisible({ timeout: 10_000 });
  await settle(second, 500);
  await panel(second).screenshot({ path: `${SHOTS}/cafe-truco-pedido.png` });
  await panel(second).getByRole("button", { name: "Aceitar" }).click();
  await expect.poll(async () => (await snap(ana, id)).state.stake, { timeout: 10_000 }).toBe(3);
  await playCard(first);
  await playCard(second);
  for (const p of [ana, bruno, carla]) await expectNoLeak(p, id);
  await settle(ana, 600);
  await panel(ana).screenshot({ path: `${SHOTS}/cafe-truco-painel.png` });
  await panel(carla).screenshot({ path: `${SHOTS}/cafe-truco-assistindo.png` });

  // Joga a mão até o fim (cada um a primeira carta da mão): vale 3 para quem levar.
  for (let i = 0; i < 6 && (await snap(ana, id)).state.lastHand == null; i++) await playCard(await actor([ana, bruno], id));
  const done = (await snap(ana, id)).state;
  expect(done.lastHand?.how === "tie" ? 0 : 3).toBe(done.lastHand?.points);
  expect((done.score ?? [0, 0])[0] + (done.score ?? [0, 0])[1]).toBe(done.lastHand?.points);

  // Mão seguinte: quem começa pede truco, o outro pede seis e quem pediu primeiro corre (os outros marcam 3).
  const asker = await actor([ana, bruno], id);
  const other = asker === ana ? bruno : ana;
  await panel(asker).getByRole("button", { name: "Truco!" }).click();
  await panel(other).getByRole("button", { name: "Seis!" }).click();
  await expect(panel(asker).getByText(/pediu seis!/)).toBeVisible({ timeout: 10_000 });
  await panel(asker).getByRole("button", { name: "Correr" }).click();
  await expect.poll(async () => (await snap(ana, id)).state.lastHand, { timeout: 10_000 }).toMatchObject({ how: "run", points: 3 });
  await expect(panel(other).locator("[data-hand-result]")).toContainText("Nós marcamos 3 pontos");
  await expect(panel(asker).locator("[data-hand-result]")).toContainText("Eles marcaram 3 pontos");
  await settle(other, 500);
  await panel(other).screenshot({ path: `${SHOTS}/cafe-truco-correu.png` });
  for (const p of [ana, bruno, carla]) await expectNoLeak(p, id);

  for (const p of [ana, bruno]) await p.keyboard.press("Escape");
  await cam(bruno, 200, 0.8, 3.6);
  await settle(bruno, 1500);
  await ana.screenshot({ path: `${SHOTS}/cafe-truco-2d.png` });
  await bruno.screenshot({ path: `${SHOTS}/cafe-truco-3d.png` });

  // Quem passa vê as três mesas do café (dominó, damas e truco), nas duas lentes.
  await carla.keyboard.press("Escape");
  const duda = await enter(browser, "Duda", "2d");
  // Pontos diferentes: avatares não atravessam um ao outro.
  await Promise.all([reach(carla, { x: -7.7, z: 19.5 }), reach(duda, { x: -6.3, z: 19.5 })]);
  await cam(carla, 180, 0.62, 6.5);
  await settle(carla, 1800);
  await carla.screenshot({ path: `${SHOTS}/cafe-mesas-3d.png` });
  await duda.screenshot({ path: `${SHOTS}/cafe-mesas-2d.png` });

  await openGame(ana, id);
  await panel(ana).getByRole("button", { name: "Desistir" }).click();
  await panel(ana).getByRole("button", { name: "Sim, desistir" }).click();
  await openGame(bruno, id);
  await expect(panel(bruno).getByText("Você venceu!")).toBeVisible({ timeout: 10_000 });
  await panel(ana).getByRole("button", { name: "Levantar" }).click();
  await panel(bruno).getByRole("button", { name: "Levantar" }).click();
  await expect.poll(async () => (await snap(ana, id)).seats).toEqual([null, null, null, null]);
});
