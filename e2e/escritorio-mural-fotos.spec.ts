import { expect, test, type Page } from "./setup.ts";
import { SHOTS, enter, objectOf, waitOnline, walk, type W } from "./escritorio-helpers.ts";

/**
 * Mural de fotos da copa: a Ana tira a foto na cabine do Marketing e põe no mural (a imagem vai
 * reduzida, em JPEG, por HTTP). O Bruno, na copa, vê a foto aparecer no mural (3D) e a Ana também,
 * quando chega (2D). O Bruno abre a galeria (foto grande, data, baixar) e tira a foto do mural:
 * ela some para todo mundo e o servidor deixa de servir a imagem.
 */

interface Wall {
  photos: Array<{ id: string; at: number; type: string; w: number; h: number; names: string[] }>;
}

const wallState = (p: Page) => p.evaluate(() => (window as unknown as W).__infinity.acts.state.getState().acts["mural-fotos"]!.state as Wall);
/** Quantas fotos a textura do mural (na lente atual) está mostrando. */
const drawn = (p: Page) => p.evaluate(() => (window as unknown as { __muralFotos: { drawn(): number } }).__muralFotos.drawn());
const label = (p: Page) => p.evaluate(() => (window as unknown as W).__infinity.interact.getState().target?.label ?? null);
const aim = (p: Page, yawDeg: number, pitch: number, dist: number) =>
  p.evaluate(([y, pi, d]) => (window as unknown as { __infinityCam?: (y: number, p: number, d: number) => void }).__infinityCam?.(y!, pi!, d!), [yawDeg, pitch, dist]);

