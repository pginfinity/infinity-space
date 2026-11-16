import { expect, test } from "./setup.ts";
import { SHOTS, desksIn, enter, expectDrawnMatchesState, label, priv, reset, send, sitAt, snap, walk, type W } from "./mesas-util.ts";

/**
 * Mesas de trabalho com duas pessoas:
 * - Ana senta numa mesa do Dev Lab e faz check-in pelo E; escolhe três objetos no painel "Minha mesa";
 * - Bruno passa pela mesa, vê "Ocupada · Ana" e os objetos dela no mundo, deixa um recado (só ela vê);
 * - sentado na cadeira da Ana, o Bruno não tem check-in, só recado;
 * - Ana volta à mesa e vê o cartão com o recado; apaga.
 */
test("mesas: check-in, mesa ocupada, objetos no mundo e recado privado", async ({ browser }) => {
  test.setTimeout(240_000);
  const a = await enter(browser, "Ana", "2d");
  const b = await enter(browser, "Bruno", "3d");
  await Promise.all([reset(a), reset(b)]);

  const dev = await desksIn(a, "dev");
  // Mesa da ponta de uma ilha (lado livre para quem passa).
  const desk = dev.filter((d) => d.type === "desk-dual").sort((p, q) => p.pos.x - q.pos.x)[0]!;
  await expect.poll(async () => (await snap(a)).checkins[desk.id]?.name ?? null).toBeNull();

  // ── Ana senta e faz check-in ─────────────────────────────────────────────────────────
  await sitAt(a, desk);
  await expect(a.getByRole("button", { name: /Fazer check-in nesta mesa/ })).toBeVisible({ timeout: 5000 });
  await a.keyboard.press("KeyE");
  await expect(a.getByText(/Check-in feito: Dev Lab · Mesa \d+/)).toBeVisible({ timeout: 5000 });
  await expect.poll(async () => (await snap(a)).checkins[desk.id]?.name).toBe("Ana");
  await expect.poll(async () => (await priv(a)).last).toBe(desk.id);

  // ── Painel "Minha mesa": três objetos ─────────────────────────────────────────────────
  await expect.poll(() => label(a)).toBe("Minha mesa");
  await a.keyboard.press("KeyE");
  const panel = a.getByRole("dialog", { name: "Minha mesa" });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Sua até o fim do dia");
  for (const it of ["Caneca", "Cacto", "Foguetinho"]) await panel.getByRole("button", { name: it, exact: true }).click();
  await expect(panel.getByRole("button", { name: "Gatinho", exact: true })).toBeDisabled();
  await expect.poll(async () => (await snap(a)).items["ana"]).toEqual(["caneca", "cacto", "foguete"]);
  await a.waitForTimeout(400);
  await a.screenshot({ path: `${SHOTS}/mesas-painel.png` });
  await a.keyboard.press("Escape");
  await expect(panel).toBeHidden();

  // Os objetos e a plaquinha aparecem no mundo (nas duas lentes).
  let before: Record<string, number> = {};
  for (const p of [a, b]) {
    before = await expectDrawnMatchesState(p);
    for (const it of ["caneca", "cacto", "foguete", "@placa"]) expect(before[it] ?? 0).toBeGreaterThanOrEqual(1);
  }

  // A Ana levanta e vai até a janela (a mesa continua dela).
  await walk(a, { x: desk.pos.x + 4.5, z: desk.pos.z - 3 }, 1.2);

  // ── Bruno passa pela mesa: vê de quem é e deixa um recado ───────────────────────────────
  await walk(b, desk.side, 0.45);
  const tag = b.locator(`[data-mesa-etiqueta="${desk.id}"]`);
  await expect(tag).toHaveText("Ocupada · Ana", { timeout: 5000 });
  await expect.poll(() => label(b), { timeout: 5000 }).toBe("Recado para Ana");
  await b.waitForTimeout(800);
  await b.screenshot({ path: `${SHOTS}/mesas-ocupada-3d.png` });
  await b.keyboard.press("KeyE");
  const card = b.getByRole("dialog", { name: "Mesa de Ana" });
  await expect(card).toBeVisible();
  const text = `Passei aqui, me chama quando voltar #${Date.now() % 10000}`;
  await card.getByLabel("Recado para Ana").fill(text);
  await b.screenshot({ path: `${SHOTS}/mesas-recado.png` });
  await card.getByRole("button", { name: "Deixar recado" }).click();
  await expect(b.getByText("Recado deixado para Ana.")).toBeVisible({ timeout: 5000 });
  await expect(card.getByLabel("Recado para Ana")).toHaveValue("");
  await expect(card.locator("li", { hasText: text })).toBeVisible();
  await expect.poll(async () => (await priv(a)).inbox.map((n) => n.text)).toEqual([text]);
  // O recado não está no estado público.
  expect(JSON.stringify(await snap(b))).not.toContain("Passei aqui");
  await b.keyboard.press("Escape");

  // ── Bruno senta na cadeira da Ana: nada de check-in, só recado ────────────────────────
  await sitAt(b, desk);
  await expect.poll(() => label(b)).toBe("Recado para Ana");
  await send(b, "checkin", { desk: desk.id });
  await expect(b.getByText("Ana já fez check-in nesta mesa hoje.")).toBeVisible({ timeout: 5000 });
  await expect.poll(async () => (await snap(b)).checkins[desk.id]?.name).toBe("Ana");
  // levanta e sai
  await walk(b, { x: desk.pos.x + 3, z: desk.pos.z + 3.5 }, 1.2);

  // ── Ana volta: cartão com o recado; apaga ───────────────────────────────────────────────
  await walk(a, desk.side, 0.5);
  const welcome = a.getByRole("dialog", { name: "Recado na sua mesa" });
  await expect(welcome).toBeVisible({ timeout: 6000 });
  await expect(welcome).toContainText(text);
  await expect(welcome).toContainText("Bruno");
  await a.waitForTimeout(600);
  await a.screenshot({ path: `${SHOTS}/mesas-chegada-recado.png` });
  await welcome.getByRole("button", { name: "Apagar recado" }).click();
  await expect.poll(async () => (await priv(a)).inbox).toEqual([]);
  await expect.poll(async () => (await priv(b)).sent).toEqual([]);
  await expect(welcome).toBeHidden();

  // A Ana libera a mesa: plaquinha e objetos somem do mundo.
  await send(a, "checkout");
  await expect.poll(async () => (await snap(b)).checkins[desk.id]).toBeUndefined();
  const after = await expectDrawnMatchesState(b);
  expect(after["@placa"]).toBe((before["@placa"] ?? 0) - 1);
  for (const it of ["caneca", "cacto", "foguete"]) expect(after[it] ?? 0).toBe((before[it] ?? 0) - 1);
});

