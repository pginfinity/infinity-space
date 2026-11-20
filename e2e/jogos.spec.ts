import { expect, test, type Browser, type Page } from "./setup.ts";

/**
 * Jogos: duas pessoas abrem a mesma mesa, sentam, jogam até alguém vencer, e o painel mostra o resultado.
 * Rode com `npm run dev` no ar. A mesa é aberta direto pelo gancho de desenvolvimento
 * (andar até a mesa e apertar E é do sistema de interação); ao sentar, o avatar anda sozinho até a mesa.
 */

const SHOTS = "test-results/screens";

interface Snap {
  table: string;
  kind: string;
  seats: Array<string | null>;
  phase: string;
  state: { turn: number; winner: number | null; over: boolean; moves: number };
}

async function enter(browser: Browser, name: string): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`/?nome=${encodeURIComponent(name)}&lente=2d`);
  await page.waitForFunction(() => !!(window as any).__infinity?.store.getState().selfId, null, { timeout: 30_000 });
  return page;
}

/** Primeira mesa do tipo pedido que esteja livre (estado vindo do servidor no welcome). */
async function findTable(page: Page, kind: string): Promise<string | null> {
  return page.evaluate((k) => {
    const games = Object.values((window as any).__infinity.store.getState().games) as Snap[];
    const free = games.filter((g) => g.kind === k && g.seats.every((s) => s === null));
    return (free[0] ?? games.find((g) => g.kind === k))?.table ?? null;
  }, kind);
}

const snap = (page: Page, table: string) => page.evaluate((t) => (window as any).__infinity.store.getState().games[t] as Snap, table);
const selfId = (page: Page) => page.evaluate(() => (window as any).__infinity.store.getState().selfId as string);
const openGame = (page: Page, table: string) => page.evaluate((t) => (window as any).__infinity.store.getState().openGame(t), table);

/** Espera ser a vez desta pessoa. */
async function waitTurn(page: Page, table: string) {
  const me = await selfId(page);
  await expect.poll(async () => {
    const g = await snap(page, table);
    return g.phase === "playing" && g.seats[g.state.turn] === me;
  }, { timeout: 10_000, message: "esperando a vez" }).toBe(true);
}

