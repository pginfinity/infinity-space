import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  PHOTOWALL_FILE_RE,
  PHOTOWALL_ID,
  PHOTOWALL_KIND,
  PHOTOWALL_MAX,
  PHOTOWALL_RANGE,
  PHOTOWALL_TICKET_MS,
  photoWallAdd,
  photoWallFile,
  photoWallImageInfo,
  photoWallRemove,
  photoWallSizeOk,
  type PhotoWallPosted,
  type PhotoWallState,
  type PhotoWallType,
  type Vec2,
  type WallPhoto,
} from "@infinity/world";
import type { Activity, ActivityHost } from "../types.ts";

const KEY = "escritorio/mural-fotos";
/** Subpasta de DATA_DIR com as imagens. */
export const PHOTOWALL_DIR = "fotos-copa";
const NAMES_MAX = 12;

/** Um disparo da cabine: quem saiu na foto, até quando vale e se já foi para o mural. */
interface Shot {
  ids: string[];
  names: string[];
  until: number;
  posted: boolean;
}

export type UploadResult = { ok: true; photo: WallPhoto } | { ok: false; error: "bilhete" | "ja-no-mural" | "tipo" | "tamanho" | "mural" };

/**
 * Mural de fotos da copa. As imagens chegam por HTTP (ver photowall-http.ts), cada uma com o
 * bilhete que a cabine deu a quem saiu na foto; ficam em `DATA_DIR/fotos-copa/<id>.jpg` e a lista
 * (data, tamanho e quem aparece) no armazenamento JSON. No máximo PHOTOWALL_MAX: as mais antigas
 * saem do disco. Qualquer pessoa perto do mural tira uma foto.
 *
 * Operações (WebSocket): `remove` { id }.
 * Eventos: `posted` PhotoWallPosted (para quem saiu na foto).
 */
export class PhotoWallActivity implements Activity {
  readonly id = PHOTOWALL_ID;
  readonly kind = PHOTOWALL_KIND;
  /** Pasta das imagens (null: sem disco, só nos testes que não precisam). */
  readonly dir: string | null;
  private state: PhotoWallState;
  private readonly shots = new Map<string, Shot>();
  /** Bilhete → quem recebeu (id e, com login, a conta) e de qual disparo. */
  private readonly tickets = new Map<string, { id: string; email?: string; shot: string }>();
  private readonly at: Vec2;
  private readonly now: () => number;

  constructor(
    private readonly host: ActivityHost,
    opts: { dir?: string | null; now?: () => number } = {},
  ) {
    this.now = opts.now ?? Date.now;
    const storeDir = (host.store as { dir?: unknown }).dir;
    this.dir = opts.dir !== undefined ? opts.dir : typeof storeDir === "string" ? join(storeDir, PHOTOWALL_DIR) : null;
    const o = host.objects("photo-wall")[0];
    this.at = o?.interact?.point ?? o?.pos ?? { x: 0, z: 0 };
    const saved = host.store.get<PhotoWallState>(KEY, { photos: [] });
    const photos = Array.isArray(saved?.photos) ? saved.photos.filter(validPhoto) : [];
    this.state = { photos: this.reconcile(photos) };
  }

  snapshot(): PhotoWallState {
    return this.state;
  }

  handle(from: string, op: string, data: unknown): void {
    if (op !== "remove") return;
    const id = (data as { id?: unknown } | null)?.id;
    if (typeof id !== "string") return;
    if (!this.host.near(from, this.at, PHOTOWALL_RANGE)) return;
    const next = photoWallRemove(this.state.photos, id);
    if (next === this.state.photos) return;
    const gone = this.state.photos.find((p) => p.id === id)!;
    this.save(next);
    this.deleteFile(gone);
  }

  /**
   * Disparo da cabine: um bilhete para cada pessoa que saiu na foto (só ela recebe o dela).
   * Com login, o bilhete fica ligado à conta (vale mesmo se a pessoa reconectar). Devolve id → bilhete.
   */
  issue(shot: string, ids: readonly string[]): Map<string, string> {
    this.prune();
    const out = new Map<string, string>();
    if (!ids.length) return out;
    const names = ids.map((id) => this.host.playerName(id) ?? "Alguém").slice(0, NAMES_MAX);
    this.shots.set(shot, { ids: [...ids], names, until: this.now() + PHOTOWALL_TICKET_MS, posted: false });
    for (const id of ids) {
      const ticket = randomBytes(18).toString("base64url");
      const email = this.host.playerEmail?.(id);
      this.tickets.set(ticket, { id, shot, ...(email ? { email } : {}) });
      out.set(id, ticket);
    }
    return out;
  }

