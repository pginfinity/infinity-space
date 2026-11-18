import { expect, test, type Page } from "./setup.ts";
import { actState, enter, shot, walkNear, zoneOf, type W } from "./grupo-comum.ts";

/**
 * Palavra secreta no Marketing Studio com quatro pessoas (dois times de dois): Ana abre a mesa pelo
 * painel de letras (E), os outros entram pelo convite. Em cada vez, quem dá as dicas e o time
 * adversário veem a carta; quem chuta, não. Dica escrita com palavra proibida é barrada, acerto sem
 * acento nem maiúscula vale, "Proibida!" decidido pelo dicador, pulo, rodízio e placar final.
 */

interface PalState {
  phase: string;
  coop: boolean;
  turn: number;
  turns: number;
  team: number;
  giver: string | null;
  cardNo: number;
  skips: number;
  flag: { by: string } | null;
  players: Array<{ id: string; name: string; team: number }>;
  teams: Array<{ name: string; score: number }>;
  done: Array<{ word: string; result: string }>;
  winner: number | null;
}

const BOARD = { x: -7.3, z: 6.25 };
const SPOTS = [BOARD, { x: -8.4, z: 6.3 }, { x: -6.2, z: 6.3 }, { x: -7.3, z: 7.2 }];

const fold = (t: string) =>
  t
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const pal = (p: Page) => actState<PalState>(p, "palavra");
const panel = (p: Page) => p.getByRole("dialog", { name: "Palavra secreta" });

async function selfId(page: Page): Promise<string> {
  return page.evaluate(() => (window as unknown as W).__infinity.store.getState().selfId!);
}

/** A palavra aparece no painel desta pessoa (como palavra inteira)? */
async function panelShows(page: Page, word: string): Promise<boolean> {
  const text = fold(await panel(page).innerText());
  return new RegExp(`(^| )${fold(word)}( |$)`).test(text);
}

