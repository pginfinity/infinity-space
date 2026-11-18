import { expect, test, type Browser, type Page } from "./setup.ts";
import { chatState, composer, openByKey, panel, say, tab, tag, waitOnline } from "./chat-util.ts";
import { frontOf, promptLabel, walkNear, zoomIn, type W } from "./vivo-util.ts";

/**
 * Homenagens discretas (pacote easter): o computador do Dev Lab, as pílulas da Diretoria, a parede
 * 9¾ do corredor sul, o código Konami e o Mapa do Maroto (a frase não sai do cliente de quem escreveu).
 * Screenshots das duas lentes em test-results/screens/easter-*.png.
 */

const SHOTS = "test-results/screens";

interface EasterHook {
  parchment: { getState(): { until: number | null } };
  tvNow(ms: number | null): void;
  force(name: string, value: boolean): void;
}
type WE = W & { __easter: EasterHook };

async function enter(browser: Browser, name: string, lens: "2d" | "3d"): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto(`/?nome=${encodeURIComponent(name)}&lente=${lens}`);
  await page.waitForFunction(() => {
    const w = window as unknown as Partial<WE> & { __infinityChat?: unknown };
    return !!w.__infinity?.store.getState().selfId && !!w.__easter && !!w.__infinityChat && !!w.__infinity.acts.state.getState().acts.copa;
  }, null, { timeout: 30_000 });
  if (lens === "3d") await page.locator('[role="application"][data-ready="true"]').waitFor({ timeout: 30_000 });
  return page;
}

function toastText(page: Page, text: string | RegExp) {
  return page.getByRole("status").filter({ hasText: text });
}

async function face(page: Page, yaw: number): Promise<void> {
  await page.evaluate((yaw) => ((window as unknown as W).__infinity.self.yaw = yaw), yaw);
}

/** Ponto do mundo de um objeto (o primeiro do tipo, ou da variante). */
async function objPos(page: Page, type: string, variant?: number): Promise<{ x: number; z: number }> {
  return page.evaluate(
    ([type, variant]) => {
      const o = (window as unknown as W).__infinity.world().map.objects.find((x) => x.type === type && (variant === null || ((x as { variant?: number }).variant ?? 0) === variant))!;
      return { x: o.pos.x, z: o.pos.z };
    },
    [type, variant ?? null] as const,
  );
}