  /**
   * De quem é o bilhete (id de quando saiu a foto e, com login, a conta), se ainda vale, e se a
   * foto daquele disparo já foi para o mural.
   */
  ticketOwner(ticket: unknown): { id: string; email?: string; posted: boolean } | null {
    if (typeof ticket !== "string" || ticket.length > 64) return null;
    const t = this.tickets.get(ticket);
    if (!t) return null;
    const shot = this.shots.get(t.shot);
    if (!shot || shot.until < this.now()) return null;
    return { id: t.id, ...(t.email ? { email: t.email } : {}), posted: shot.posted };
  }

  /**
   * Põe a foto no mural. `email`: com login ligado, a conta da sessão do pedido, que precisa ser a
   * mesma de quem recebeu o bilhete. Confere o tipo pelos bytes e o tamanho em pixels.
   */
  upload(ticket: unknown, bytes: Uint8Array, email?: string): UploadResult {
    this.prune();
    const owner = this.ticketOwner(ticket);
    if (!owner) return { ok: false, error: "bilhete" };
    if (email !== undefined && owner.email !== email) return { ok: false, error: "bilhete" };
    const t = this.tickets.get(ticket as string)!;
    const shot = this.shots.get(t.shot)!;
    if (shot.posted) return { ok: false, error: "ja-no-mural" };
    const info = photoWallImageInfo(bytes);
    if (!info) return { ok: false, error: "tipo" };
    if (!photoWallSizeOk(info.w, info.h)) return { ok: false, error: "tamanho" };
    const now = this.now();
    const photo: WallPhoto = { id: `${now.toString(36)}${randomBytes(5).toString("hex")}`, at: now, type: info.type, w: info.w, h: info.h, names: shot.names };
    if (!this.writeFile(photo, bytes)) return { ok: false, error: "mural" };
    // Uma foto por disparo: os outros bilhetes dele passam a responder "já está no mural".
    shot.posted = true;
    const { photos, dropped } = photoWallAdd(this.state.photos, photo, PHOTOWALL_MAX);
    this.save(photos);
    for (const p of dropped) this.deleteFile(p);
    this.host.event(this, "posted", { shot: t.shot } satisfies PhotoWallPosted, { to: shot.ids });
    return { ok: true, photo };
  }

  /** Caminho e tipo de uma foto que está no mural agora (`<id>.jpg`), para servir por HTTP. */
  file(name: string): { path: string; type: PhotoWallType } | null {
    const m = PHOTOWALL_FILE_RE.exec(name);
    if (!m || !this.dir) return null;
    const p = this.state.photos.find((x) => x.id === m[1]);
    if (!p || photoWallFile(p) !== name) return null;
    return { path: join(this.dir, name), type: p.type };
  }

  private save(photos: WallPhoto[]): void {
    this.state = { photos };
    this.host.store.set(KEY, this.state);
    this.host.changed(this);
  }

  /** Bilhetes e disparos vencidos saem da memória. */
  private prune(): void {
    const now = this.now();
    for (const [k, s] of this.shots) {
      if (s.until >= now) continue;
      this.shots.delete(k);
      for (const [t, v] of this.tickets) if (v.shot === k) this.tickets.delete(t);
    }
  }

  private writeFile(p: WallPhoto, bytes: Uint8Array): boolean {
    if (!this.dir) return true;
    try {
      mkdirSync(this.dir, { recursive: true });
      const file = join(this.dir, photoWallFile(p));
      writeFileSync(`${file}.tmp`, bytes);
      renameSync(`${file}.tmp`, file);
      return true;
    } catch (e) {
      console.error("[mural-fotos] não deu para gravar a foto:", e);
      return false;
    }
  }

  private deleteFile(p: WallPhoto): void {
    if (!this.dir) return;
    try {
      unlinkSync(join(this.dir, photoWallFile(p)));
    } catch {
      /* já não existia */
    }
  }

  /** Na partida: a lista só fica com fotos que existem no disco, e o disco só com as da lista. */
  private reconcile(photos: WallPhoto[]): WallPhoto[] {
    if (!this.dir) return photos;
    const files = new Set(existsSync(this.dir) ? readdirSync(this.dir) : []);
    const kept = photos.filter((p) => files.has(photoWallFile(p))).slice(-PHOTOWALL_MAX);
    const keep = new Set(kept.map(photoWallFile));
    for (const f of files) {
      if (keep.has(f) || !(PHOTOWALL_FILE_RE.test(f) || f.endsWith(".tmp"))) continue;
      try {
        unlinkSync(join(this.dir, f));
      } catch {
        /* segue */
      }
    }
    if (kept.length !== photos.length) this.host.store.set(KEY, { photos: kept });
    return kept;
  }
}

function validPhoto(p: unknown): p is WallPhoto {
  const x = p as WallPhoto;
  return (
    !!x &&
    typeof x.id === "string" &&
    PHOTOWALL_FILE_RE.test(photoWallFile(x)) &&
    typeof x.at === "number" &&
    (x.type === "jpeg" || x.type === "png") &&
    Number.isFinite(x.w) &&
    Number.isFinite(x.h) &&
    Array.isArray(x.names)
  );
}
