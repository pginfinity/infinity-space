import { expect, test, type Page } from "./setup.ts";
import { actState, enter, promptLabel, selfId, walkNear, zoomIn, type W } from "./vivo-util.ts";

/**
 * Mesa de foco com Pomodoro compartilhado: a Ana (2D) senta e começa o ciclo; o Bruno (3D) chega
 * depois e entra no mesmo ciclo. Pausar só vale quando os dois concordam. O status vira "Foco"
 * sozinho durante o foco e volta ao anterior na pausa e ao sair. Mesa vazia zera.
 */

interface Foco {
  seats: Array<string | null>;
  startAt: number | null;
  pausedAt: number | null;
  vote: { op: string; ids: string[] } | null;
}
type FW = W & {
  __foco: { mySeat(): number; mySeatOnServer(): number; autoFocus(): boolean; skip(): void };
  __infinity: W["__infinity"] & { store: { getState(): { selfId: string | null; players: Record<string, { status: string }> } } };
};

const status = (p: Page) => p.evaluate(() => {
  const s = (window as unknown as FW).__infinity.store.getState();
  return s.players[s.selfId!]!.status;
});

async function seatPoints(p: Page): Promise<Array<{ x: number; z: number }>> {
  return p.evaluate(() =>
    (window as unknown as { __infinity: { world(): { map: { objects: Array<{ id: string; interact?: { point: { x: number; z: number } } }> } } } }).__infinity
      .world()
      .map.objects.filter((o) => o.id.startsWith("mesa-foco-lugar-"))
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((o) => o.interact!.point),
  );
}

/** Anda até o lugar e senta com E. Devolve o lugar em que sentou. */
async function sitAt(p: Page, at: { x: number; z: number }): Promise<number> {
  await walkNear(p, at, 0.5);
  await expect.poll(() => promptLabel(p)).toBe("Sentar e focar");
  await p.keyboard.press("KeyE");
  await expect.poll(() => p.evaluate(() => (window as unknown as FW).__foco.mySeatOnServer()), { timeout: 8000 }).toBeGreaterThanOrEqual(0);
  return p.evaluate(() => (window as unknown as FW).__foco.mySeat());
}

/** Tempo que o chip mostra, em segundos. */
async function chipSeconds(p: Page): Promise<number> {
  const t = (await p.getByRole("region", { name: "Mesa de foco" }).locator("span.font-display").textContent()) ?? "";
  const [m, s] = t.split(":").map(Number);
  return m! * 60 + s!;
}