test("Palavra secreta: times, carta escondida, dica barrada, acerto, proibida e rodízio", async ({ browser }) => {
  test.setTimeout(720_000);
  const names = ["Ana", "Bruno", "Caio", "Duda"];
  // A janela 3D (mais pesada) entra primeiro.
  const duda = await enter(browser, "Duda", "3d");
  const ana = await enter(browser, "Ana", "2d");
  const pages = [ana, await enter(browser, "Bruno", "2d"), await enter(browser, "Caio", "2d"), duda];
  const ids = await Promise.all(pages.map(selfId));
  const pageOf = (id: string) => pages[ids.indexOf(id)]!;

  await expect.poll(async () => (await pal(ana))?.phase, { timeout: 45_000 }).toBe("idle");
  for (const [i, p] of pages.entries()) await walkNear(p, SPOTS[i]!, i === 0 ? 0.5 : 0.7);
  for (const p of pages) expect(await zoneOf(p)).toBe("marketing");
  await ana.waitForTimeout(600);
  await shot(ana, "grupo-palavra-painel-2d");
  await shot(duda, "grupo-palavra-painel-3d");

  // Ana abre a mesa pelo painel de letras; os outros entram pelo convite.
  await expect(ana.getByText("Jogar Palavra secreta").first()).toBeVisible({ timeout: 15_000 });
  await ana.keyboard.press("KeyE");
  await expect(panel(ana).getByRole("button", { name: "Começar" })).toBeDisabled({ timeout: 15_000 });
  for (const p of pages.slice(1)) {
    await p.getByRole("button", { name: "Palavra secreta no Marketing" }).click();
    await expect(panel(p).getByText("Ana", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  }
  // Quatro pessoas: dois times de dois; uma rodada (cada um dá dicas uma vez).
  await expect(panel(ana).locator("[data-pal-teambox]")).toHaveCount(2);
  await panel(ana).getByRole("radiogroup", { name: "Tempo por vez" }).getByRole("radio", { name: "60s" }).click();
  await panel(ana).getByRole("radiogroup", { name: "Rodadas" }).getByRole("radio", { name: "1", exact: true }).click();
  await expect.poll(async () => (await pal(ana)).players.map((p) => p.team).sort().join()).toBe("0,0,1,1");
  await ana.waitForTimeout(300);
  await shot(ana, "grupo-palavra-lobby");
  await panel(ana).getByRole("button", { name: "Começar" }).click();
  await expect.poll(async () => (await pal(ana)).phase, { timeout: 15_000 }).toBe("ready");
  expect((await pal(ana)).turns).toBe(4);

  const givers: string[] = [];
  const teams: number[] = [];
  for (let turn = 1; turn <= 4; turn++) {
    await expect.poll(async () => (await pal(ana)).turn, { timeout: 20_000 }).toBe(turn);
    await expect.poll(async () => (await pal(ana)).phase, { timeout: 20_000 }).toBe("ready");
    const s = await pal(ana);
    const giverId = s.giver!;
    givers.push(giverId);
    teams.push(s.team);
    const giver = pageOf(giverId);
    const mateId = s.players.find((p) => p.team === s.team && p.id !== giverId)!.id;
    const guesser = pageOf(mateId);
    const judges = s.players.filter((p) => p.team !== s.team).map((p) => pageOf(p.id));

    // Quem dá as dicas começa a vez.
    await expect(panel(giver).getByText("Sua vez de dar dicas!")).toBeVisible({ timeout: 15_000 });
    if (turn === 1) await shot(giver, "grupo-palavra-vez");
    await panel(giver).getByRole("button", { name: "Começar a vez" }).click();
    await expect.poll(async () => (await pal(ana)).phase, { timeout: 15_000 }).toBe("playing");

    // A carta: o dicador e os dois do outro time veem; quem chuta, não (nem no painel, nem no estado).
    const wordEl = panel(giver).locator("[data-pal-word]");
    await expect(wordEl).toBeVisible({ timeout: 15_000 });
    const word = (await wordEl.getAttribute("data-pal-word"))!;
    for (const j of judges) await expect(panel(j).locator(`[data-pal-word="${word}"]`)).toBeVisible({ timeout: 15_000 });
    await expect(panel(guesser).locator("[data-pal-guesser]")).toBeVisible();
    await expect(panel(guesser).locator("[data-pal-word]")).toHaveCount(0);
    expect(await panelShows(guesser, word)).toBe(false);
    expect(JSON.stringify(await pal(guesser))).not.toContain(JSON.stringify(word));

    if (turn === 1) {
      // Dica escrita com palavra proibida não sai; dica limpa chega a todos.
      const forbidden = (await panel(giver).locator("[data-pal-forbidden]").first().getAttribute("data-pal-forbidden"))!;
      const hint = panel(giver).getByRole("textbox", { name: "Dica escrita" });
      await hint.fill(`lembra ${forbidden}`);
      await hint.press("Enter");
      await expect(panel(giver).getByText(/Essa dica entrega/)).toBeVisible({ timeout: 15_000 });
      await hint.fill("dica de teste");
      await hint.press("Enter");
      await expect(panel(guesser).locator("[data-pal-feed]").getByText("dica de teste")).toBeVisible({ timeout: 15_000 });
      expect(await panel(guesser).locator("[data-pal-feed]").innerText()).not.toContain(`lembra ${forbidden}`);

      // Palpite errado vai para o feed; o certo vale sem acento, em maiúsculas e com espaços sobrando.
      const guess = panel(guesser).getByRole("textbox", { name: "Palpite" });
      await guess.fill("zzz");
      await guess.press("Enter");
      await expect(panel(giver).locator("[data-pal-feed]").getByText("zzz")).toBeVisible({ timeout: 15_000 });
      await shot(guesser, "grupo-palavra-chute");
      await shot(giver, "grupo-palavra-dicador");
      await shot(judges[0]!, "grupo-palavra-fiscal");
      await guesser.waitForTimeout(500);
      await guess.fill(`   ${fold(word).toUpperCase()}  `);
      await guess.press("Enter");
      await expect.poll(async () => (await pal(ana)).teams[s.team]!.score, { timeout: 15_000 }).toBe(1);
      await expect(panel(giver).locator("[data-pal-feed]").getByText(new RegExp(`acertou: ${word}`))).toBeVisible();
      await expect(wordEl).not.toHaveAttribute("data-pal-word", word, { timeout: 15_000 });

      // Proibida!: o time adversário aponta e quem decide é o dicador.
      const second = (await wordEl.getAttribute("data-pal-word"))!;
      await panel(judges[0]!).getByRole("button", { name: "Apontar palavra proibida" }).click();
      await expect(panel(giver).getByRole("alert").getByText(/apontou uma palavra proibida/)).toBeVisible({ timeout: 15_000 });
      await expect(panel(guesser).getByRole("textbox", { name: "Palpite" })).toBeDisabled();
      await shot(giver, "grupo-palavra-proibida");
      await panel(giver).getByRole("button", { name: "Falei (−1)" }).click();
      await expect.poll(async () => (await pal(ana)).teams[s.team]!.score, { timeout: 15_000 }).toBe(0);
      await expect(panel(guesser).getByRole("list", { name: "Cartas desta vez" }).getByText(second)).toBeVisible();

      // Pular: até três por vez, sem perder ponto.
      await panel(giver).getByRole("button", { name: /^Pular/ }).click();
      await expect.poll(async () => (await pal(ana)).skips, { timeout: 15_000 }).toBe(2);
      expect((await pal(ana)).teams[s.team]!.score).toBe(0);
      await guesser.waitForTimeout(400);
      await shot(duda, "grupo-palavra-rodada-3d");
      await shot(guesser, "grupo-palavra-rodada-2d");
    } else {
      // Nas outras vezes, um acerto rápido.
      const guess = panel(guesser).getByRole("textbox", { name: "Palpite" });
      await guess.fill(word);
      await guess.press("Enter");
      await expect.poll(async () => (await pal(ana)).cardNo, { timeout: 15_000 }).toBe(2);
    }

    // O tempo acaba: resumo da vez para todos.
    await expect.poll(async () => (await pal(ana)).phase, { timeout: 90_000 }).toBe(turn === 4 ? "final" : "turnEnd");
    if (turn === 1) {
      await expect(panel(guesser).locator("[data-pal-turnend]")).toBeVisible();
      await shot(guesser, "grupo-palavra-fim-da-vez");
    }
    if (turn === 4) break;
  }

  // Rodízio: cada um deu dicas uma vez, times alternando.
  expect(new Set(givers).size).toBe(4);
  expect(teams[0]).not.toBe(teams[1]);
  expect(teams[0]).toBe(teams[2]);

  // Fim: pódio dos times para todos, com confete no painel.
  const s = await pal(ana);
  expect(s.phase).toBe("final");
  for (const p of pages) await expect(panel(p).locator("[data-podium]")).toBeVisible({ timeout: 15_000 });
  const title = s.winner === null ? "Empate!" : `${s.teams[s.winner]!.name} venceu!`;
  const loser = s.winner === null ? ana : pages.find((_, i) => s.players.find((p) => p.id === ids[i])!.team !== s.winner)!;
  await expect(panel(loser).getByText(title)).toBeVisible();
  await ana.waitForTimeout(700);
  await shot(ana, "grupo-palavra-final-2d");
  await shot(duda, "grupo-palavra-final-3d");
  await ana.keyboard.press("Escape");
  await duda.keyboard.press("Escape");
  await ana.waitForTimeout(500);
  await shot(ana, "grupo-palavra-painel-final-2d");
  await shot(duda, "grupo-palavra-painel-final-3d");

  // Duda fechou o painel: volta pelo convite e sai.
  await duda.getByRole("button", { name: "Voltar à Palavra secreta" }).click();
  for (const p of pages.slice(1)) await panel(p).getByRole("button", { name: "Sair do jogo" }).click();
  await ana.keyboard.press("KeyE");
  await panel(ana).getByRole("button", { name: "Sair do jogo" }).click();
  await expect.poll(async () => (await pal(ana)).phase).toBe("idle");
  void names;
});
