import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "./setup.ts";

/**
 * Gravação de reunião: Ana e Bruno na Sala Eclipse com microfone (tom falso do Chrome).
 * Ana grava; os dois veem o aviso; Ana para; o arquivo Opus fica salvo no servidor
 * (sem conta do Google configurada, fica na fila para o Drive), com a transcrição no formato do Meet.
 * O reconhecimento de voz do navegador é trocado por um falso, que "ouve" uma frase a cada 1,5 s.
 */

interface Hook {
  store: { getState(): { selfId: string | null } };
  self: { x: number; z: number };
  walkTo(p: { x: number; z: number }): boolean;
  media: { state: { getState(): { status: string; mic: boolean; audience: number } } };
  acts: { state: { getState(): { acts: Record<string, { state: { sessions: Record<string, { status: string; note?: string }> } }> } } };
}
type W = { __infinity: Hook };

const DIR = join(process.env.E2E_DATA_DIR ?? join(process.cwd(), "apps/server/data"), "gravacoes");

/** Reconhecimento de voz falso: enquanto ligado, entrega `${frase} N` a cada 1,5 s. */
function fakeSpeech(phrase: string) {
  const w = window as unknown as { webkitSpeechRecognition: unknown; __sr: { on: boolean; withTrack: boolean } };
  w.__sr = { on: false, withTrack: false };
  let n = 0;
  w.webkitSpeechRecognition = class {
    onresult: ((e: unknown) => void) | null = null;
    onend: (() => void) | null = null;
    private t: number | undefined;
    start(track?: MediaStreamTrack) {
      w.__sr = { on: true, withTrack: !!track };
      this.t = window.setInterval(() => {
        const r = Object.assign([{ transcript: ` ${phrase} ${++n} ` }], { isFinal: true });
        this.onresult?.({ resultIndex: 0, results: [r] });
      }, 1500);
    }
    abort() {
      window.clearInterval(this.t);
      w.__sr.on = false;
      this.onend?.();
    }
  };
}

async function enter(page: Page, name: string, phrase: string) {
  await page.context().grantPermissions(["microphone", "camera"]);
  await page.addInitScript(fakeSpeech, phrase);
  await page.goto(`/?nome=${name}&lente=2d`);
  await page.waitForFunction(() => !!(window as unknown as Partial<W>).__infinity?.store.getState().selfId, null, { timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__infinity.media.state.getState().status), { timeout: 20_000 }).toBe("on");
}

async function walk(page: Page, x: number, z: number) {
  await page.evaluate(([x, z]) => (window as unknown as W).__infinity.walkTo({ x: x!, z: z! }), [x, z]);
  await expect.poll(() => page.evaluate(([x, z]) => Math.hypot((window as unknown as W).__infinity.self.x - x!, (window as unknown as W).__infinity.self.z - z!), [x, z]), { timeout: 30_000 }).toBeLessThan(0.6);
}

const listening = (p: Page) => p.evaluate(() => (window as unknown as { __sr: { on: boolean; withTrack: boolean } }).__sr);
const session = (p: Page) => p.evaluate(() => (window as unknown as W).__infinity.acts.state.getState().acts["gravacao"]?.state.sessions["eclipse"] ?? null);

test("grava a reunião da sala e salva o áudio e a transcrição", async ({ browser }) => {
  test.setTimeout(120_000);
  const before = existsSync(DIR) ? new Set(readdirSync(DIR)) : new Set<string>();
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await enter(a, "Ana", "Bom dia, time");
  await enter(b, "Bruno", "Vamos ao plano");
  await Promise.all([walk(a, -23.6, 1.2), walk(b, -23.6, 3.4)]);
  await a.keyboard.press("KeyM");
  await b.keyboard.press("KeyM");

  // Ana pede para gravar e confirma.
  await a.getByRole("button", { name: "Gravar reunião" }).click();
  await expect(a.getByRole("dialog", { name: "Gravar esta reunião?" })).toBeVisible();
  await a.screenshot({ path: "test-results/screens/v3-gravar-confirmar.png" });
  await a.getByRole("button", { name: "Gravar", exact: true }).click();

  // Os dois veem que está gravando; o gravador não conta como "pessoa que te ouve".
  for (const p of [a, b]) await expect(p.getByText("Gravando", { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  await expect(b.getByText(/Iniciada por Ana/)).toBeVisible();
  await expect(a.getByRole("button", { name: /Desligar microfone/ })).toContainText("1 ouve");
  // Com o microfone ligado, cada navegador transcreve a própria fala (com a faixa do microfone escolhido).
  for (const p of [a, b]) await expect.poll(() => listening(p)).toEqual({ on: true, withTrack: true });
  await expect(a.getByText("· transcrevendo sua fala")).toBeVisible();
  await a.waitForTimeout(6000);
  await a.screenshot({ path: "test-results/screens/v3-gravando.png" });
  // Microfone desligado: para de transcrever na hora.
  await b.keyboard.press("KeyM");
  await expect.poll(async () => (await listening(b)).on).toBe(false);
  await a.waitForTimeout(3000);

  // Para: o arquivo é salvo (sem Drive configurado, fica no servidor).
  await b.getByRole("button", { name: "Parar a gravação" }).click();
  await expect.poll(async () => (await session(a))?.status, { timeout: 30_000 }).toMatch(/saved|uploaded/);
  const created = readdirSync(DIR).filter((f) => f.startsWith("eclipse-") && f.endsWith(".ogg") && !before.has(f));
  expect(created.length).toBe(1);
  expect(statSync(join(DIR, created[0]!)).size).toBeGreaterThan(10_000);

  // Transcrição ao lado do áudio, no formato que o Portal de Reuniões lê do Drive.
  const text = readFileSync(join(DIR, created[0]!.replace(/\.ogg$/, ".txt")), "utf8");
  const lines = text.split("\n");
  expect(lines[0]).toMatch(/^Infinity Space · Sala Eclipse - \d{4}\/\d{2}\/\d{2} \d{2}:\d{2} GMT-03:00 - Transcrição$/);
  expect(lines[1]).toMatch(/^Participantes: (Ana, Bruno|Bruno, Ana)$/);
  expect(lines[3]).toBe("Transcrição");
  expect(lines[4]).toMatch(/^00:00:\d{2}$/);
  const ana = lines.filter((l) => l.startsWith("Ana: Bom dia, time ")).length;
  const bruno = lines.filter((l) => l.startsWith("Bruno: Vamos ao plano ")).length;
  expect(ana).toBeGreaterThan(bruno);
  expect(bruno).toBeGreaterThan(0);
  await a.screenshot({ path: "test-results/screens/v3-gravacao-salva.png" });
});
