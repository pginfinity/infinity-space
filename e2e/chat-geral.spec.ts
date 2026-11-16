import { expect, test } from "./setup.ts";
import { tag, SHOTS, chatState, composer, dock, enter, openByKey, panel, say, unread, waitOnline } from "./chat-util.ts";

/**
 * Chat Geral: a Ana abre pela tecla C e escreve; o Bruno recebe (ponto no botão, sem som), vê os
 * links clicáveis, o agrupamento e o horário; menção com @ chega com aviso mesmo com o painel
 * fechado; o histórico continua depois de recarregar.
 */
test("Geral: mensagens para todos, links, agrupamento, menção e histórico", async ({ browser }) => {
  const RUN = tag();
  test.setTimeout(120_000);
  const a = await enter(browser, "Ana", "2d");
  const b = await enter(browser, "Bruno", "3d");
  await waitOnline(a, 2);

  // Ana abre pela tecla C; o campo já vem focado.
  await openByKey(a);
  await expect(panel(a).getByRole("tab", { name: /^Geral/ })).toHaveAttribute("aria-selected", "true");
  await expect(composer(a)).toBeFocused();

  const hello = `Bom dia, time! (${RUN})`;
  await a.keyboard.type(hello);
  await a.keyboard.press("Enter");
  // Shift+Enter quebra a linha; link clicável.
  await composer(a).fill("");
  await a.keyboard.type("Pauta da daily:");
  await a.keyboard.press("Shift+Enter");
  await a.keyboard.type(`https://ai-infinity.io/pauta?d=${RUN}.`);
  await a.keyboard.press("Enter");
  await expect(composer(a)).toHaveValue("");

  // As duas aparecem agrupadas (um nome só) com horário em cada uma.
  const log = panel(a).getByRole("log", { name: "Geral" });
  await expect(log.getByText(hello)).toBeVisible({ timeout: 5000 });
  const link = log.getByRole("link", { name: `https://ai-infinity.io/pauta?d=${RUN}` });
  await expect(link).toHaveAttribute("href", `https://ai-infinity.io/pauta?d=${RUN}`);
  await expect(link).toHaveAttribute("rel", "noreferrer");
  await expect(link).toHaveAttribute("target", "_blank");
  const mine = log.locator("[data-chat-msg]").filter({ hasText: RUN });
  await expect(mine).toHaveCount(2);
  await expect(mine.nth(0).locator("time").first()).toHaveText(/^\d{2}:\d{2}$/);
  await expect(mine.nth(1).locator("time")).toHaveText(/^\d{2}:\d{2}$/);
  await expect(mine.nth(1).getByText("Ana", { exact: true })).toHaveCount(0);

  // Bruno: painel fechado, ponto de novas no botão (sem número: Geral não conta como conversa).
  await expect.poll(() => unread(b).then((u) => u.geral), { timeout: 5000 }).toBeGreaterThanOrEqual(2);
  expect((await unread(b)).badge).toBe(0);
  await expect(dock(b)).toHaveAttribute("aria-label", /mensagens novas/);

  // Ana menciona o Bruno: aviso curto para ele, com o painel fechado, e o número no botão.
  await say(a, `@Bruno consegue revisar o PR hoje? ${RUN}`);
  await expect(b.getByText(/Ana mencionou você no Geral/)).toBeVisible({ timeout: 5000 });
  await expect.poll(() => unread(b).then((u) => u.badge)).toBe(1);
  await expect(dock(b)).toHaveAttribute("aria-label", /1 nova/);
  await b.screenshot({ path: `${SHOTS}/chat-mencao-aviso.png` });
  // O aviso não roubou o foco.
  expect(await b.evaluate(() => document.activeElement?.tagName)).not.toBe("TEXTAREA");

  // Bruno abre pelo botão: linha "Novas", menção destacada, contador zera.
  await dock(b).click();
  await expect(panel(b)).toBeVisible();
  const blog = panel(b).getByRole("log", { name: "Geral" });
  await expect(blog.getByText(hello)).toBeVisible();
  await expect(blog.getByRole("separator", { name: "Novas" })).toBeVisible();
  await expect(blog.locator("span", { hasText: "@Bruno" }).first()).toHaveClass(/text-orange/);
  await expect.poll(() => unread(b).then((u) => u.badge + u.geral)).toBe(0);
  await b.waitForTimeout(300);
  await b.screenshot({ path: `${SHOTS}/chat-geral-3d.png` });

  // Responde mencionando com a lista de nomes (@ + Enter escolhe).
  await composer(b).click();
  await b.keyboard.type("@an");
  await expect(panel(b).getByRole("listbox", { name: "Mencionar" })).toBeVisible();
  await b.screenshot({ path: `${SHOTS}/chat-mencao-lista.png` });
  await b.keyboard.press("Enter");
  await expect(composer(b)).toHaveValue("@Ana ");
  await b.keyboard.type(`reviso sim! ${RUN}`);
  await b.keyboard.press("Enter");
  await expect(panel(a).getByRole("log", { name: "Geral" }).getByText(`reviso sim! ${RUN}`)).toBeVisible({ timeout: 5000 });
  await a.waitForTimeout(300);
  await a.screenshot({ path: `${SHOTS}/chat-geral-2d.png` });

  // Esc fecha e devolve o foco ao botão.
  await composer(a).click();
  await a.keyboard.press("Escape");
  await expect(panel(a)).toBeHidden();
  await expect(dock(a)).toBeFocused();

  // Histórico guardado: Bruno recarrega e vê a conversa (e nada conta como não lido).
  await b.reload();
  await b.waitForFunction(() => !!(window as unknown as { __infinity?: { store: { getState(): { selfId: string | null } } } }).__infinity?.store.getState().selfId, null, { timeout: 30_000 });
  await expect.poll(() => chatState(b).then((s) => s.geral.filter((t) => t.includes(RUN)).length), { timeout: 10_000 }).toBe(4);
  expect((await unread(b)).geral).toBe(0);
});

test("Geral: limite de 1000 caracteres e recusa de rajada", async ({ browser }) => {
  const RUN = tag();
  const a = await enter(browser, "Ana", "2d");
  await openByKey(a);
  const long = "x".repeat(1200);
  await composer(a).fill(long);
  await expect(composer(a)).toHaveValue("x".repeat(1000));
  await expect(panel(a).getByText("1000/1000")).toBeVisible();
  await composer(a).fill("");
  // Seis mensagens de uma vez: o servidor aceita cinco por segundo; a sexta pede para tentar de novo.
  await a.evaluate((run) => {
    const w = window as unknown as { __infinity: { acts: { send(id: string, op: string, d: unknown): void } } };
    for (let i = 0; i < 6; i++) w.__infinity.acts.send("chat", "send", { ch: "geral", text: `rajada ${i} ${run}`, cid: `r${i}-${run}` });
  }, RUN);
  await expect.poll(() => chatState(a).then((s) => s.geral.filter((t) => t.startsWith("rajada") && t.endsWith(RUN)).length), { timeout: 5000 }).toBe(5);
});
