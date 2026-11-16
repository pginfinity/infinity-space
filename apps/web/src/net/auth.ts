import { create } from "zustand";
import type { AvatarLook } from "@infinity/world";
import { useApp } from "../state/store.ts";

/**
 * Conta da pessoa (login por convite com link mágico). Em desenvolvimento o servidor
 * avisa que o login está desligado e o app segue como antes (nome livre, atalho ?nome=).
 */

export interface Me {
  email: string;
  name: string;
  look: AvatarLook | null;
  role: "admin" | "member";
}

interface AuthState {
  status: "checking" | "off" | "anon" | "in";
  me: Me | null;
  /** O link usado expirou ou já tinha sido usado. */
  expired: boolean;
}

export const useAuth = create<AuthState>(() => ({ status: "checking", me: null, expired: false }));

async function api<T>(path: string, init?: RequestInit): Promise<{ status: number; data: T | null }> {
  try {
    const r = await fetch(`/api${path}`, { credentials: "same-origin", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
    const data = (await r.json().catch(() => null)) as T | null;
    return { status: r.status, data };
  } catch {
    return { status: 0, data: null };
  }
}

/** Descobre se o login está ligado e quem está entrando. */
/** Lido uma vez ao carregar (o efeito pode rodar duas vezes no StrictMode). */
const EXPIRED = new URLSearchParams(location.search).get("login") === "expirado";
if (EXPIRED) history.replaceState(null, "", location.pathname);

export async function loadAuth(): Promise<void> {
  const expired = EXPIRED;
  const cfg = await api<{ auth: boolean }>("/config");
  if (!cfg.data?.auth) {
    useAuth.setState({ status: "off", me: null, expired: false });
    return;
  }
  const me = await api<Me>("/me");
  if (me.status === 200 && me.data) {
    applyMe(me.data);
    useAuth.setState({ status: "in", me: me.data, expired: false });
  } else {
    useAuth.setState({ status: "anon", me: null, expired });
  }
}

/** Nome e visual salvos na conta passam a valer no app. */
function applyMe(me: Me): void {
  useApp.getState().setProfile(me.look ? { name: me.name, look: me.look } : { name: me.name });
}

export type LinkResult = "sent" | "invalid" | "limit" | "offline";

export async function requestLink(email: string): Promise<LinkResult> {
  const r = await api("/auth/link", { method: "POST", body: JSON.stringify({ email }) });
  if (r.status === 200) return "sent";
  if (r.status === 400) return "invalid";
  if (r.status === 429) return "limit";
  return "offline";
}

/** Guarda nome e visual na conta (ao entrar no escritório). */
export async function saveProfile(name: string, look: AvatarLook): Promise<void> {
  if (useAuth.getState().status !== "in") return;
  const r = await api<Me>("/me", { method: "PATCH", body: JSON.stringify({ name, look }) });
  if (r.status === 200 && r.data) useAuth.setState({ me: r.data });
  else if (r.status === 401) useAuth.setState({ status: "anon", me: null });
}

export async function logout(): Promise<void> {
  await api("/auth/sair", { method: "POST" });
  useApp.getState().leave();
  useAuth.setState({ status: "anon", me: null, expired: false });
}

/** A conexão foi recusada ou a pessoa foi removida: confere a sessão e volta ao login se precisar. */
export async function recheckSession(): Promise<boolean> {
  if (useAuth.getState().status !== "in") return true;
  const me = await api<Me>("/me");
  if (me.status === 401) {
    useApp.getState().leave();
    useAuth.setState({ status: "anon", me: null, expired: false });
    return false;
  }
  return true;
}

// ---- administração ----

export interface People {
  users: { email: string; name: string; role: "admin" | "member" }[];
  invites: { email: string; role: "admin" | "member"; at: number }[];
  mail: boolean;
}

export async function listPeople(): Promise<People | null> {
  return (await api<People>("/admin/pessoas")).data;
}

export async function invite(emails: string[], role: "admin" | "member"): Promise<string[]> {
  const r = await api<{ invited: string[] }>("/admin/convites", { method: "POST", body: JSON.stringify({ emails, role }) });
  return r.data?.invited ?? [];
}

export async function removePerson(email: string): Promise<boolean> {
  return (await api(`/admin/pessoas/${encodeURIComponent(email)}`, { method: "DELETE" })).status === 200;
}
