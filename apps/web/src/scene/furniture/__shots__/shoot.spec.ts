import { test } from "@playwright/test";
import path from "node:path";

/** Uso: SHOTS="nome:query;nome2:query2" npx playwright test -c <este dir>/shots.config.ts */
const DEFAULT = "todos-iso:cam=iso;todos-persp:cam=persp;todos-pixel:cam=iso&pixel=1";
const list = (process.env.SHOTS ?? DEFAULT).split(";").filter(Boolean).map((s) => {
  const i = s.indexOf(":");
  return { name: s.slice(0, i), query: s.slice(i + 1) };
});
const OUT = path.resolve(process.cwd(), "test-results/furniture");

for (const shot of list) {
  test(shot.name, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(m.text()); });
    await page.goto(`${process.env.PAGE ?? "/"}?galeria=1&${shot.query}`);
    try {
      await page.waitForFunction(() => (window as unknown as { __galeria?: { ready?: boolean } }).__galeria?.ready === true, null, { timeout: Number(process.env.TIMEOUT ?? 120_000) });
    } catch {
      console.log("sem ready");
    }
    await page.waitForTimeout(Number(process.env.WAIT ?? 1500));
    const stats = await page.evaluate(() => (window as unknown as { __galeria?: unknown }).__galeria);
    console.log(shot.name, JSON.stringify(stats));
    if (errors.length) console.log("ERROS:", errors.slice(0, 8).join("\n"));
    await page.screenshot({ path: path.join(OUT, `${shot.name}.png`) });
  });
}
