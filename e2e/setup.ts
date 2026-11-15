import { test as base } from "@playwright/test";

/**
 * Todos os testes usam o mesmo escritório ao vivo. Cada teste abre as próprias janelas
 * (browser.newContext) e elas são fechadas no fim, para ninguém sobrar online no teste seguinte.
 */
export const test = base.extend<{ cleanup: void }>({
  cleanup: [
    async ({ browser }, use) => {
      await use();
      await Promise.all(browser.contexts().map((c) => c.close().catch(() => undefined)));
    },
    { auto: true },
  ],
});
export { expect, type Browser, type Page } from "@playwright/test";
