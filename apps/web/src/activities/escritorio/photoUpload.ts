import { create } from "zustand";
import { PHOTOWALL_API, PHOTOWALL_MAX_BYTES, photoWallFit, type PhotoWallError } from "@infinity/world";
import { toast } from "../../ui/toasts.ts";
import { T } from "./strings.ts";

/**
 * Envio da foto da cabine para o mural da copa. O servidor dá um bilhete (evento "ticket" da cabine)
 * a quem saiu na foto; com ele, a foto vai por HTTP, reduzida aqui para JPEG de até 1280 px.
 * A primeira pessoa do grupo que mandar vale para todos (uma foto por disparo).
 */

export type WallPostStatus = "sending" | "posted" | "group" | "error";

interface WallPostState {
  /** Disparo → bilhete (só desta sessão; nunca salvo). */
  tickets: Record<string, string>;
  /** Disparo → como está o envio. */
  posts: Record<string, { status: WallPostStatus; error?: PhotoWallError | "rede" }>;
}

export const useWallPost = create<WallPostState>(() => ({ tickets: {}, posts: {} }));

export function saveTicket(shot: string, ticket: string): void {
  useWallPost.setState((s) => ({ tickets: { ...s.tickets, [shot]: ticket } }));
}

function setPost(shot: string, status: WallPostStatus, error?: PhotoWallError | "rede"): void {
  useWallPost.setState((s) => ({ posts: { ...s.posts, [shot]: error ? { status, error } : { status } } }));
}

/** Evento "posted" do mural: a foto deste disparo foi para o mural (por você ou por alguém do grupo). */
export function markPosted(shot: string): void {
  const cur = useWallPost.getState().posts[shot]?.status;
  if (cur === "posted" || cur === "sending") return;
  setPost(shot, "group");
  toast(T.photo.wallByGroup);
}

/** Reduz a foto (PNG da cabine) para JPEG com o lado maior até 1280 px. */
async function toJpeg(url: string): Promise<Blob> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const { w, h } = photoWallFit(img.naturalWidth, img.naturalHeight);
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);
  for (const q of [0.86, 0.75, 0.6]) {
    const blob = await new Promise<Blob | null>((ok) => cv.toBlob(ok, "image/jpeg", q));
    if (blob && blob.size <= PHOTOWALL_MAX_BYTES) return blob;
  }
  throw new Error("foto grande demais");
}

/** Põe a foto no mural da copa. O resultado fica em `useWallPost` (e num aviso). */
export async function postToWall(shot: string, pngUrl: string): Promise<void> {
  const ticket = useWallPost.getState().tickets[shot];
  if (!ticket) return;
  const cur = useWallPost.getState().posts[shot]?.status;
  if (cur === "sending" || cur === "posted" || cur === "group") return;
  setPost(shot, "sending");
  try {
    const body = await toJpeg(pngUrl);
    const r = await fetch(PHOTOWALL_API, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "image/jpeg", "X-Bilhete": ticket },
      body,
    });
    if (r.ok) {
      setPost(shot, "posted");
      toast(T.photo.wallDone);
      return;
    }
    const error = ((await r.json().catch(() => ({}))) as { error?: PhotoWallError }).error ?? "mural";
    if (error === "ja-no-mural") {
      setPost(shot, "group");
      return;
    }
    setPost(shot, "error", error);
  } catch (err) {
    console.error("[cabine] não deu para pôr a foto no mural:", err);
    setPost(shot, "error", "rede");
  }
}