test("Lig 4: sentar, jogar até vencer e pedir revanche", async ({ browser }) => {
  test.setTimeout(120_000);
  const ana = await enter(browser, "Ana");
  const bruno = await enter(browser, "Bruno");

  const table = await findTable(ana, "connect4");
  expect(table, "a planta precisa ter uma mesa de Lig 4 (objeto connect4-table com gameId)").not.toBeNull();
  const id = table!;

  await openGame(ana, id);
  await openGame(bruno, id);
  const panelA = ana.getByRole("dialog", { name: "Lig 4" });
  const panelB = bruno.getByRole("dialog", { name: "Lig 4" });
  await expect(panelA).toBeVisible();
  await expect(panelB).toBeVisible();

  // Sentar: se estiver longe, o avatar anda até a mesa e senta ao chegar.
  const anaId = await selfId(ana);
  const brunoId = await selfId(bruno);
  await panelA.getByRole("button", { name: "Sentar como Laranja" }).click();
  await expect.poll(async () => (await snap(ana, id)).seats[0], { timeout: 30_000, message: "Ana sentou" }).toBe(anaId);
  await panelB.getByRole("button", { name: "Sentar como Branco" }).click();
  await expect.poll(async () => (await snap(bruno, id)).phase, { timeout: 30_000, message: "partida começou" }).toBe("playing");
  expect((await snap(bruno, id)).seats).toEqual([anaId, brunoId]);

  // Ana liga quatro na coluna 1; Bruno joga na coluna 2.
  const plays: Array<[Page, number]> = [
    [ana, 1],
    [bruno, 2],
    [ana, 1],
    [bruno, 2],
    [ana, 1],
    [bruno, 2],
  ];
  for (const [page, col] of plays) {
    await waitTurn(page, id);
    await page.getByRole("dialog", { name: "Lig 4" }).getByRole("button", { name: `Coluna ${col}` }).click();
  }
  await waitTurn(ana, id);
  await expect(panelA.getByText("Sua vez").first()).toBeVisible();
  await ana.waitForTimeout(700);
  await panelA.screenshot({ path: `${SHOTS}/jogos-lig4-meio.png` });

  await panelA.getByRole("button", { name: "Coluna 1" }).click();
  await expect(panelA.getByText("Você venceu!")).toBeVisible({ timeout: 10_000 });
  await expect(panelB.getByText("Você perdeu")).toBeVisible({ timeout: 10_000 });
  const end = await snap(bruno, id);
  expect(end.phase).toBe("finished");
  expect(end.state.winner).toBe(0);

  await ana.waitForTimeout(1600);
  await bruno.waitForTimeout(300);
  await panelA.screenshot({ path: `${SHOTS}/jogos-lig4-vitoria.png` });
  await panelB.screenshot({ path: `${SHOTS}/jogos-lig4-derrota.png` });
  await ana.screenshot({ path: `${SHOTS}/jogos-lig4-ana.png` });
  await bruno.screenshot({ path: `${SHOTS}/jogos-lig4-bruno.png` });

  // Revanche: os dois aceitam e os lados trocam (Bruno passa a ser Laranja e começa).
  await panelA.getByRole("button", { name: "Revanche" }).click();
  await expect(panelB.getByText("Ana quer revanche")).toBeVisible({ timeout: 10_000 });
  await panelB.getByRole("button", { name: "Aceitar revanche" }).click();
  await expect.poll(async () => (await snap(ana, id)).seats, { timeout: 10_000 }).toEqual([brunoId, anaId]);
  expect((await snap(ana, id)).phase).toBe("playing");

  // Bruno desiste; os dois levantam e a mesa fica livre de novo.
  await waitTurn(bruno, id);
  await panelB.getByRole("button", { name: "Desistir" }).click();
  await panelB.getByRole("button", { name: "Sim, desistir" }).click();
  await expect(panelA.getByText("Você venceu!")).toBeVisible({ timeout: 10_000 });
  await panelA.getByRole("button", { name: "Levantar" }).click();
  await panelB.getByRole("button", { name: "Levantar" }).click();
  await expect.poll(async () => (await snap(ana, id)).seats, { timeout: 10_000 }).toEqual([null, null]);

  // Esc fecha o painel.
  await ana.keyboard.press("Escape");
  await expect(panelA).toBeHidden();

  await ana.context().close();
  await bruno.context().close();
});

test("Xadrez: lances legais por clique e xeque-mate", async ({ browser }) => {
  test.setTimeout(120_000);
  const ana = await enter(browser, "Ana");
  const bruno = await enter(browser, "Bruno");

  const table = await findTable(ana, "chess");
  expect(table, "a planta precisa ter uma mesa de xadrez (objeto chess-table com gameId)").not.toBeNull();
  const id = table!;

  await openGame(ana, id);
  await openGame(bruno, id);
  const panelA = ana.getByRole("dialog", { name: "Xadrez" });
  const panelB = bruno.getByRole("dialog", { name: "Xadrez" });
  await panelA.getByRole("button", { name: "Sentar como Brancas" }).click();
  await expect.poll(async () => (await snap(ana, id)).seats[0], { timeout: 30_000 }).not.toBeNull();
  await panelB.getByRole("button", { name: "Sentar como Pretas" }).click();
  await expect.poll(async () => (await snap(bruno, id)).phase, { timeout: 30_000 }).toBe("playing");

  const sq = (page: Page, s: string) => page.getByRole("dialog", { name: "Xadrez" }).getByRole("gridcell", { name: new RegExp(`^Casa ${s}\\b`) });

  // Tabuleiro na orientação certa: a1 escura e h1 clara para as brancas; virado para as pretas.
  const bg = (page: Page, s: string) => sq(page, s).evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await bg(ana, "a1")).toBe("rgb(76, 110, 156)");
  expect(await bg(ana, "h1")).toBe("rgb(230, 224, 214)");
  const firstCell = (page: Page) => page.getByRole("dialog", { name: "Xadrez" }).getByRole("gridcell").first().getAttribute("aria-label");
  expect(await firstCell(ana)).toMatch(/^Casa a8/);
  expect(await firstCell(bruno)).toMatch(/^Casa h1/);

  // Clicar na peça mostra os lances; clicar num destino ilegal não joga.
  await sq(ana, "f2").click();
  await expect(sq(ana, "f2")).toHaveAttribute("aria-selected", "true");
  await sq(ana, "f5").click();
  expect((await snap(ana, id)).state.moves).toBe(0);

  // Mate do louco: 1. f3 e5 2. g4 Dh4#
  const moves: Array<[Page, string, string]> = [
    [ana, "f2", "f3"],
    [bruno, "e7", "e5"],
    [ana, "g2", "g4"],
    [bruno, "d8", "h4"],
  ];
  for (const [page, from, to] of moves) {
    await waitTurn(page, id);
    await sq(page, from).click();
    await sq(page, to).click();
  }
  await expect(panelB.getByText("Você venceu!")).toBeVisible({ timeout: 10_000 });
  await expect(panelA.getByText("Xeque-mate")).toBeVisible();
  await bruno.waitForTimeout(1600);
  await panelB.screenshot({ path: `${SHOTS}/jogos-xadrez-mate.png` });

  await panelA.getByRole("button", { name: "Levantar" }).click();
  await panelB.getByRole("button", { name: "Levantar" }).click();
  await ana.context().close();
  await bruno.context().close();
});

