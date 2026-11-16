import { expect, type Browser, type Page } from "./setup.ts";

/** Ajudantes dos testes do pacote "mesas" (gancho window.__infinity e window.__mesas, só em desenvolvimento). */

export const SHOTS = "test-results/screens";

export interface Obj {
  id: string;
  type: string;
  pos: { x: number; z: number };
  zoneId?: string;
  deskId?: string;
  interact?: { point: { x: number; z: number } };
}

interface Hook {
  store: { getState(): { selfId: string | null; players: Record<string, { name: string }> } };
  self: { x: number; z: number; anim: string };
  walkTo(p: { x: number; z: number }): boolean;
  world(): { map: { objects: Obj[] }; nav: { isWalkable(p: { x: number; z: number }): boolean } };
  interact: { getState(): { target: { label: string } | null } };
  acts: { state: { getState(): { acts: Record<string, { state: unknown }> } }; send(id: string, op: string, data?: unknown): void };
}

export interface Note {
  id: string;
  text: string;
  fromName: string;
  toName: string;
}

export interface Priv {
  inbox: Note[];
  sent: Note[];
  last: string | null;
  admin: boolean;
}

export interface MesasSnap {
  checkins: Record<string, { name: string; until: number }>;
  fixed: Record<string, string>;
  items: Record<string, string[]>;
}

export type W = { __infinity: Hook; __mesas: { ui: { getState(): { priv: Priv | null } }; counts(): Record<string, number> } };

export async function enter(browser: Browser, name: string, lens: "2d" | "3d", extra = ""): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto(`/?nome=${encodeURIComponent(name)}&lente=${lens}${extra}`);
  await page.waitForFunction(() => !!(window as unknown as Partial<W>).__infinity?.store.getState().selfId && !!(window as unknown as Partial<W>).__mesas?.ui.getState().priv, null, {
    timeout: 30_000,
  });
  return page;
}

export function snap(page: Page): Promise<MesasSnap> {
  return page.evaluate(() => (window as unknown as W).__infinity.acts.state.getState().acts["mesas"]!.state as MesasSnap);
}

export function priv(page: Page): Promise<Priv> {
  return page.evaluate(() => (window as unknown as W).__mesas.ui.getState().priv!);
}

export function send(page: Page, op: string, data?: unknown): Promise<void> {
  return page.evaluate(([op, data]) => (window as unknown as W).__infinity.acts.send("mesas", op as string, data), [op, data] as const);
}

export function label(page: Page): Promise<string | null> {
  return page.evaluate(() => (window as unknown as W).__infinity.interact.getState().target?.label ?? null);
}

/** Anda até o ponto pelo caminho do jogo e espera chegar. */
export async function walk(page: Page, p: { x: number; z: number }, tol = 0.6): Promise<void> {
  const dist = () => page.evaluate((p) => Math.hypot((window as unknown as W).__infinity.self.x - p.x, (window as unknown as W).__infinity.self.z - p.z), p);
  for (let i = 0; i < 4; i++) {
    await page.evaluate((p) => (window as unknown as W).__infinity.walkTo(p), p);
    const t0 = Date.now();
    while (Date.now() - t0 < 9000) {
      if ((await dist()) < tol) return;
      await page.waitForTimeout(250);
    }
  }
  expect(await dist()).toBeLessThan(tol);
}

export interface DeskInfo {
  id: string;
  type: string;
  pos: { x: number; z: number };
  seat: { x: number; z: number };
  /** Ponto andável perto do tampo, longe da cadeira (para o recado em pé). */
  side: { x: number; z: number };
}

/** Mesas de trabalho de uma sala, com a cadeira e um lugar para ficar em pé ao lado. */
export function desksIn(page: Page, zone: string): Promise<DeskInfo[]> {
  return page.evaluate((zone) => {
    const w = (window as unknown as W).__infinity.world();
    const objs = w.map.objects;
    const out: DeskInfo[] = [];
    for (const chair of objs.filter((o) => o.deskId && o.zoneId === zone)) {
      const desk = objs.find((o) => o.id === chair.deskId)!;
      const seat = chair.interact!.point;
      let side: { x: number; z: number } | null = null;
      for (let r = 1.0; r <= 1.2 && !side; r += 0.05) {
        for (let k = 0; k < 24; k++) {
          const a = (k / 24) * Math.PI * 2;
          const p = { x: desk.pos.x + Math.cos(a) * r, z: desk.pos.z + Math.sin(a) * r };
          if (w.nav.isWalkable(p) && Math.hypot(p.x - seat.x, p.z - seat.z) > 1.45) {
            side = p;
            break;
          }
        }
      }
      out.push({ id: desk.id, type: desk.type, pos: desk.pos, seat, side: side ?? seat });
    }
    return out;
  }, zone);
}

/** Senta na cadeira da mesa pelo botão "E · Sentar". */
export async function sitAt(page: Page, d: DeskInfo): Promise<void> {
  await walk(page, d.seat, 0.5);
  await expect.poll(() => label(page), { timeout: 5000 }).toBe("Sentar");
  await page.keyboard.press("KeyE");
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__infinity.self.anim), { timeout: 5000 }).toBe("sit");
}

/** Deixa a pessoa sem mesa, sem recados e (se for admin) sem mesas fixas: os testes começam do zero. */
export async function reset(page: Page): Promise<void> {
  await send(page, "checkout");
  await send(page, "objetos", { items: [] });
  const p = await priv(page);
  for (const n of [...p.inbox, ...p.sent]) await send(page, "apagar", { id: n.id });
}

/**
 * O que está desenhado no mundo bate com o estado? Calcula, a partir do estado público, quantas
 * plaquinhas e quantos de cada objeto deveriam aparecer, e devolve junto com o que a cena desenhou.
 */
export function drawnVsState(page: Page): Promise<{ drawn: Record<string, number>; want: Record<string, number> }> {
  return page.evaluate(() => {
    const w = window as unknown as W;
    const s = w.__infinity.acts.state.getState().acts["mesas"]!.state as MesasSnap;
    const now = Date.now();
    const key = (n: string) => n.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
    const owner = new Map<string, string>();
    for (const [id, c] of Object.entries(s.checkins)) if (c.until > now) owner.set(id, c.name);
    for (const [id, n] of Object.entries(s.fixed)) owner.set(id, n);
    const current = (k: string) => {
      for (const [id, c] of Object.entries(s.checkins)) if (c.until > now && key(c.name) === k) return id;
      for (const [id, n] of Object.entries(s.fixed)) if (key(n) === k) return id;
      return null;
    };
    const want: Record<string, number> = { "@placa": owner.size };
    for (const [id, name] of owner) {
      const k = key(name);
      if (current(k) !== id) continue;
      for (const it of s.items[k] ?? []) want[it] = (want[it] ?? 0) + 1;
    }
    const drawn = w.__mesas.counts();
    return { drawn, want };
  });
}

/** Espera a cena desenhar exatamente o que o estado diz. */
export async function expectDrawnMatchesState(page: Page): Promise<Record<string, number>> {
  let last: { drawn: Record<string, number>; want: Record<string, number> } = { drawn: {}, want: {} };
  await expect
    .poll(async () => {
      last = await drawnVsState(page);
      const names = new Set([...Object.keys(last.want), ...Object.keys(last.drawn).filter((k) => k !== "@bilhete")]);
      return [...names].every((n) => (last.drawn[n] ?? 0) === (last.want[n] ?? 0));
    })
    .toBe(true);
  return last.drawn;
}
