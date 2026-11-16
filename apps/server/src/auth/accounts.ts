import { createHash, randomBytes } from "node:crypto";
import type { AvatarLook } from "@infinity/world";
import type { Store } from "../store.ts";

/**
 * Contas do escritório: quem foi convidado, quem já entrou, links de entrada e sessões.
 * Links e sessões ficam guardados só como hash: quem lê os arquivos do servidor não consegue entrar.
 * Nada de registro de horário de entrada ou de uso: presença, não vigilância.
 */

export type Role = "admin" | "member";

export interface User {
  email: string;
  name: string;
  role: Role;
  look?: AvatarLook;
  createdAt: number;
}

export interface Invite {
  email: string;
  role: Role;
  by: string;
  at: number;
}

interface Session {
  email: string;
  exp: number;
}

const USERS = "auth/usuarios";
const INVITES = "auth/convites";
const SESSIONS = "auth/sessoes";

/** Link do e-mail de login vale 15 minutos; o do convite, 7 dias. Os dois servem uma vez só. */
export const LINK_MS = 15 * 60 * 1000;
export const INVITE_LINK_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_MS = Number(process.env.SESSION_DAYS ?? 30) * 24 * 60 * 60 * 1000;

const EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

export function cleanEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const e = v.trim().toLowerCase();
  return e.length <= 254 && EMAIL.test(e) ? e : null;
}

const hash = (s: string) => createHash("sha256").update(s).digest("base64url");
const secret = () => randomBytes(32).toString("base64url");

function listEnv(name: string): string[] {
  return (process.env[name] ?? "")
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export class Accounts {
  /** Links de entrada pendentes (em memória: reiniciar o servidor invalida, o que é seguro). */
  private readonly links = new Map<string, { email: string; exp: number }>();

  constructor(private readonly store: Store) {}

  // ---- quem pode entrar ----

  private admins(): string[] {
    return listEnv("ADMIN_EMAILS");
  }

  /** Pode pedir link de entrada? (já tem conta, foi convidado, é admin ou é de um domínio liberado) */
  canEnter(email: string): boolean {
    if (this.user(email) || this.invites()[email] || this.admins().includes(email)) return true;
    const domain = email.split("@")[1] ?? "";
    return listEnv("ALLOWED_DOMAINS").includes(domain);
  }

  user(email: string): User | undefined {
    return this.users()[email];
  }

  users(): Record<string, User> {
    return this.store.get<Record<string, User>>(USERS, {});
  }

  invites(): Record<string, Invite> {
    return this.store.get<Record<string, Invite>>(INVITES, {});
  }

  /** Papel efetivo: admins da configuração sempre são admin. */
  roleOf(email: string): Role {
    if (this.admins().includes(email)) return "admin";
    return this.user(email)?.role ?? this.invites()[email]?.role ?? "member";
  }

  invite(email: string, by: string, role: Role = "member"): void {
    if (this.user(email)) return;
    this.store.set(INVITES, { ...this.invites(), [email]: { email, role, by, at: Date.now() } });
  }

  /** Tira a pessoa do escritório: apaga conta, convite e sessões. */
  remove(email: string): void {
    const users = { ...this.users() };
    delete users[email];
    this.store.set(USERS, users);
    const invites = { ...this.invites() };
    delete invites[email];
    this.store.set(INVITES, invites);
    const sessions = Object.fromEntries(Object.entries(this.sessions()).filter(([, s]) => s.email !== email));
    this.store.set(SESSIONS, sessions);
  }

  updateProfile(email: string, patch: { name?: string; look?: AvatarLook }): User | undefined {
    const u = this.user(email);
    if (!u) return undefined;
    const next = { ...u, ...patch };
    this.store.set(USERS, { ...this.users(), [email]: next });
    return next;
  }

  // ---- links de entrada ----

  /** Cria um link de uso único. Devolve o segredo (vai no e-mail; aqui fica só o hash). */
  createLink(email: string, ms = LINK_MS): string {
    const now = Date.now();
    for (const [k, l] of this.links) if (l.exp < now) this.links.delete(k);
    const token = secret();
    this.links.set(hash(token), { email, exp: now + ms });
    return token;
  }

  /** Usa o link: devolve o e-mail se é válido (e o invalida). Cria a conta na primeira entrada. */
  consumeLink(token: string): string | null {
    const k = hash(token);
    const l = this.links.get(k);
    this.links.delete(k);
    if (!l || l.exp < Date.now() || !this.canEnter(l.email)) return null;
    if (!this.user(l.email)) {
      const inv = this.invites()[l.email];
      const name = l.email.split("@")[0]!.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 32);
      this.store.set(USERS, { ...this.users(), [l.email]: { email: l.email, name, role: inv?.role ?? "member", createdAt: Date.now() } });
      const invites = { ...this.invites() };
      delete invites[l.email];
      this.store.set(INVITES, invites);
    }
    return l.email;
  }

  // ---- sessões ----

  private sessions(): Record<string, Session> {
    return this.store.get<Record<string, Session>>(SESSIONS, {});
  }

  createSession(email: string): string {
    const now = Date.now();
    const id = secret();
    const live = Object.fromEntries(Object.entries(this.sessions()).filter(([, s]) => s.exp > now));
    this.store.set(SESSIONS, { ...live, [hash(id)]: { email, exp: now + SESSION_MS } });
    return id;
  }

  /** E-mail da sessão (ou null se não existe, expirou ou a pessoa foi removida). */
  sessionEmail(id: string | undefined): string | null {
    if (!id) return null;
    const s = this.sessions()[hash(id)];
    if (!s || s.exp < Date.now() || !this.user(s.email)) return null;
    return s.email;
  }

  endSession(id: string | undefined): void {
    if (!id) return;
    const sessions = { ...this.sessions() };
    delete sessions[hash(id)];
    this.store.set(SESSIONS, sessions);
  }
}