test("mesa de foco: Pomodoro compartilhado com acordo para pausar (2D e 3D)", async ({ browser }) => {
  test.setTimeout(200_000);
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await enter(a, "Ana", "2d");
  await enter(b, "Bruno", "3d");
  await a.waitForFunction(() => !!(window as unknown as Partial<FW>).__foco && !!(window as unknown as FW).__infinity.acts.state.getState().acts.foco);
  const seats = await seatPoints(a);
  expect(seats.length).toBe(4);

  // Mesa vazia antes de começar.
  expect((await actState<Foco>(a, "foco")).startAt).toBeNull();

  // A Ana senta: o ciclo começa e o status vira "Foco".
  const seatA = await sitAt(a, seats[0]!);
  const chipA = a.getByRole("region", { name: "Mesa de foco" });
  await expect(chipA).toBeVisible();
  await expect(chipA).toContainText("Foco 1 de 4");
  await expect(chipA).toContainText("só você na mesa");
  await expect.poll(() => status(a)).toBe("focus");
  const started = (await actState<Foco>(a, "foco")).startAt;
  expect(started).not.toBeNull();

  // O Bruno chega depois e entra no mesmo ciclo (mesmo relógio, mesmo tempo restante).
  await b.waitForTimeout(2500);
  const seatB = await sitAt(b, seats[2]!);
  expect(seatB).not.toBe(seatA);
  const chipB = b.getByRole("region", { name: "Mesa de foco" });
  await expect(chipB).toBeVisible();
  await expect(chipB).toContainText("2 na mesa");
  await expect(chipA).toContainText("2 na mesa");
  expect((await actState<Foco>(b, "foco")).startAt).toBe(started);
  const [sa, sb] = await Promise.all([chipSeconds(a), chipSeconds(b)]);
  expect(Math.abs(sa - sb)).toBeLessThanOrEqual(1);
  expect(sa).toBeLessThan(25 * 60);
  await expect.poll(() => status(b)).toBe("focus");

  // Relógio no mundo: no 2D, a etiqueta nítida perto da mesa.
  await zoomIn(a, 3);
  await expect(a.locator("[data-foco-label]")).toContainText(/Foco · 2[45]:\d\d/);
  await a.waitForTimeout(800);
  await a.screenshot({ path: "test-results/screens/foco-mesa-2d.png" });
  await b.waitForTimeout(800);
  await b.screenshot({ path: "test-results/screens/foco-mesa-3d.png" });

  // Ninguém mexe no relógio sozinho: a Ana propõe pausar, o Bruno vê e concorda.
  await chipA.getByRole("button", { name: "Pausar" }).click();
  await expect(chipB).toContainText("Proposta: pausar · 1 de 2 concorda");
  expect((await actState<Foco>(a, "foco")).pausedAt).toBeNull();
  await b.screenshot({ path: "test-results/screens/foco-proposta-3d.png" });
  await chipB.getByRole("button", { name: "Concordar" }).click();
  await expect(chipA).toContainText("Pausado");
  await expect(chipB).toContainText("Pausado");
  expect((await actState<Foco>(a, "foco")).pausedAt).not.toBeNull();
  // Pausado: o status volta ao de antes.
  await expect.poll(() => status(a)).toBe("available");
  await a.screenshot({ path: "test-results/screens/foco-pausado-2d.png" });
  const frozen = await chipSeconds(a);
  await a.waitForTimeout(2200);
  expect(await chipSeconds(a)).toBe(frozen);

  // Retomar também precisa dos dois.
  await chipB.getByRole("button", { name: "Retomar" }).click();
  await expect(chipA).toContainText("Proposta: retomar · 1 de 2 concorda");
  await chipA.getByRole("button", { name: "Concordar" }).click();
  await expect(chipA).toContainText("Foco 1 de 4");
  await expect.poll(() => status(a)).toBe("focus");

  // Troca de fase (o servidor de desenvolvimento pula para 2 s antes do fim): pausa curta para todos.
  await a.evaluate(() => (window as unknown as FW).__foco.skip());
  await expect(chipA).toContainText("Pausa", { timeout: 10_000 });
  await expect(chipB).toContainText("Pausa");
  await expect(a.getByText("Pausa de 5 minutos. Levante, alongue, beba água.")).toBeVisible();
  await expect.poll(() => status(a)).toBe("available");
  await expect.poll(() => status(b)).toBe("available");
  await b.screenshot({ path: "test-results/screens/foco-pausa-3d.png" });

  // A Ana sai: o chip some, o Bruno continua no mesmo ciclo.
  await chipA.getByRole("button", { name: "Sair da mesa" }).click();
  await expect(chipA).toHaveCount(0);
  await expect(chipB).toContainText("só você na mesa");
  const ida = await selfId(a);
  await expect.poll(async () => (await actState<Foco>(b, "foco")).seats.includes(ida)).toBe(false);
  expect((await actState<Foco>(b, "foco")).startAt).not.toBeNull();

  // O Bruno levanta andando: mesa vazia zera.
  await walkNear(b, { x: 20.9, z: 5 }, 1.0);
  await expect(chipB).toHaveCount(0);
  await expect.poll(async () => (await actState<Foco>(a, "foco")).startAt).toBeNull();
  expect((await actState<Foco>(a, "foco")).seats.every((s) => s === null)).toBe(true);
});
