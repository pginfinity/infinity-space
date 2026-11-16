import { expect, type Page } from "./setup.ts";

/** Ajudantes dos testes do pacote "vivo" (estação viva). */

export interface VivoHook {
  store: { getState(): { selfId: string | null; players: Record<string, { held?: string; name: string }> } };
  self: { x: number; z: number; yaw: number; anim: string };
  walkTo(p: { x: number; z: number }): boolean;
  interact: { getState(): { target: { label: string } | null } };
  world(): { map: { objects: Array<{ id: string; type: string; pos: { x: number; z: number }; rot: number; zoneId?: string }> } };
  acts: { state: { getState(): { acts: Record<string, { state: unknown }> } }; send(id: string, op: string, data?: unknown): void };
}
export interface VivoDev {
  hold(item: string): void;
  wilt(id: string, w: number | null): void;
  musicLevel(): number;
}
export type W = { __infinity: VivoHook; __vivo: VivoDev };

export async function enter(page: Page, name: string, lens: "2d" | "3d" = "2d"): Promise<void> {
  await page.goto(`/?nome=${name}&lente=${lens}`);
  await page.waitForFunction(() => {
    const w = window as unknown as Partial<W>;
    return !!w.__infinity?.store.getState().selfId && !!w.__vivo && !!w.__infinity.acts.state.getState().acts.copa;
  }, null, { timeout: 30_000 });
}

export function selfId(page: Page): Promise<string> {
  return page.evaluate(() => (window as unknown as W).__infinity.store.getState().selfId!);
}

/** Anda até perto de um ponto (o caminho vai até o chão andável mais próximo). */
export async function walkNear(page: Page, p: { x: number; z: number }, tol = 1.0, timeout = 40_000): Promise<void> {
  await page.evaluate((p) => (window as unknown as W).__infinity.walkTo(p), p);
  await expect
    .poll(() => page.evaluate((p) => Math.hypot((window as unknown as W).__infinity.self.x - p.x, (window as unknown as W).__infinity.self.z - p.z), p), { timeout })
    .toBeLessThan(tol);
}

/** Ponto na frente de um objeto do mapa. */
export async function frontOf(page: Page, type: string, d = 0.95): Promise<{ x: number; z: number }> {
  return page.evaluate(
    ([type, d]) => {
      const o = (window as unknown as W).__infinity.world().map.objects.find((x) => x.type === type)!;
      return { x: o.pos.x + Math.sin(o.rot) * (d as number), z: o.pos.z - Math.cos(o.rot) * (d as number) };
    },
    [type, d] as const,
  );
}

export function promptLabel(page: Page): Promise<string | null> {
  return page.evaluate(() => (window as unknown as W).__infinity.interact.getState().target?.label ?? null);
}

/** Aproxima a câmera (rolagem) para os screenshots. */
export async function zoomIn(page: Page, steps: number): Promise<void> {
  await page.mouse.move(720, 450);
  for (let i = 0; i < steps; i++) await page.mouse.wheel(0, -300);
  await page.waitForTimeout(400);
}

export function actState<T>(page: Page, id: string): Promise<T> {
  return page.evaluate((id) => (window as unknown as W).__infinity.acts.state.getState().acts[id]!.state, id) as Promise<T>;
}