/**
 * Recado privado com uma terceira pessoa por perto, e o atalho da última mesa.
 */
test("mesas: recado só para a dona e quem escreveu; atalho da última mesa", async ({ browser }) => {
  test.setTimeout(180_000);
  const a = await enter(browser, "Ana", "2d");
  const b = await enter(browser, "Bruno", "2d");
  const c = await enter(browser, "Carla", "2d");
  await Promise.all([reset(a), reset(b), reset(c)]);
  const dev = await desksIn(a, "dev");
  const desk = dev.filter((d) => d.type === "desk-dual").sort((p, q) => p.pos.x - q.pos.x)[0]!;

  // Check-in da Ana pelo servidor (sentada na cadeira).
  await sitAt(a, desk);
  await send(a, "checkin", { desk: desk.id });
  await expect.poll(async () => (await snap(c)).checkins[desk.id]?.name).toBe("Ana");
  await send(a, "objetos", { items: ["globo", "gatinho"] });
  await walk(a, { x: desk.pos.x + 4.5, z: desk.pos.z - 3 }, 1.2);

  // Bruno e Carla perto da mesa; Bruno deixa um recado.
  await walk(b, desk.side, 0.5);
  await walk(c, { x: desk.side.x + 0.6, z: desk.side.z }, 1.0);
  await send(b, "recado", { desk: desk.id, text: "Segredo entre nós" });
  await expect.poll(async () => (await priv(a)).inbox.map((n) => n.text)).toEqual(["Segredo entre nós"]);
  await expect.poll(async () => (await priv(b)).sent.map((n) => n.text)).toEqual(["Segredo entre nós"]);
  const pc = await priv(c);
  expect(pc.inbox).toEqual([]);
  expect(pc.sent).toEqual([]);
  expect(await c.evaluate(() => JSON.stringify((window as unknown as W).__infinity.acts.state.getState().acts))).not.toContain("Segredo");
  // Carla também vê a mesa ocupada.
  await expect(c.locator(`[data-mesa-etiqueta="${desk.id}"]`)).toHaveText("Ocupada · Ana", { timeout: 5000 });
  await c.waitForTimeout(800);
  await c.screenshot({ path: `${SHOTS}/mesas-ocupada-2d.png` });

  // A Ana libera e vai embora; ao voltar ao escritório, o atalho oferece a última mesa.
  await send(a, "checkout");
  await send(a, "apagar", { id: (await priv(a)).inbox[0]!.id });
  // Espera o servidor confirmar antes de recarregar (recarregar fecha a conexão na hora).
  await expect.poll(async () => (await snap(a)).checkins[desk.id]).toBeUndefined();
  await expect.poll(async () => (await priv(a)).inbox).toEqual([]);
  await a.evaluate(() => localStorage.removeItem("infinity-space:mesas:chegada"));
  await a.reload();
  await a.waitForFunction(() => !!(window as unknown as Partial<W>).__mesas?.ui.getState().priv, null, { timeout: 30_000 });
  const chip = a.getByRole("status").filter({ hasText: "Sua última mesa está livre" });
  // O atalho aparece uns segundos depois de o escritório abrir (com três janelas de WebGL por
  // software, o escritório demora a abrir).
  await expect(chip).toBeVisible({ timeout: 40_000 });
  await a.screenshot({ path: `${SHOTS}/mesas-atalho.png` });
  await chip.getByRole("button", { name: "Check-in e ir até lá" }).click();
  await expect.poll(async () => (await snap(a)).checkins[desk.id]?.name).toBe("Ana");
  // Anda até a mesa e senta.
  await expect.poll(() => a.evaluate(() => (window as unknown as W).__infinity.self.anim), { timeout: 25_000 }).toBe("sit");
  await send(a, "checkout");
  await send(a, "objetos", { items: [] });
});