test("computador do Dev Lab, pílulas da Diretoria e a parede 9¾", async ({ browser }) => {
  test.setTimeout(240_000);
  const a = await enter(browser, "Ana", "2d");
  const b = await enter(browser, "Bruno", "3d");

  // 2001: lente vermelha no rack do Dev Lab.
  await walkNear(a, await frontOf(a, "lens-rack", 1.1), 0.6);
  await expect.poll(() => promptLabel(a)).toBe("Falar com o computador");
  await zoomIn(a, 5);
  await a.keyboard.press("KeyE");
  await expect(toastText(a, "Desculpe, Dave. Receio que não posso fazer isso.")).toBeVisible();
  await a.waitForTimeout(500);
  await a.screenshot({ path: `${SHOTS}/easter-hal-2d.png` });

  await walkNear(b, await frontOf(b, "lens-rack", 1.25), 0.5);
  await face(b, -Math.PI / 2);
  await expect.poll(() => promptLabel(b)).toBe("Falar com o computador");
  await zoomIn(b, 3);
  await b.keyboard.press("KeyE");
  await expect(toastText(b, "Desculpe, Dave.")).toBeVisible();
  await b.waitForTimeout(400);
  await b.screenshot({ path: `${SHOTS}/easter-hal-3d.png` });

  // Matrix: vermelha numa ponta da mesa de centro, azul na outra.
  const red = await objPos(a, "pill-dish", 0);
  const blue = await objPos(a, "pill-dish", 1);
  await walkNear(a, { x: red.x + 0.55, z: red.z }, 0.35);
  await expect.poll(() => promptLabel(a)).toBe("Tomar a pílula vermelha");
  await a.keyboard.press("KeyE");
  await expect(toastText(a, "Bem-vindo ao deserto do real.")).toBeVisible();
  await a.waitForTimeout(300);
  await a.screenshot({ path: `${SHOTS}/easter-pilulas-2d.png` });
  await walkNear(a, { x: blue.x - 0.55, z: blue.z }, 0.35);
  await expect.poll(() => promptLabel(a)).toBe("Tomar a pílula azul");
  await a.keyboard.press("KeyE");
  await expect(toastText(a, "Fim da história. Você acorda na sua mesa e acredita no que quiser.")).toBeVisible();

  await walkNear(b, { x: red.x + 0.6, z: red.z + 0.5 }, 0.4);
  await face(b, -Math.PI / 2 - 0.5);
  await expect.poll(() => promptLabel(b)).toBe("Tomar a pílula vermelha");
  await zoomIn(b, 4);
  await b.keyboard.press("KeyE");
  await expect(toastText(b, "Bem-vindo ao deserto do real.")).toBeVisible();
  await b.waitForTimeout(300);
  await b.screenshot({ path: `${SHOTS}/easter-pilulas-3d.png` });

  // Harry Potter: "Atravessar a parede" leva até a pilastra, bate e volta.
  const pillar = await objPos(a, "brick-pillar");
  await walkNear(a, { x: pillar.x, z: pillar.z + 1.0 }, 0.4);
  await expect.poll(() => promptLabel(a)).toBe("Atravessar a parede");
  // anota o ponto mais perto da parede a cada quadro (o passinho é rápido)
  await a.evaluate(() => {
    const w = window as unknown as W & { __minZ: number };
    w.__minZ = Infinity;
    const tick = () => {
      w.__minZ = Math.min(w.__minZ, w.__infinity.self.z);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await a.keyboard.press("KeyE");
  await expect(toastText(a, "Bonk! Hoje não, trouxa.")).toBeVisible({ timeout: 6000 });
  // encostou na pilastra (o passinho) e depois voltou
  const hit = await a.evaluate(() => (window as unknown as { __minZ: number }).__minZ);
  expect(hit - pillar.z).toBeLessThan(0.6);
  await a.waitForTimeout(250);
  await a.screenshot({ path: `${SHOTS}/easter-plataforma-2d.png` });
  await expect.poll(() => a.evaluate(() => (window as unknown as W).__infinity.self.z), { timeout: 6000 }).toBeGreaterThan(pillar.z + 0.8);

  await walkNear(b, { x: pillar.x + 0.3, z: pillar.z + 1.15 }, 0.4);
  await face(b, 0);
  await expect.poll(() => promptLabel(b)).toBe("Atravessar a parede");
  await b.keyboard.press("KeyE");
  await expect(toastText(b, "Bonk! Hoje não, trouxa.")).toBeVisible({ timeout: 6000 });
  await b.waitForTimeout(300);
  await b.screenshot({ path: `${SHOTS}/easter-plataforma-3d.png` });
  // a placa da plataforma, de frente, de um passo para trás e de lado (o avatar não tampa)
  await expect.poll(() => b.evaluate(() => (window as unknown as W).__infinity.self.z), { timeout: 6000 }).toBeGreaterThan(pillar.z + 0.8);
  await b.waitForTimeout(600);
  await walkNear(b, { x: pillar.x + 1.2, z: pillar.z + 2.3 }, 0.3);
  await face(b, -0.4);
  await b.mouse.move(720, 450);
  for (let i = 0; i < 2; i++) await b.mouse.wheel(0, 300);
  await b.waitForTimeout(2600);
  await b.screenshot({ path: `${SHOTS}/easter-plataforma-placa-3d.png` });
});

test("código Konami e Mapa do Maroto, sem a frase chegar a ninguém", async ({ browser }) => {
  test.setTimeout(180_000);
  const RUN = tag();
  const a = await enter(browser, "Ana", "2d");
  const b = await enter(browser, "Bruno", "3d");
  await waitOnline(a, 2);

  // Konami: as setas andam e o B é sussurro; a sequência inteira dá o prêmio, só para quem digitou.
  const konami = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "KeyB", "KeyA"];
  await a.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await zoomIn(a, 5);
  for (const k of konami) await a.keyboard.press(k);
  await expect(toastText(a, "+30 vidas")).toBeVisible();
  await a.waitForTimeout(500);
  await a.screenshot({ path: `${SHOTS}/easter-konami-2d.png` });
  await expect(toastText(b, "+30 vidas")).toHaveCount(0);

  await b.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await zoomIn(b, 3);
  for (const k of konami) await b.keyboard.press(k);
  await expect(toastText(b, "+30 vidas")).toBeVisible();
  await b.waitForTimeout(500);
  await b.screenshot({ path: `${SHOTS}/easter-konami-3d.png` });

  // Dentro do campo de texto a sequência não conta.
  await openByKey(a);
  await composer(a).click();
  for (const k of konami) await a.keyboard.press(k);
  await a.waitForTimeout(400);
  await expect(toastText(a, "+30 vidas")).toHaveCount(0);
  await composer(a).fill("");

  // Mapa do Maroto: a frase no Geral não é enviada; o minimapa vira pergaminho só para a Ana.
  await say(a, "Juro solenemente não fazer nada de bom");
  await expect(composer(a)).toHaveValue("");
  await expect(toastText(a, /Mapa revelado/)).toBeVisible();
  // Uma mensagem normal depois chega ao Bruno; a frase, não (nem no Geral, nem no Perto, nem em conversa).
  await say(a, `bom dia ${RUN}`);
  await expect.poll(async () => (await chatState(b)).geral.some((t) => t.includes(RUN)), { timeout: 8000 }).toBe(true);
  const seenByB = await chatState(b);
  const all = [...seenByB.geral, ...seenByB.perto, ...seenByB.convs.flatMap((c) => c.texts)].join("\n").toLowerCase();
  expect(all).not.toContain("solenemente");
  expect((await chatState(a)).geral.join("\n").toLowerCase()).not.toContain("solenemente");
  // O minimapa aparece quando o chat fecha: de pergaminho para a Ana, normal para o Bruno.
  await a.keyboard.press("Escape");
  await expect(panel(a)).toBeHidden();
  await expect(a.locator('[data-parchment="true"]')).toBeVisible();
  await expect(b.locator('[data-parchment="true"]')).toHaveCount(0);
  await a.waitForTimeout(400);
  await a.screenshot({ path: `${SHOTS}/easter-mapa-2d.png` });

  // No 3D, pelo Perto.
  await openByKey(b);
  await tab(b, "Perto");
  await say(b, "juro solenemente nao fazer nada de bom!");
  await expect(toastText(b, /Mapa revelado/)).toBeVisible();
  await b.keyboard.press("Escape");
  await expect(b.locator('[data-parchment="true"]')).toBeVisible();
  await b.waitForTimeout(400);
  await b.screenshot({ path: `${SHOTS}/easter-mapa-3d.png` });
  const seenByA = await chatState(a);
  expect([...seenByA.geral, ...seenByA.perto].join("\n").toLowerCase()).not.toContain("solenemente");

  // "Malfeito feito" desfaz (e também não é enviado).
  await openByKey(a);
  await say(a, "Malfeito feito.");
  await expect(toastText(a, /O mapa voltou ao normal/)).toBeVisible();
  await a.keyboard.press("Escape");
  await expect(a.getByRole("button", { name: "Ampliar mapa" })).toBeVisible();
  await expect(a.locator('[data-parchment="true"]')).toHaveCount(0);
  await a.waitForTimeout(800);
  expect((await chatState(b)).geral.join("\n").toLowerCase()).not.toContain("malfeito");
});

test("livro torto, caneta, barril, lámen, patinhos e a TV às 22:04 (visual)", async ({ browser }) => {
  test.setTimeout(240_000);
  const a = await enter(browser, "Ana", "2d");
  const b = await enter(browser, "Bruno", "3d");

  // Interestelar: o livro cai da estante e volta depois.
  const book = await objPos(a, "crooked-book");
  await walkNear(a, { x: book.x + 1.0, z: book.z }, 0.4);
  await expect.poll(() => promptLabel(a)).toBe("Puxar o livro torto");
  await zoomIn(a, 6);
  await a.screenshot({ path: `${SHOTS}/easter-livro-antes-2d.png` });
  await a.keyboard.press("KeyE");
  await expect(toastText(a, "Fique.")).toBeVisible({ timeout: 4000 });
  await a.waitForTimeout(400);
  await a.screenshot({ path: `${SHOTS}/easter-livro-2d.png` });
  await walkNear(b, { x: book.x + 1.3, z: book.z + 0.4 }, 0.4);
  await face(b, -Math.PI / 2 + 0.3);
  await zoomIn(b, 4);
  await b.screenshot({ path: `${SHOTS}/easter-livro-antes-3d.png` });
  await expect.poll(() => promptLabel(b)).toBe("Puxar o livro torto");
  await b.keyboard.press("KeyE");
  await b.waitForTimeout(1300);
  await b.screenshot({ path: `${SHOTS}/easter-livro-3d.png` });

  // O Lobo de Wall Street: me venda esta caneta.
  const pen = await objPos(a, "fancy-pen");
  // na ponta leste da mesa alta (das banquetas, só sentando)
  await walkNear(a, { x: pen.x + 1.0, z: pen.z + 0.05 }, 0.3);
  await expect.poll(() => promptLabel(a)).toBe("Me venda esta caneta");
  await a.keyboard.press("KeyE");
  await expect(toastText(a, /caneta|contrato|estoque|CRM|tinta|desconto|e-mail/i)).toBeVisible();
  await a.screenshot({ path: `${SHOTS}/easter-caneta-2d.png` });
  await walkNear(b, { x: pen.x + 1.25, z: pen.z + 0.35 }, 0.3);
  await face(b, -Math.PI / 2 - 0.25);
  await b.screenshot({ path: `${SHOTS}/easter-caneta-3d.png` });

  // Chaves: o barril.
  const barrel = await objPos(a, "barrel");
  await walkNear(a, { x: barrel.x - 0.9, z: barrel.z - 0.6 }, 0.4);
  await expect.poll(() => promptLabel(a)).toBe("Entrar no barril");
  await a.keyboard.press("KeyE");
  await expect(toastText(a, "Foi sem querer querendo.")).toBeVisible();
  await a.screenshot({ path: `${SHOTS}/easter-barril-2d.png` });
  // o barril fica encostado no casco sul: a câmera do 3D gira (R) para olhar para ele e depois volta (Q)
  await walkNear(b, { x: barrel.x - 1.0, z: barrel.z - 1.6 }, 0.4);
  await face(b, Math.PI * 0.8);
  await b.keyboard.down("KeyR");
  await b.waitForTimeout(1500);
  await b.keyboard.up("KeyR");
  await b.waitForTimeout(500);
  await b.screenshot({ path: `${SHOTS}/easter-barril-3d.png` });
  await b.keyboard.down("KeyQ");
  await b.waitForTimeout(1500);
  await b.keyboard.up("KeyQ");

  // Família Soprano: de vez em quando a geladeira guarda um segredo (sorteio forçado no teste).
  await a.evaluate(() => (window as unknown as WE).__easter.force("gabagool", true));
  const fridge = await objPos(a, "fridge");
  await walkNear(a, { x: fridge.x + 0.85, z: fridge.z - 0.1 }, 0.35);
  await expect.poll(() => promptLabel(a)).toBe("Pegar suco");
  await a.keyboard.press("KeyE");
  await expect(toastText(a, "Tem gabagool aqui atrás.")).toBeVisible({ timeout: 8000 });

  // Naruto: lámen na bancada da copa.
  const ramen = await objPos(a, "ramen-bowl");
  await walkNear(a, { x: ramen.x + 0.85, z: ramen.z }, 0.35);
  await expect.poll(() => promptLabel(a)).toBe("Comer lámen");
  await a.keyboard.press("KeyE");
  await expect(toastText(a, "Dattebayo! Energia para a sprint inteira.")).toBeVisible();
  await a.screenshot({ path: `${SHOTS}/easter-lamen-2d.png` });
  await walkNear(b, { x: ramen.x + 1.1, z: ramen.z + 0.3 }, 0.4);
  await face(b, -Math.PI / 2 + 0.25);
  await b.screenshot({ path: `${SHOTS}/easter-lamen-3d.png` });

  // Família Soprano: patinhos na mesa do lounge do Átrio; De Volta para o Futuro: a TV às 22:04.
  await a.evaluate(() => (window as unknown as WE).__easter.tvNow(Date.UTC(2026, 10, 19, 1, 4, 0)));
  await b.evaluate(() => (window as unknown as WE).__easter.tvNow(Date.UTC(2026, 10, 19, 1, 4, 0)));
  // (entre a mesa de centro e a TV; o sofá fecha o lado sul)
  const ducks = await objPos(a, "duck-family");
  await walkNear(a, { x: ducks.x + 0.95, z: ducks.z - 1.25 }, 0.5);
  await a.waitForTimeout(600);
  await a.screenshot({ path: `${SHOTS}/easter-patinhos-tv-2d.png` });
  await walkNear(b, { x: ducks.x - 0.6, z: ducks.z - 1.4 }, 0.5);
  await face(b, Math.PI);
  await b.waitForTimeout(1200);
  await b.screenshot({ path: `${SHOTS}/easter-patinhos-tv-3d.png` });
  // de perto, pelo lado oeste da mesa (entre a poltrona e o sofá)
  await walkNear(b, { x: ducks.x - 1.5, z: ducks.z + 0.8 }, 0.4);
  await face(b, Math.PI / 2 - 0.3);
  await zoomIn(b, 3);
  await b.waitForTimeout(600);
  await b.screenshot({ path: `${SHOTS}/easter-patinhos-3d.png` });
});

/** Onde o Orbi está agora, pela mesma conta dos clientes (trajeto + hora de saída). */
function orbiNow(page: Page): Promise<{ x: number; z: number }> {
  return page.evaluate(() => {
    const s = (window as unknown as W).__infinity.acts.state.getState().acts.orbi!.state as { from: { x: number; z: number }; path: Array<{ x: number; z: number }>; speed: number; startAt: number };
    let left = Math.max(0, ((Date.now() - s.startAt) / 1000) * s.speed);
    let p = s.from;
    for (const q of s.path) {
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (left < d) return { x: p.x + ((q.x - p.x) * left) / d, z: p.z + ((q.z - p.z) * left) / d };
      left -= d;
      p = q;
    }
    return p;
  });
}

/** Chega perto do Orbi, chama e espera ele parar do lado. */
async function meetOrbi(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        const o = await orbiNow(page);
        await page.evaluate((o) => (window as unknown as W).__infinity.walkTo({ x: o.x + 1.2, z: o.z + 0.8 }), o);
        return (await promptLabel(page)) ?? "";
      },
      { timeout: 60_000, intervals: [1500] },
    )
    .toMatch(/Chamar o Orbi|Fazer carinho no Orbi/);
  await page.evaluate(() => (window as unknown as W).__infinity.acts.send("orbi", "call"));
  await expect.poll(() => promptLabel(page), { timeout: 20_000 }).toBe("Fazer carinho no Orbi");
}

