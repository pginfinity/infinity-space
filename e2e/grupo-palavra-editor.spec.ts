import { expect, test, type Page } from "./setup.ts";
import { actState, enter, send, shot, walkNear, zoneOf, type W } from "./grupo-comum.ts";

/**
 * Editor de cartas da Palavra secreta e o modo "todos juntos" com 4 pessoas. Ana abre o editor perto do
 * painel de letras, restaura as cartas originais, cria um tema e uma carta (antes, um erro de validação),
 * escolhe só esse tema e o modo cooperativo. Na vez, quem dá as dicas vê a carta nova e o time acerta.
 * No 2D, o placar do painel aparece numa etiqueta nítida acima dele, por cima de quem está em pé na
 * frente. No fim, o tema é apagado (o banco volta ao original).
 */

interface PalState {
  phase: string;
  coop: boolean;
  mode: string;
  turn: number;
  turns: number;
  giver: string | null;
  themes: string[];
  catalog: Array<{ id: string; label: string; count: number }>;
  players: Array<{ id: string; name: string; team: number }>;
  teams: Array<{ name: string; score: number }>;
}

const BOARD = { x: -7.3, z: 6.25 };
const SPOTS = [BOARD, { x: -8.4, z: 6.3 }, { x: -6.2, z: 6.3 }, { x: -7.3, z: 7.2 }];
const THEME = "Teste e2e";
const WORD = "Infinito";
const ORIGINALS = ["Cotidiano", "Escritório", "Tecnologia", "Cultura brasileira", "Espaço"];

const pal = (p: Page) => actState<PalState>(p, "palavra");
const panel = (p: Page) => p.getByRole("dialog", { name: "Palavra secreta" });
const editor = (p: Page) => p.getByRole("dialog", { name: "Cartas da Palavra secreta" });

async function selfId(page: Page): Promise<string> {
  return page.evaluate(() => (window as unknown as W).__infinity.store.getState().selfId!);
}

/**
 * A etiqueta do painel está na tela e nada a cobre? Os rótulos do mundo (nomes dos avatares, placas)
 * são irmãos com z-index próprio: todo rótulo que encosta nela precisa estar atrás. Quantos encostam
 * (para confirmar que havia alguém na frente).
 */
async function labelOnTop(page: Page): Promise<{ top: boolean; overlapping: number }> {
  return page.evaluate(() => {
    const el = document.querySelector("[data-pal-label]") as HTMLElement | null;
    let host: HTMLElement | null = el;
    while (host && !host.style.zIndex) host = host.parentElement;
    if (!el || !host?.parentElement) return { top: false, overlapping: 0 };
    const z = Number(host.style.zIndex);
    const r = el.getBoundingClientRect();
    // Encosta (com folga de alguns pixels: o painel e o nome de quem está na frente ficam colados).
    const near = (a: DOMRect) => a.width > 0 && a.left < r.right + 6 && a.right > r.left - 6 && a.top < r.bottom + 6 && a.bottom > r.top - 6;
    const others = [...host.parentElement.children].filter((o): o is HTMLElement => o !== host && o instanceof HTMLElement && !!o.style.zIndex && o.style.display !== "none");
    const touching = others.filter((o) => [...o.querySelectorAll("*")].some((c) => near(c.getBoundingClientRect())));
    return { top: r.width > 0 && touching.every((o) => Number(o.style.zIndex) < z), overlapping: touching.length };
  });
}

