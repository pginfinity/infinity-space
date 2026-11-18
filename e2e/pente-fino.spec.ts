import { test } from "./setup.ts";

/**
 * Pente-fino visual: percorre as salas no visual oficial (Cinema, com sombras), de dia e de noite,
 * nas duas lentes, e salva um screenshot por sala para revisão. Não confere nada sozinho: serve
 * para olhar. Demorado; só roda quando pedido: `PENTE_FINO=1 npx playwright test e2e/pente-fino.spec.ts`
 * (PENTE_LENTE=2d|3d e PENTE_CEU=dia|noite limitam a uma combinação; PENTE_SALAS=dev,ia, a algumas salas).
 */

const SKIES = { dia: "2026-11-18T10:30:00-03:00", noite: "2026-11-18T23:30:00-03:00" } as const;
// PENTE_SALAS=dev,ia limita às salas da lista.
const ALL_ROOMS = [
  "atrio", "marketing", "dev", "design", "ia", "diretoria-lounge", "diretoria-1", "comercial", "foco-hall", "foco-1",
  "gestao", "cafe", "arcade", "eclipse", "auditorio", "corredor-norte", "corredor-sul",
];
const ROOMS = process.env.PENTE_SALAS ? ALL_ROOMS.filter((r) => process.env.PENTE_SALAS!.split(",").includes(r)) : ALL_ROOMS;

interface Vec2 { x: number; z: number }
interface Hook {
  store: { getState(): { selfId: string | null } };
  self: Vec2;
  walkTo(p: Vec2, arrive?: () => void, opts?: { speed?: number }): boolean;
  world(): {
    map: { zones: { id: string; polygon: Vec2[] }[] };
    nav: { nearestWalkable(p: Vec2, r: number): Vec2 | null; findPath(a: Vec2, b: Vec2): Vec2[] | null };
  };
}
type W = { __infinity: Hook };

const lenses = (process.env.PENTE_LENTE ? [process.env.PENTE_LENTE] : ["2d", "3d"]) as ("2d" | "3d")[];
const skies = (process.env.PENTE_CEU ? [process.env.PENTE_CEU] : ["dia", "noite"]) as (keyof typeof SKIES)[];

for (const lens of lenses) {
  for (const sky of skies) {
    test(`pente-fino ${lens} ${sky}`, async ({ browser }) => {
      test.skip(!process.env.PENTE_FINO, "só quando pedido (PENTE_FINO=1)");
      test.setTimeout(600_000);
      const ctx = await browser.newContext();
      await ctx.addInitScript(() => {
        try {
          localStorage.setItem("infinity.qualidade.v1", "auto");
          localStorage.setItem("infinity-space:primeiros-passos", JSON.stringify({ v: 1, phase: "done", done: [] }));
        } catch {
          /* sem armazenamento */
        }
      });
      const page = await ctx.newPage();
      await page.goto(`/?nome=Revisao&lente=${lens}&visual=cinema&quadros&ceu=${encodeURIComponent(SKIES[sky])}`);
      await page.waitForFunction(() => !!(window as unknown as Partial<W>).__infinity?.store.getState().selfId, null, { timeout: 30_000 });
      if (lens === "3d") await page.waitForSelector('[role="application"][data-ready="true"]', { timeout: 120_000 });
      await page.waitForTimeout(2000);

      for (const room of ROOMS) {
        const ok = await page.evaluate((id) => {
          const w = (window as unknown as W).__infinity;
          const z = w.world().map.zones.find((q) => q.id === id);
          if (!z) return false;
          const c = z.polygon.reduce((a, p) => ({ x: a.x + p.x / z.polygon.length, z: a.z + p.z / z.polygon.length }), { x: 0, z: 0 });
          const goal = w.world().nav.nearestWalkable(c, 4);
          if (!goal) return false;
          (window as unknown as { __penteGoal?: Vec2 }).__penteGoal = goal;
          return w.walkTo(goal, undefined, { speed: 8.5 });
        }, room);
        if (!ok) {
          console.log(`sem rota: ${room}`);
          continue;
        }
        await page
          .waitForFunction(
            () => {
              const w = window as unknown as W & { __penteGoal: Vec2 };
              return Math.hypot(w.__infinity.self.x - w.__penteGoal.x, w.__infinity.self.z - w.__penteGoal.z) < 0.8;
            },
            null,
            { timeout: 45_000, polling: 250 },
          )
          .catch(() => console.log(`não chegou: ${room}`));
        await page.waitForTimeout(1600);
        await page.screenshot({ path: `test-results/screens/pente/${lens}-${sky}-${room}.png` });
      }
    });
  }
}
