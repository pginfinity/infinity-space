import { readFile } from "node:fs/promises";
import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { PHOTOWALL_MAX_BYTES, PHOTOWALL_RATE, type PhotoWallError } from "@infinity/world";
import { Limiter, clientIp, sameAppOrigin } from "../../auth/routes.ts";
import type { PhotoWallActivity } from "./photowall.ts";

export interface PhotoWallHttpDeps {
  /** A atividade do mural (carregada com os pacotes). */
  wall(): PhotoWallActivity | undefined;
  /** Conta da sessão do pedido (pelo cookie), ou undefined. */
  sessionEmail(c: Context): string | undefined;
  /** Login ligado: sem sessão válida, nada feito. Desligado (desenvolvimento): vale o bilhete. */
  authRequired: boolean;
}

/** Cabeçalho com o bilhete que a cabine deu a quem saiu na foto. */
export const PHOTOWALL_TICKET_HEADER = "x-bilhete";

/**
 * HTTP do mural de fotos da copa (montado em `/api/mural-fotos`).
 *
 * - `POST /` com a imagem no corpo (JPEG ou PNG, até PHOTOWALL_MAX_BYTES) e o bilhete no cabeçalho
 *   `X-Bilhete`. Exige o mesmo que o WebSocket: com login ligado, sessão válida e da mesma conta que
 *   recebeu o bilhete; sempre, origem do próprio app. Limite por pessoa e por IP.
 * - `GET /<id>.jpg`: a foto, só enquanto está no mural. Cache longo, mas `private` (a Cloudflare não
 *   guarda: com login ligado, só quem tem sessão vê).
 */
export function photoWallRoutes(deps: PhotoWallHttpDeps): Hono {
  const app = new Hono();
  const byPerson = new Limiter(PHOTOWALL_RATE.max, PHOTOWALL_RATE.windowMs);
  const byIp = new Limiter(PHOTOWALL_RATE.max * 5, PHOTOWALL_RATE.windowMs);
  const fail = (c: Context, error: PhotoWallError, status: ContentfulStatusCode) => c.json({ error }, status);

  app.post("/", async (c) => {
    if (!sameAppOrigin(c.req.header("origin"))) return fail(c, "origem", 403);
    const email = deps.sessionEmail(c);
    if (deps.authRequired && !email) return fail(c, "sessao", 401);
    const wall = deps.wall();
    if (!wall) return fail(c, "mural", 503);
    const ticket = c.req.header(PHOTOWALL_TICKET_HEADER);
    const owner = wall.ticketOwner(ticket);
    if (!owner || (deps.authRequired && owner.email !== email)) return fail(c, "bilhete", 403);
    if (owner.posted) return fail(c, "ja-no-mural", 409);
    if (!byIp.allow(clientIp(c)) || !byPerson.allow(owner.email ?? `id:${owner.id}`)) return fail(c, "muitas", 429);
    const bytes = await readCapped(c.req.raw, PHOTOWALL_MAX_BYTES);
    if (!bytes) return fail(c, "grande", 413);
    const r = wall.upload(ticket, bytes, deps.authRequired ? email : undefined);
    if (r.ok) return c.json({ id: r.photo.id }, 201);
    const status: Record<typeof r.error, ContentfulStatusCode> = { bilhete: 403, "ja-no-mural": 409, tipo: 415, tamanho: 422, mural: 500 };
    return fail(c, r.error, status[r.error]);
  });

  app.get("/:file", async (c) => {
    if (deps.authRequired && !deps.sessionEmail(c)) return fail(c, "sessao", 401);
    const f = deps.wall()?.file(c.req.param("file"));
    if (!f) return c.json({ error: "não encontrado" }, 404);
    const data = await readFile(f.path).catch(() => null);
    if (!data) return c.json({ error: "não encontrado" }, 404);
    return c.body(new Uint8Array(data), 200, {
      "Content-Type": f.type === "png" ? "image/png" : "image/jpeg",
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    });
  });

  return app;
}

/** Lê o corpo até `max` bytes; mais que isso devolve null sem ler o resto. */
async function readCapped(req: Request, max: number): Promise<Uint8Array | null> {
  const declared = Number(req.headers.get("content-length") ?? NaN);
  if (Number.isFinite(declared) && declared > max) return null;
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}
