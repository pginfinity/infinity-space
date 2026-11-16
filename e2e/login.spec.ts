import { expect, test, type Page } from "./setup.ts";

/**
 * Login por convite com link mágico, numa pilha com o login ligado:
 *   servidor: AUTH_REQUIRED=true PUBLIC_URL=<web> ADMIN_EMAILS=admin@teste.local E2E_MAILBOX=true
 *   E2E_AUTH_URL=<web> npx playwright test e2e/login.spec.ts
 * Sem E2E_AUTH_URL o teste é pulado (a pilha normal de desenvolvimento roda sem login).
 */

const BASE = process.env.E2E_AUTH_URL;
test.skip(!BASE, "precisa de uma pilha com AUTH_REQUIRED=true (E2E_AUTH_URL)");

async function lastLink(page: Page, to: string): Promise<string> {
  let link = "";
  await expect
    .poll(async () => {
      const mail = (await (await page.request.get(`${BASE}/api/dev/caixa`)).json()) as { to: string; text: string } | null;
      link = mail?.to === to ? (/https?:\/\/\S+/.exec(mail.text)?.[0] ?? "") : "";
      return link;
    })
    .not.toBe("");
  return link;
}

test("convite, link mágico, entrar e remover", async ({ browser }) => {
  // E-mail novo a cada rodada (os dados do servidor de teste ficam entre execuções).
  const bruno = `bruno@r${Date.now()}.teste.local`;
  const a = await (await browser.newContext()).newPage();
  await a.goto(BASE!);

  // Admin pede o link e entra.
  await a.getByLabel("E-mail").fill("admin@teste.local");
  await a.getByRole("button", { name: "Receber link de entrada" }).click();
  await expect(a.getByText("Confira seu e-mail")).toBeVisible();
  await a.screenshot({ path: "test-results/screens/v3-login-enviado.png" });
  const link = await lastLink(a, "admin@teste.local");
  await a.goto(link);
  await expect(a.getByText("Entrando como")).toBeVisible();
  await a.getByLabel("Seu nome").fill("Ana Admin");
  await a.getByRole("button", { name: /Entrar/ }).first().click();
  await expect(a.getByText("1 pessoa online")).toBeVisible({ timeout: 30_000 });

  // O mesmo link não serve de novo.
  const other = await (await browser.newContext()).newPage();
  await other.goto(link);
  await expect(other.getByText("O link expirou ou já foi usado")).toBeVisible();

  // Admin convida o Bruno pelo painel Pessoas.
  await a.getByRole("button", { name: "Pessoas", exact: true }).click();
  await a.getByRole("button", { name: "Convidar" }).click();
  const dialog = a.getByRole("dialog", { name: "Convidar pessoas" });
  await dialog.getByRole("textbox").fill(bruno);
  await dialog.getByRole("button", { name: "Convidar" }).click();
  await expect(dialog.getByText(`Convite enviado para ${bruno}.`)).toBeVisible();
  await a.screenshot({ path: "test-results/screens/v3-convidar.png" });

  // Bruno abre o convite e entra; o nome vem da conta.
  const b = await (await browser.newContext()).newPage();
  await b.goto(await lastLink(a, bruno));
  await expect(b.getByText("Entrando como")).toBeVisible();
  await expect(b.getByLabel("Seu nome")).toHaveValue("Bruno");
  await b.getByRole("button", { name: /Entrar/ }).first().click();
  await expect(b.getByText("2 pessoas online")).toBeVisible({ timeout: 30_000 });

  // Admin remove o Bruno: ele volta para a tela de login.
  const row = dialog.getByRole("listitem").filter({ hasText: bruno });
  await row.getByRole("button", { name: /Remover/ }).click();
  await row.getByRole("button", { name: "Remover", exact: true }).click();
  await expect(b.getByRole("button", { name: "Receber link de entrada" })).toBeVisible({ timeout: 20_000 });
  await b.screenshot({ path: "test-results/screens/v3-login-removido.png" });
});
