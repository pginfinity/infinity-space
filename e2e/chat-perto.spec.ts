import { expect, test, type Page } from "./setup.ts";
import { tag, SHOTS, chatState, composer, enter, openByKey, panel, say, selfId, settle, tab, unread, waitOnline, walk } from "./chat-util.ts";

/**
 * Chat Perto: só quem te ouve agora (mesma regra da voz) lê. A mensagem aparece num balão acima
 * da cabeça por alguns segundos, nas duas lentes, para quem está perto. Sala fechada isola.
 */

const balloon = (page: Page, id: string) => page.locator(`[data-chat-balloon="${id}"]`);
const near = (page: Page) => panel(page).locator("[data-chat-near]");

test("Perto: distância, balão nas duas lentes e sala fechada", async ({ browser }) => {
  const RUN = tag();
  test.setTimeout(180_000);
  const a = await enter(browser, "Ana", "2d");
  const b = await enter(browser, "Bruno", "3d");
  const c = await enter(browser, "Carla", "2d");
  await waitOnline(a, 3);
  const [ida, idb] = await Promise.all([selfId(a), selfId(b)]);

  // Ana e Bruno conversando no átrio; Carla longe, no café.
  await Promise.all([walk(a, { x: 1.0, z: 7.2 }), walk(b, { x: 3.0, z: 6.0 }), walk(c, { x: -7, z: 17 })]);
  await settle(a);

  await openByKey(a);
  await tab(a, "Perto");
  // Quem lê agora: o Bruno (a Carla está longe).
  await expect(near(a)).toContainText("Bruno");
  await expect(near(a)).not.toContainText("Carla");

  const text = `Alguém topa um café? ${RUN}`;
  await say(a, text);

  // Bruno recebe e vê o balão acima da Ana (3D); a Ana vê o próprio balão (2D).
  await expect.poll(() => chatState(b).then((s) => s.perto), { timeout: 5000 }).toContain(text);
  await expect(balloon(b, ida)).toBeVisible();
  await expect(balloon(b, ida)).toContainText(text);
  await expect(balloon(a, ida)).toBeVisible();
  await expect.poll(() => unread(b).then((u) => u.perto)).toBe(1);
  await b.waitForTimeout(400);
  await b.screenshot({ path: `${SHOTS}/chat-perto-balao-3d.png` });
  await a.waitForTimeout(100);
  await a.screenshot({ path: `${SHOTS}/chat-perto-balao-2d.png` });

  // Carla, longe, não recebe nada.
  expect((await chatState(c)).perto).not.toContain(text);
  await expect(balloon(c, ida)).toHaveCount(0);

  // Bruno responde com status definido: o balão do chat fica acima do balão de status, sem cobrir.
  await b.evaluate(async () => {
    const mod = await import("/src/net/session.ts");
    mod.sendInfo({ note: "☕ Café" });
  });
  await expect.poll(() => a.evaluate((id) => (window as unknown as { __infinity: { store: { getState(): { players: Record<string, { note?: string }> } } } }).__infinity.store.getState().players[id]?.note, idb)).toBe("☕ Café");
  await openByKey(b);
  await tab(b, "Perto");
  await say(b, `Eu topo! ${RUN}`);
  await expect(balloon(a, idb)).toBeVisible({ timeout: 5000 });
  await a.waitForTimeout(500);
  const statusBox = await a.locator(`[data-status-balloon="${idb}"] > div`).boundingBox();
  const chatBox = await balloon(a, idb).locator("> div").boundingBox();
  expect(statusBox && chatBox).toBeTruthy();
  // O balão do chat termina acima do topo do status.
  expect(chatBox!.y + chatBox!.height).toBeLessThanOrEqual(statusBox!.y + 1);
  await a.screenshot({ path: `${SHOTS}/chat-perto-balao-status.png` });

  // O balão some depois de ~6 s.
  await expect(balloon(a, ida)).toHaveCount(0, { timeout: 8000 });

  // Sala fechada: Ana e Carla na Sala Órbita; Bruno do lado de fora da parede (a 4,7 m).
  await Promise.all([walk(a, { x: -19, z: 0.5 }), walk(c, { x: -23.5, z: 1 }), walk(b, { x: -14.5, z: -1 })]);
  await settle(a);
  await expect(near(a)).toContainText("Carla", { timeout: 5000 });
  await expect(near(a)).not.toContainText("Bruno");
  const secret = `Pauta fechada da reunião ${RUN}`;
  await say(a, secret);
  await expect.poll(() => chatState(c).then((s) => s.perto), { timeout: 5000 }).toContain(secret);
  await b.waitForTimeout(800);
  expect((await chatState(b)).perto).not.toContain(secret);
  await a.waitForTimeout(300);
  await a.screenshot({ path: `${SHOTS}/chat-perto-sala.png` });

  // Bruno, sozinho do lado de fora: ninguém leu.
  await say(b, `Tem alguém aí? ${RUN}`);
  await expect(panel(b).getByText("Ninguém por perto leu.")).toBeVisible({ timeout: 5000 });
  await expect(composer(b)).toHaveValue("");
});