/**
 * Mesa fixa: um admin (gancho de desenvolvimento, sem login) marca a mesa da Carla. Ela aparece com o
 * nome mesmo sem a Carla no escritório, e a Ana não consegue fazer check-in nela.
 */
test("mesas: mesa fixa marcada pelo admin", async ({ browser }) => {
  test.setTimeout(180_000);
  const admin = await enter(browser, "Diretora", "3d", "&admin=1");
  const a = await enter(browser, "Ana", "2d");
  await reset(a);
  await expect.poll(async () => (await priv(admin)).admin, { timeout: 8000 }).toBe(true);
  // Começa sem mesas fixas.
  for (const id of Object.keys((await snap(admin)).fixed)) await send(admin, "fixar", { desk: id, name: "" });
  await expect.poll(async () => Object.keys((await snap(admin)).fixed).length).toBe(0);
  // Quem não é admin não consegue.
  const dev = await desksIn(a, "dev");
  const desk = dev.filter((d) => d.type === "desk-dual").sort((p, q) => q.pos.x - p.pos.x)[0]!;
  await send(a, "fixar", { desk: desk.id, name: "Ana" });
  await expect(a.getByText("Só quem administra o escritório marca mesas fixas.")).toBeVisible({ timeout: 5000 });

  // Admin abre "Minha mesa" (pela paleta / evento) e marca a mesa como fixa da Carla.
  await admin.evaluate(() => window.dispatchEvent(new Event("infinity:mesas")));
  const panel = admin.getByRole("dialog", { name: "Minha mesa" });
  await expect(panel).toBeVisible();
  const fixedSection = panel.getByRole("region", { name: "Mesas fixas" });
  await fixedSection.getByLabel("Mesa", { exact: true }).selectOption(desk.id);
  await fixedSection.getByLabel("Nome da pessoa").fill("Carla");
  await fixedSection.getByRole("button", { name: "Fixar" }).click();
  await expect.poll(async () => (await snap(a)).fixed[desk.id]).toBe("Carla");
  await expect(fixedSection.locator("li", { hasText: "Carla" })).toBeVisible();
  await admin.screenshot({ path: `${SHOTS}/mesas-admin.png` });
  await admin.keyboard.press("Escape");

  // A Ana chega: vê "Fixa · Carla" e, sentada, só tem o recado (sem check-in).
  await walk(a, desk.side, 0.5);
  await expect(a.locator(`[data-mesa-etiqueta="${desk.id}"]`)).toHaveText("Fixa · Carla", { timeout: 5000 });
  await a.waitForTimeout(700);
  await a.screenshot({ path: `${SHOTS}/mesas-fixa-2d.png` });
  await sitAt(a, desk);
  await expect.poll(() => label(a)).toBe("Recado para Carla");
  await send(a, "checkin", { desk: desk.id });
  await expect(a.getByText("Esta é a mesa fixa de Carla.")).toBeVisible({ timeout: 5000 });

  // Mapa ampliado: a mesa fixa aparece ocupada e há mesas livres por sala.
  await a.evaluate(() => window.dispatchEvent(new Event("infinity:map")));
  await expect(a.locator(`[data-mesas-mapa] [data-mesa="${desk.id}"]`)).toHaveAttribute("data-livre", "0");
  await expect(a.getByRole("region", { name: "Mesas livres" })).toContainText("Dev Lab");
  await a.waitForTimeout(500);
  await a.screenshot({ path: `${SHOTS}/mesas-mapa.png` });

  // Desfaz.
  await send(admin, "fixar", { desk: desk.id, name: "" });
  await expect.poll(async () => (await snap(a)).fixed[desk.id]).toBeUndefined();
});