/**
 * Carinho até o Orbi falar: o sorteio é forçado no teste, mas o servidor só aceita o carinho com o
 * Orbi já parado do lado (enquanto ele chega, o E pode cair no vazio); tenta de novo algumas vezes.
 */
async function petForQuote(page: Page): Promise<void> {
  const quote = page.locator("[data-easter-quote]");
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => (window as unknown as WE).__easter.force("orbi", true));
    await expect.poll(() => promptLabel(page), { timeout: 10_000 }).toBe("Fazer carinho no Orbi");
    await page.keyboard.press("KeyE");
    if (await quote.waitFor({ state: "visible", timeout: 2500 }).then(() => true, () => false)) return;
    await page.waitForTimeout(3000);
  }
  await expect(quote).toBeVisible();
}

test("o Orbi solta uma frase de vez em quando, só para quem fez carinho", async ({ browser }) => {
  test.setTimeout(200_000);
  const a = await enter(browser, "Ana", "2d");
  const b = await enter(browser, "Bruno", "3d");
  // o Bruno vai para longe (senão o "Toca aqui" com ele disputa o E da Ana)
  await b.evaluate(() => (window as unknown as W).__infinity.walkTo({ x: -8, z: 3 }));
  await meetOrbi(a);
  await zoomIn(a, 5);
  await petForQuote(a);
  const quote = a.locator("[data-easter-quote]");
  await expect(quote).toHaveText(/Ao infinito e além!|Vida longa e próspera\.|Houston, temos um problema\.|Que a Força esteja com você\.|Eu voltarei\./);
  await expect(b.locator("[data-easter-quote]")).toHaveCount(0);
  await a.screenshot({ path: `${SHOTS}/easter-orbi-2d.png` });
  // A Ana sai (senão o "Toca aqui" com ela disputa o E) e o Bruno faz o mesmo no 3D.
  await a.evaluate(() => (window as unknown as W).__infinity.acts.send("orbi", "dismiss"));
  await a.context().close();
  await meetOrbi(b);
  await b.waitForTimeout(3200);
  await petForQuote(b);
  await b.waitForTimeout(300);
  await b.screenshot({ path: `${SHOTS}/easter-orbi-3d.png` });
});