test("janela do jogo: grande e no meio no computador, tela toda no celular, minimizar e voltar", async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext();
  const ana = await ctx.newPage();
  await ana.goto("/?nome=Ana&lente=3d");
  await ana.waitForFunction(() => !!(window as any).__infinity?.store.getState().selfId, null, { timeout: 30_000 });
  const id = (await findTable(ana, "chess"))!;
  await openGame(ana, id);
  const win = ana.getByRole("dialog", { name: "Xadrez" });
  await expect(win).toBeVisible();
  await ana.waitForTimeout(600);
  // Ocupa a maior parte da tela e fica no meio (antes abria pequena no canto).
  const box = (await win.boundingBox())!;
  expect(box.height).toBeGreaterThan(900 * 0.7);
  expect(Math.abs(box.x + box.width / 2 - 1440 / 2)).toBeLessThan(4);
  await ana.screenshot({ path: `${SHOTS}/jogos-janela-3d.png` });

  // Minimizar: a janela some, o botão de voltar fica; voltar reabre a mesma mesa.
  await win.getByRole("button", { name: "Minimizar" }).click();
  await expect(win).toBeHidden();
  const back = ana.getByRole("button", { name: "Voltar ao jogo · Xadrez" });
  await expect(back).toBeVisible();
  await ana.screenshot({ path: `${SHOTS}/jogos-janela-minimizada.png` });
  await back.click();
  await expect(win).toBeVisible();
  await expect(back).toBeHidden();
  await win.getByRole("button", { name: "Fechar (Esc)" }).click();
  await expect(win).toBeHidden();
  await expect(back).toBeHidden();
  await ctx.close();

  // Celular (390 × 844): a janela é a tela toda e o tabuleiro cabe na largura.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const bia = await phone.newPage();
  await bia.goto("/?nome=Bia&lente=2d");
  await bia.waitForFunction(() => !!(window as any).__infinity?.store.getState().selfId, null, { timeout: 30_000 });
  await openGame(bia, (await findTable(bia, "chess"))!);
  const winB = bia.getByRole("dialog", { name: "Xadrez" });
  await expect(winB).toBeVisible();
  await bia.waitForTimeout(600);
  const boxB = (await winB.boundingBox())!;
  expect(boxB.width).toBeGreaterThanOrEqual(389);
  expect(boxB.height).toBeGreaterThanOrEqual(843);
  const board = (await winB.getByRole("grid").boundingBox())!;
  expect(board.x).toBeGreaterThanOrEqual(0);
  expect(board.x + board.width).toBeLessThanOrEqual(390);
  expect(board.width).toBeGreaterThan(240);
  await bia.screenshot({ path: `${SHOTS}/jogos-janela-celular.png` });
  await winB.getByRole("button", { name: "Minimizar" }).click();
  await expect(bia.getByRole("button", { name: "Voltar ao jogo · Xadrez" })).toBeVisible();
  await bia.screenshot({ path: `${SHOTS}/jogos-janela-celular-minimizada.png` });
  await phone.close();
});