test("mural de fotos da copa: da cabine para o mural, visto nas duas lentes, e tirado por quem está perto", async ({ browser }) => {
  test.setTimeout(180_000);
  const a = await enter(browser, "Ana", "2d");
  const b = await enter(browser, "Bruno", "3d");
  await waitOnline(a, 2);

  // O Bruno vai para a copa, de frente para o mural, e limpa o que sobrou de outros testes.
  const wall = await objectOf(a, "photo-wall");
  const spot = wall.interact!.point;
  await walk(b, spot, 0.5);
  await expect.poll(() => label(b)).toMatch(/^Ver fotos/);
  for (const p of (await wallState(b)).photos) await b.evaluate((id) => (window as unknown as W).__infinity.acts.send("mural-fotos", "remove", { id }), p.id);
  await expect.poll(async () => (await wallState(b)).photos.length).toBe(0);
  await walk(b, { x: spot.x - 0.9, z: spot.z + 1.7 }, 0.5);
  await aim(b, 16, 0.2, 3.0);

  // A Ana tira a foto na cabine: liga o timer no tripé e corre para a frente do fundo.
  const backdrop = await objectOf(a, "backdrop");
  const tripod = await objectOf(a, "camera-tripod");
  await walk(a, { x: tripod.pos.x + 0.9, z: tripod.pos.z + 0.4 }, 0.5);
  await expect(a.getByText(/Tirar foto da turma/)).toBeVisible({ timeout: 8000 });
  await a.keyboard.press("KeyE");
  await a.evaluate((p) => (window as unknown as W).__infinity.walkTo(p), { x: backdrop.pos.x - 0.3, z: backdrop.pos.z + 1.5 });
  const card = a.getByRole("dialog", { name: "Sua foto" });
  await expect(card).toBeVisible({ timeout: 20_000 });
  const toWall = card.getByRole("button", { name: "Pôr no mural da copa" });
  await expect(toWall).toBeVisible();
  await expect(card.getByText(/qualquer pessoa lá pode tirar/)).toBeVisible();
  await a.screenshot({ path: `${SHOTS}/escritorio-mural-fotos-cabine.png` });

  // Põe no mural: um JPEG reduzido (lado maior 1280) vai por HTTP.
  const upload = a.waitForResponse((r) => r.url().endsWith("/api/mural-fotos") && r.request().method() === "POST");
  await toWall.click();
  const res = await upload;
  expect(res.status()).toBe(201);
  await expect(card.getByText("No mural da copa")).toBeVisible();
  await expect(card.getByRole("button", { name: "Pôr no mural da copa" })).toHaveCount(0);

  // O Bruno, na copa, vê a foto chegar: estado ao vivo e textura no mural (3D).
  await expect.poll(async () => (await wallState(b)).photos.length, { timeout: 10_000 }).toBe(1);
  const photo = (await wallState(b)).photos[0]!;
  expect(photo.names).toEqual(["Ana"]);
  expect(photo.type).toBe("jpeg");
  expect(Math.max(photo.w, photo.h)).toBe(1280);
  // Junto da foto fica só data, tamanho e quem aparece na moldura (nada de quem enviou).
  expect(Object.keys(photo).sort()).toEqual(["at", "h", "id", "names", "type", "w"]);
  // O servidor guardou um JPEG de verdade, bem abaixo do limite de 2 MB.
  const file = await b.evaluate((url) => fetch(url).then(async (r) => ({ status: r.status, cache: r.headers.get("cache-control"), bytes: await r.arrayBuffer().then((x) => ({ head: [...new Uint8Array(x, 0, 3)], size: x.byteLength })) })), `/api/mural-fotos/${photo.id}.jpg`);
  expect(file.status).toBe(200);
  expect(file.cache).toContain("private");
  expect(file.bytes.head).toEqual([0xff, 0xd8, 0xff]);
  expect(file.bytes.size).toBeLessThan(2 * 1024 * 1024);
  await expect.poll(() => drawn(b), { timeout: 15_000 }).toBe(1);
  await b.waitForTimeout(600);
  await b.screenshot({ path: `${SHOTS}/escritorio-mural-fotos-3d.png` });

  // A Ana fecha a foto e vai até a copa: no 2D o mural também mostra a foto.
  await a.keyboard.press("Escape");
  await walk(a, { x: spot.x + 0.7, z: spot.z + 1.2 }, 0.7);
  await expect.poll(() => drawn(a), { timeout: 15_000 }).toBe(1);
  await a.mouse.move(720, 450);
  for (let i = 0; i < 4; i++) await a.mouse.wheel(0, -300);
  await a.waitForTimeout(800);
  await a.screenshot({ path: `${SHOTS}/escritorio-mural-fotos-2d.png` });

  // O Bruno chega no mural e abre a galeria: foto grande, data, quem aparece e baixar.
  await walk(b, spot, 0.5);
  await expect.poll(() => label(b)).toBe("Ver fotos · 1");
  await b.keyboard.press("KeyE");
  const gallery = b.getByRole("dialog", { name: "Mural de fotos da copa" });
  await expect(gallery).toBeVisible();
  const big = gallery.locator(`img[data-photo="${photo.id}"]`);
  await expect(big).toBeVisible();
  await expect.poll(() => big.evaluate((el: HTMLImageElement) => (el.complete ? el.naturalWidth : 0))).toBe(photo.w);
  await expect(gallery.getByText(String(new Date(photo.at).getFullYear()))).toBeVisible();
  await expect(gallery.getByText("Com Ana")).toBeVisible();
  await expect(gallery.getByRole("link", { name: "Baixar" })).toHaveAttribute("href", `/api/mural-fotos/${photo.id}.jpg`);
  await b.screenshot({ path: `${SHOTS}/escritorio-mural-fotos-galeria.png` });

  // Tirar do mural (com confirmação): some para todo mundo e o servidor para de servir a imagem.
  await gallery.getByRole("button", { name: "Tirar do mural" }).click();
  await gallery.getByRole("button", { name: "Tirar", exact: true }).click();
  await expect(gallery.getByText("Nenhuma foto ainda.")).toBeVisible({ timeout: 5000 });
  await expect.poll(async () => (await wallState(a)).photos.length).toBe(0);
  await expect.poll(() => drawn(a)).toBe(0);
  expect(await a.evaluate((url) => fetch(url, { cache: "no-store" }).then((r) => r.status), `/api/mural-fotos/${photo.id}.jpg`)).toBe(404);
  await b.keyboard.press("Escape");
  await expect(gallery).toHaveCount(0);
  await a.waitForTimeout(400);
  await a.screenshot({ path: `${SHOTS}/escritorio-mural-fotos-vazio-2d.png` });
});