test("Palavra secreta: editor de cartas, tema novo na partida, todos juntos e placar legível no 2D", async ({ browser }) => {
  test.setTimeout(420_000);
  const ana = await enter(browser, "Ana", "2d");
  const pages = [ana, await enter(browser, "Bruno", "2d"), await enter(browser, "Caio", "2d"), await enter(browser, "Duda", "2d")];
  const [, , , duda] = pages as [Page, Page, Page, Page];
  const ids = await Promise.all(pages.map(selfId));
  const pageOf = (id: string) => pages[ids.indexOf(id)]!;

  await expect.poll(async () => (await pal(ana))?.phase, { timeout: 45_000 }).toBe("idle");
  for (const [i, p] of pages.entries()) await walkNear(p, SPOTS[i]!, i === 0 ? 0.5 : 0.7);
  for (const p of pages) expect(await zoneOf(p)).toBe("marketing");

  // Ana abre a mesa pelo painel de letras e, dali, o editor de cartas.
  await expect(ana.getByText("Jogar Palavra secreta").first()).toBeVisible({ timeout: 15_000 });
  await ana.keyboard.press("KeyE");
  await expect(panel(ana).getByRole("button", { name: "Começar" })).toBeDisabled({ timeout: 15_000 });
  await panel(ana).getByRole("button", { name: "Editar cartas" }).click();
  const ed = editor(ana);
  await expect(ed.getByRole("tab").first()).toBeVisible({ timeout: 15_000 });

  // Começa do banco original (o teste pode ter rodado antes).
  await ed.getByRole("button", { name: "Restaurar as cartas originais" }).click();
  await ed.getByRole("button", { name: "Restaurar", exact: true }).click();
  await expect(ed.getByRole("tab")).toHaveCount(5, { timeout: 15_000 });
  await expect.poll(async () => (await pal(ana)).catalog.map((t) => t.count).join()).toBe("30,30,30,30,30");

  // Tema novo.
  await ed.getByRole("button", { name: "Novo tema" }).click();
  await ed.getByRole("textbox", { name: "Nome do tema" }).fill(THEME);
  await ed.getByRole("textbox", { name: "Nome do tema" }).press("Enter");
  await expect(ed.getByRole("tab", { name: new RegExp(THEME) })).toHaveAttribute("aria-selected", "true", { timeout: 15_000 });
  await expect(ed.getByText("Nenhuma carta neste tema")).toBeVisible();

  // Carta nova: proibida repetida não passa; corrigida, salva.
  await ed.getByRole("button", { name: "Nova carta" }).click();
  const form = ed.getByRole("form", { name: "Nova carta" });
  await form.getByRole("textbox", { name: "Palavra secreta" }).fill(WORD);
  const forbidden = ["fim", "eterno", "Fim", "oito deitado"];
  for (const [i, f] of forbidden.entries()) await form.getByRole("textbox", { name: `Proibida ${i + 1}` }).fill(f);
  await form.getByRole("button", { name: "Salvar" }).click();
  await expect(form.getByRole("alert")).toContainText("todas diferentes");
  await shot(ana, "grupo-palavra-editor-erro");
  await form.getByRole("textbox", { name: "Proibida 3" }).fill("limite");
  await form.getByRole("button", { name: "Salvar" }).click();
  await expect(ed.locator(`[data-pal-edit-card="${WORD}"]`)).toBeVisible({ timeout: 15_000 });
  await expect(form).toHaveCount(0);
  await expect.poll(async () => (await pal(ana)).catalog.find((t) => t.label === THEME)?.count).toBe(1);
  // A carta nunca aparece no estado público (só o nome do tema e quantas cartas).
  expect(JSON.stringify(await pal(duda))).not.toContain(WORD);
  await ana.waitForTimeout(300);
  await shot(ana, "grupo-palavra-editor");

  // Abrir uma carta original mostra a palavra e as 4 proibidas para editar.
  await ed.getByRole("tab", { name: /Espaço/ }).click();
  await ed.getByRole("button", { name: "Editar: Lua" }).click();
  await expect(ed.getByRole("form", { name: "Editar: Lua" }).getByRole("textbox", { name: "Proibida 4" })).not.toHaveValue("");
  await shot(ana, "grupo-palavra-editor-carta");
  await ed.getByRole("form", { name: "Editar: Lua" }).getByRole("button", { name: "Cancelar" }).click();

  // De volta à mesa: só o tema novo.
  await ed.getByRole("button", { name: "Voltar" }).click();
  await expect(panel(ana).locator(`[data-pal-theme="${THEME}"]`)).toHaveAttribute("aria-pressed", "true");
  for (const label of ORIGINALS) {
    await panel(ana).locator(`[data-pal-theme="${label}"]`).click();
    await expect(panel(ana).locator(`[data-pal-theme="${label}"]`)).toHaveAttribute("aria-pressed", "false");
  }
  const themeId = (await pal(ana)).catalog.find((t) => t.label === THEME)!.id;
  await expect.poll(async () => (await pal(ana)).themes.join()).toBe(themeId);

  // Os outros entram pelo convite; com 4, a dona escolhe "Todos juntos".
  for (const p of pages.slice(1)) {
    await p.getByRole("button", { name: "Palavra secreta no Marketing" }).click();
    await expect(panel(p).getByText("Ana", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  }
  // O modo fica de uma partida para a outra: começa em "Dois times" para ver a troca.
  await panel(ana).getByRole("radio", { name: /^Dois times/ }).click();
  await expect.poll(async () => (await pal(ana)).mode).toBe("teams");
  await expect(panel(ana).locator("[data-pal-teambox]")).toHaveCount(2);
  // Quem não abriu a mesa vê o modo, mas não muda.
  await expect(panel(duda).getByRole("radio", { name: /^Todos juntos/ })).toBeDisabled();
  await panel(ana).getByRole("radio", { name: /^Todos juntos/ }).click();
  await expect.poll(async () => (await pal(ana)).mode).toBe("coop");
  await expect(panel(ana).locator("[data-pal-teambox]")).toHaveCount(0);
  await expect(panel(duda).getByRole("radio", { name: /^Todos juntos/ })).toHaveAttribute("aria-checked", "true");
  // 90 s: com várias janelas abertas, a máquina de teste fica lenta.
  await panel(ana).getByRole("radiogroup", { name: "Tempo por vez" }).getByRole("radio", { name: "90s" }).click();
  await panel(ana).getByRole("radiogroup", { name: "Rodadas" }).getByRole("radio", { name: "1", exact: true }).click();
  await ana.waitForTimeout(400);
  await shot(ana, "grupo-palavra-lobby-todos-juntos");
  await panel(ana).getByRole("button", { name: "Começar" }).click();
  await expect.poll(async () => (await pal(ana)).phase, { timeout: 15_000 }).toBe("ready");
  const s = await pal(ana);
  expect(s).toMatchObject({ coop: true, turns: 4, teams: [{ name: "Nebulosa", score: 0 }] });

  // Com a partida começando, o editor some para todo mundo.
  await expect(panel(ana).getByRole("button", { name: "Editar cartas" })).toHaveCount(0);

  // Quem dá as dicas vê a carta nova, com o tema novo; os outros chutam e não a veem.
  const giver = pageOf(s.giver!);
  const guessers = pages.filter((p) => p !== giver);
  await expect(panel(giver).getByText("Sua vez de dar dicas!")).toBeVisible({ timeout: 15_000 });
  await panel(giver).getByRole("button", { name: "Começar a vez" }).click();
  await expect.poll(async () => (await pal(ana)).phase, { timeout: 15_000 }).toBe("playing");
  await expect(panel(giver).locator(`[data-pal-word="${WORD}"]`)).toBeVisible({ timeout: 15_000 });
  await expect(panel(giver).locator("[data-pal-card]")).toContainText(THEME);
  for (const f of ["fim", "eterno", "limite", "oito deitado"]) await expect(panel(giver).locator(`[data-pal-forbidden="${f}"]`)).toBeVisible();
  for (const g of guessers) {
    await expect(panel(g).locator("[data-pal-guesser]")).toBeVisible({ timeout: 15_000 });
    await expect(panel(g).locator("[data-pal-word]")).toHaveCount(0);
    // Todos juntos: ninguém fiscaliza.
    await expect(panel(g).getByRole("button", { name: "Apontar palavra proibida" })).toHaveCount(0);
  }
  await shot(giver, "grupo-palavra-carta-nova");

  // Um palpite certo (sem acento nem maiúscula) vale ponto.
  const watcher = giver === duda ? pages[2]! : duda;
  const guesser = guessers.find((p) => p !== watcher)!;
  const guess = panel(guesser).getByRole("textbox", { name: "Palpite" });
  await guess.fill("infinito");
  await guess.press("Enter");
  await expect.poll(async () => (await pal(ana)).teams[0]!.score, { timeout: 15_000 }).toBe(1);
  // Com uma carta só no tema, ela volta para quem dá as dicas.
  await expect(panel(giver).locator("[data-pal-feed]")).toContainText(`acertou: ${WORD}`);
  await expect(panel(giver).locator(`[data-pal-word="${WORD}"]`)).toBeVisible({ timeout: 15_000 });

  // 2D: placar e tempo legíveis numa etiqueta acima do painel, mesmo com a Ana em pé na frente.
  // (O primeiro Esc só tira o foco do campo de palpite; o segundo fecha o painel.)
  await watcher.keyboard.press("Escape");
  await watcher.keyboard.press("Escape");
  await expect(panel(watcher)).toHaveCount(0);
  const label = watcher.locator("[data-pal-label]");
  await expect(label).toBeVisible({ timeout: 15_000 });
  await expect(label).toContainText("Nebulosa");
  await expect(watcher.locator("[data-pal-label-team='0']")).toContainText("1");
  await expect(watcher.locator("[data-pal-label-time]")).toHaveText(/^[01]:[0-5]\d$/);
  await expect.poll(async () => (await labelOnTop(watcher)).top).toBe(true);
  // A etiqueta nunca mostra a carta.
  await expect(label).not.toContainText(WORD);
  await watcher.waitForTimeout(500);
  await shot(watcher, "grupo-palavra-painel-legivel-2d");

  // A dona encerra: placar final cooperativo.
  await send(ana, "palavra", "end");
  await expect.poll(async () => (await pal(ana)).phase, { timeout: 15_000 }).toBe("final");
  await expect(panel(ana).locator('[data-pal-final="coop"]')).toBeVisible({ timeout: 15_000 });
  await expect(watcher.locator("[data-pal-label]")).toContainText("1 acerto");
  await watcher.waitForTimeout(400);
  await shot(watcher, "grupo-palavra-painel-legivel-final-2d");

  // Todos saem.
  await watcher.getByRole("button", { name: "Voltar à Palavra secreta" }).click();
  for (const p of pages) await panel(p).getByRole("button", { name: "Sair do jogo" }).click();
  await expect.poll(async () => (await pal(ana)).phase).toBe("idle");

  // Limpeza pelo editor: apaga o tema novo (o banco volta a ser o original).
  await ana.keyboard.press("KeyE");
  await panel(ana).getByRole("button", { name: "Editar cartas" }).click();
  await editor(ana).getByRole("tab", { name: new RegExp(THEME) }).click();
  await editor(ana).getByRole("button", { name: "Apagar tema" }).click();
  await editor(ana).getByRole("button", { name: "Apagar", exact: true }).click();
  await expect(editor(ana).getByRole("tab")).toHaveCount(5, { timeout: 15_000 });
  await expect.poll(async () => (await pal(ana)).catalog.length).toBe(5);
  await expect.poll(async () => (await pal(ana)).themes.length).toBe(5);
  await editor(ana).getByRole("button", { name: "Voltar" }).click();
  // O modo volta ao padrão (dois times), para os próximos testes.
  await send(ana, "palavra", "config", { mode: "teams" });
  await expect.poll(async () => (await pal(ana)).mode).toBe("teams");
  await panel(ana).getByRole("button", { name: "Sair do jogo" }).click();
  await expect.poll(async () => (await pal(ana)).phase).toBe("idle");
});
