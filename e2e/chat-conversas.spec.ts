import { expect, test } from "./setup.ts";
import { tag, SHOTS, chatState, composer, dock, enter, panel, say, tab, unread, waitOnline } from "./chat-util.ts";

/**
 * Conversas diretas: a Ana chama o Bruno pelo botão "Mensagem" do painel Pessoas; só o Bruno
 * recebe (a Carla não), com som, aviso e número no botão. A lista mostra a última mensagem e as não
 * lidas; a conversa continua depois de recarregar (o nome é a chave estável).
 */
test("Conversas: DM pelo painel Pessoas, privada, não lidas e histórico", async ({ browser }) => {
  const RUN = tag();
  test.setTimeout(150_000);
  const a = await enter(browser, "Ana", "2d");
  const b = await enter(browser, "Bruno", "2d");
  const c = await enter(browser, "Carla", "3d");
  await waitOnline(a, 3);

  // Ana: painel Pessoas → "Mensagem para Bruno".
  await a.getByRole("button", { name: /pessoas online/ }).click();
  await a.getByRole("button", { name: "Mensagem para Bruno" }).click();
  await expect(panel(a)).toBeVisible();
  await expect(panel(a).getByRole("tab", { name: /^Conversas/ })).toHaveAttribute("aria-selected", "true");
  await expect(panel(a).getByText("Bruno", { exact: true }).first()).toBeVisible();
  // O painel Pessoas fechou (os dois ocupam o mesmo lugar).
  await expect(a.getByRole("complementary", { name: "Pessoas" })).toBeHidden();

  const secret = `Bruno, a proposta da Acme saiu (${RUN})`;
  await say(a, secret);
  await expect(panel(a).getByRole("log").getByText(secret)).toBeVisible({ timeout: 5000 });

  // Bruno: número no botão, aviso curto e nada no Geral.
  await expect.poll(() => unread(b).then((u) => u.dm), { timeout: 10_000 }).toBe(1);
  await expect(dock(b)).toHaveAttribute("aria-label", /1 nova/);
  await expect(b.getByText(`Ana: ${secret}`)).toBeVisible();
  expect((await chatState(b)).geral).not.toContain(secret);

  // Carla não recebeu nada.
  await c.waitForTimeout(500);
  const cs = await chatState(c);
  expect(cs.convs.flatMap((x) => x.texts)).not.toContain(secret);
  expect(cs.convs.some((x) => x.key === "bruno" || x.key === "ana")).toBe(false);
  expect((await unread(c)).dm).toBe(0);
  // A Carla já cumpriu o papel; o 3D dela (desenhado por software no Chrome de teste) disputaria
  // a CPU com o recarregamento do Bruno lá embaixo.
  await c.context().close();

  // Mais uma, para a lista mostrar a última e duas não lidas.
  const last = `Me liga quando puder ${RUN}`;
  await say(a, last);
  await expect.poll(() => unread(b).then((u) => u.dm)).toBe(2);

  // Bruno abre: aba Conversas com a Ana no topo, prévia e contador.
  await dock(b).click();
  await tab(b, "Conversas");
  const item = panel(b).getByRole("button", { name: /^Ana, 2 não lidas/ });
  await expect(item).toBeVisible();
  await expect(item).toContainText(last);
  await b.waitForTimeout(250);
  await b.screenshot({ path: `${SHOTS}/chat-conversas-lista.png` });
  await item.click();
  const log = panel(b).getByRole("log", { name: "Mensagem para Ana" });
  await expect(log.getByText(secret)).toBeVisible();
  await expect(log.getByText(last)).toBeVisible();
  await expect.poll(() => unread(b).then((u) => u.dm)).toBe(0);

  // Responde; Ana (com a conversa aberta) recebe sem contador.
  const reply = `Ligo em 5 min. Olha: https://ai-infinity.io/acme-${RUN}`;
  await say(b, reply);
  await expect(panel(a).getByRole("log").getByText(reply)).toBeVisible({ timeout: 5000 });
  expect((await unread(a)).dm).toBe(0);
  await a.waitForTimeout(250);
  await a.screenshot({ path: `${SHOTS}/chat-conversa-2d.png` });

  // Voltar para a lista pelo botão e pela aba.
  await panel(b).getByRole("button", { name: "Voltar para as conversas" }).click();
  await expect(panel(b).getByRole("button", { name: /^Ana/ })).toContainText("Você: Ligo em 5 min");

  // Bruno recarrega (sessão nova): a conversa continua, pelo nome.
  await b.reload();
  await b.waitForFunction(() => !!(window as unknown as { __infinityChat?: unknown; __infinity?: { store: { getState(): { selfId: string | null } } } }).__infinity?.store.getState().selfId, null, { timeout: 30_000 });
  await expect.poll(() => chatState(b).then((s) => s.convs.find((x) => x.key === "ana")?.name), { timeout: 10_000 }).toBe("Ana");
  await b.keyboard.press("KeyC");
  await tab(b, "Conversas");
  await panel(b).getByRole("button", { name: /^Ana/ }).click();
  await expect(panel(b).getByRole("log", { name: "Mensagem para Ana" }).getByText(secret)).toBeVisible({ timeout: 5000 });
  // Nada ficou como não lido depois de responder.
  expect((await unread(b)).dm).toBe(0);
  await expect(composer(b)).toBeVisible();
});
