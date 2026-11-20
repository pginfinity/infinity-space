import { expect, test } from "./setup.ts";
import { SHOTS, enter, objectOf, waitOnline, walk, type W } from "./escritorio-helpers.ts";

/**
 * Painel do time no Átrio: a Gestora (admin de desenvolvimento, ?admin=1) escreve as metas, publica
 * um aviso e salva os aniversários; o Bruno (sem admin) vê tudo, mas sem os botões de editar e sem a
 * lista inteira de aniversários. Com o Supremacy ligado no servidor, o quadro do que subiu aparece.
 */
test("painel: admin edita metas, avisos e aniversários; o time só lê", async ({ browser }) => {
  test.setTimeout(150_000);
  const b = await enter(browser, "Bruno", "3d");
  const a = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await a.goto(`/?nome=Gestora&lente=2d&admin=1`);
  await a.waitForFunction(() => !!(window as unknown as Partial<W>).__infinity?.store.getState().selfId, null, { timeout: 30_000 });
  await waitOnline(a, 2);
  const spot = (await objectOf(a, "lobby-panel")).interact!.point;
  await walk(a, { x: spot.x, z: spot.z - 0.4 }, 0.6);
  await walk(b, { x: spot.x, z: spot.z + 0.6 }, 0.6);

  await expect(a.getByText(/Ver painel/).first()).toBeVisible({ timeout: 5000 });
  await a.keyboard.press("KeyE");
  const pa = a.getByRole("dialog", { name: "Painel do time" });
  await expect(pa).toBeVisible();

  const metas = pa.getByRole("region", { name: "Metas da semana" });
  await metas.getByRole("button", { name: "Editar" }).click();
  const tag = Date.now() % 10000;
  await metas.getByRole("textbox").fill(`- Fechar 3 contratos #${tag}\nSubir o CRM da Cunha`);
  await metas.getByRole("button", { name: "Salvar" }).click();
  await expect(metas.locator("li", { hasText: `Fechar 3 contratos #${tag}` })).toBeVisible({ timeout: 5000 });

  const avisos = pa.getByRole("region", { name: "Avisos do gestor" });
  await avisos.getByRole("textbox").fill(`Happy hour sexta #${tag}`);
  await avisos.getByRole("button", { name: "Publicar" }).click();
  await expect(avisos.getByText(`Happy hour sexta #${tag}`)).toBeVisible({ timeout: 5000 });
  await expect(avisos.getByRole("textbox")).toHaveValue("");

  const hoje = await a.evaluate(() => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }).format(new Date()));
  const niver = pa.getByRole("region", { name: "Aniversariantes" });
  await niver.getByRole("button", { name: "Editar" }).click();
  await niver.getByRole("textbox").fill(`Carla ${hoje}\nlinha ruim`);
  await niver.getByRole("button", { name: "Salvar" }).click();
  await expect(niver.getByRole("alert")).toContainText("linha ruim");
  await expect(niver.locator("li", { hasText: "Carla" })).toContainText("Hoje");
  await a.screenshot({ path: `${SHOTS}/escritorio-painel-admin.png` });

  // Bruno lê: vê o que a Gestora escreveu, sem editar.
  await b.keyboard.press("KeyE");
  const pb = b.getByRole("dialog", { name: "Painel do time" });
  await expect(pb).toBeVisible();
  await expect(pb.getByText(`Fechar 3 contratos #${tag}`)).toBeVisible();
  await expect(pb.getByText(`Happy hour sexta #${tag}`)).toBeVisible();
  await expect(pb.getByText("Carla")).toBeVisible();
  await expect(pb.getByRole("button", { name: "Editar" })).toHaveCount(0);
  await expect(pb.getByRole("button", { name: "Tirar aviso" })).toHaveCount(0);
  const deploys = await b.evaluate(() => ((window as unknown as W).__infinity.acts.state.getState().acts.painel?.state as { deploys: unknown[] | null }).deploys);
  if (deploys) await expect(pb.getByRole("region", { name: /Subiu para produção/ })).toBeVisible();
  else await expect(pb.getByRole("region", { name: /Subiu para produção/ })).toHaveCount(0);
  await b.keyboard.press("Escape");
  await b.waitForTimeout(1500);
  await b.screenshot({ path: `${SHOTS}/escritorio-painel-3d.png` });

  // A Gestora tira o aviso.
  await avisos.locator("li", { hasText: `#${tag}` }).getByRole("button", { name: "Tirar aviso" }).click();
  await expect(avisos.getByText(`Happy hour sexta #${tag}`)).toHaveCount(0, { timeout: 5000 });
});
