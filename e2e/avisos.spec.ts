import { expect, test, type Browser, type Page } from "./setup.ts";
import { SHOTS, openPeople, waitOnline } from "./presenca-util.ts";
import { openByKey, say, tab, tag } from "./chat-util.ts";
import { portasState, prompt, walk } from "./portas-util.ts";

/**
 * Nomes que nenhum outro teste usa: as conversas ficam guardadas pelo nome e atrapalhariam o chat-conversas.
 *
 * Aviso do computador: com o Space em segundo plano, chamado, menção, mensagem e batida na porta viram
 * aviso do sistema; com a janela na frente ou em Foco, não. O aviso do navegador é trocado por um falso
 * que anota o que seria mostrado, e "janela em segundo plano" é o `document.hasFocus()` devolvendo false.
 */

type Aviso = { title: string; body: string; tag: string };
type W = { __avisos: Aviso[]; __fora: boolean };

async function enter(browser: Browser, name: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => {
    const w = window as unknown as W & { Notification: unknown };
    w.__avisos = [];
    w.__fora = false;
    w.Notification = class {
      static permission = "default";
      static async requestPermission() {
        this.permission = "granted";
        return "granted";
      }
      onclick: (() => void) | null = null;
      constructor(title: string, opts: { body: string; tag: string }) {
        w.__avisos.push({ title, body: opts.body, tag: opts.tag });
      }
      close() {}
    };
    Document.prototype.hasFocus = () => !w.__fora;
  });
  const page = await ctx.newPage();
  await page.goto(`/?nome=${encodeURIComponent(name)}&lente=2d`);
  await page.waitForFunction(() => !!(window as unknown as { __presenca?: unknown }).__presenca && !!(window as unknown as { __infinityChat?: unknown }).__infinityChat, null, { timeout: 30_000 });
  return page;
}

const avisos = (p: Page) => p.evaluate(() => (window as unknown as W).__avisos);
const fora = (p: Page, v: boolean) => p.evaluate((v) => ((window as unknown as W).__fora = v), v);

test("avisos do computador: chamado, menção e porta em segundo plano; nada na frente nem em Foco", async ({ browser }) => {
  test.setTimeout(180_000);
  const a = await enter(browser, "Iara");
  const b = await enter(browser, "Joel");
  const c = await enter(browser, "Lena");
  await waitOnline(a, 3);
  const run = tag();

  // Joel liga em Ajustes › Avisos (o navegador pergunta a permissão no clique).
  await b.getByRole("button", { name: "Áudio e vídeo" }).click();
  const settings = b.getByRole("dialog", { name: "Áudio e vídeo" });
  const toggle = settings.getByRole("switch", { name: "Avisar fora do navegador" });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await b.getByRole("button", { name: "Áudio e vídeo" }).click();
  await fora(b, true);

  // Chamado com a janela atrás de outra: aviso do sistema com quem chamou.
  await openPeople(a);
  await a.getByRole("button", { name: "Chamar Joel" }).click();
  await expect.poll(() => avisos(b), { timeout: 5000 }).toContainEqual({ title: "Infinity Space", body: "Iara está te chamando", tag: "chamado" });
  await b.getByRole("alertdialog", { name: "Iara está te chamando" }).getByRole("button", { name: "Em reunião" }).click();

  // Menção no Geral.
  await openByKey(a);
  await tab(a, "Geral");
  await say(a, `@Joel olha o deploy ${run}`);
  await expect.poll(async () => (await avisos(b)).find((x) => x.tag === "mention:geral")?.body, { timeout: 5000 }).toContain(`Iara mencionou você no Geral: @Joel olha o deploy ${run}`);

  // Janela na frente: a mensagem da Lena fica só no aviso de dentro.
  await fora(b, false);
  const before = (await avisos(b)).length;
  await openPeople(c);
  await c.getByRole("button", { name: "Mensagem para Joel" }).click();
  await say(c, `oi ${run}`);
  await expect(b.getByText(`Lena: oi ${run}`)).toBeVisible({ timeout: 5000 });
  expect(await avisos(b)).toHaveLength(before);

  // Joel numa sala de porta fechada; Iara bate com ele em segundo plano.
  await fora(b, true);
  await Promise.all([walk(b, { x: -18.5, z: -2.0 }), walk(a, { x: -17.4, z: -5.3 })]);
  await b.getByRole("radio", { name: /Fechada/ }).click();
  await expect.poll(async () => (await portasState(b))?.doors.eclipse?.state).toBe("closed");
  await walk(a, { x: -17.4, z: -4.9 });
  await expect.poll(() => prompt(a)).toBe("Bater na porta");
  // O E não pode cair no campo do chat que a Iara usou antes.
  await a.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await a.keyboard.press("KeyE");
  await expect.poll(() => avisos(b), { timeout: 10_000 }).toContainEqual({ title: "Infinity Space", body: "Iara está batendo na porta da sua sala", tag: "porta:eclipse" });

  // Em Foco nada sai do navegador, nem com a janela atrás de outra.
  await b.getByRole("button", { name: "Áudio e vídeo" }).click();
  await settings.getByRole("radio", { name: "Foco" }).click();
  await b.getByRole("button", { name: "Áudio e vídeo" }).click();
  const quiet = (await avisos(b)).length;
  await openPeople(c);
  await c.getByRole("button", { name: "Chamar Joel" }).click();
  await expect(c.getByText("Joel está em foco agora e vai ver o seu chamado depois.")).toBeVisible({ timeout: 5000 });
  await b.waitForTimeout(800);
  expect(await avisos(b)).toHaveLength(quiet);
});

test("oferta única: aparece depois de um tempo no escritório e liga os avisos", async ({ browser }) => {
  test.setTimeout(90_000);
  const d = await enter(browser, "Davi");
  const card = d.getByRole("dialog", { name: "Avisar fora do navegador?" });
  await expect(card).toBeVisible({ timeout: 40_000 });
  await d.screenshot({ path: `${SHOTS}/avisos-oferta.png` });
  await card.getByRole("button", { name: "Ativar avisos" }).click();
  await expect(card).toBeHidden();
  expect(await d.evaluate(() => JSON.parse(localStorage.getItem("infinity.media.v1") ?? "{}").notify)).toBe(true);
});
