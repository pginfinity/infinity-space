import { mesasKey } from "@infinity/world";
import { Accounts } from "../../auth/accounts.ts";
import { cleanName } from "../../clean.ts";
import type { Store } from "../../store.ts";
import type { MesasAdmin } from "./desks.ts";

/**
 * Quem pode marcar mesas fixas.
 *
 * - Login ligado (AUTH_REQUIRED=true): o papel `admin` da conta, achada pelo e-mail da conexão
 *   (`host.playerEmail`). Sem o e-mail (anfitrião de teste), cai para o nome: se duas contas tiverem
 *   o mesmo nome e uma não for admin, ninguém com esse nome administra (falha fechada).
 * - Login desligado (desenvolvimento): os nomes em MESAS_ADMINS (separados por vírgula; `*` = todos).
 *   O cliente também pode pedir `admin-dev` (gancho de desenvolvimento), aceito só sem login.
 */
export function mesasAdmin(store: Store, env: NodeJS.ProcessEnv = process.env, emailOf?: (id: string) => string | undefined): { admin: MesasAdmin; devAdmin: boolean } {
  const auth = env.AUTH_REQUIRED === "true";
  if (auth) {
    const accounts = new Accounts(store);
    return {
      devAdmin: false,
      admin: (id, name) => {
        const email = emailOf?.(id);
        if (email) return accounts.roleOf(email) === "admin";
        const key = mesasKey(name);
        const same = Object.values(accounts.users()).filter((u) => mesasKey(cleanName(u.name)) === key);
        return same.length > 0 && same.every((u) => accounts.roleOf(u.email) === "admin");
      },
    };
  }
  const list = (env.MESAS_ADMINS ?? "")
    .split(",")
    .map((s) => mesasKey(s))
    .filter(Boolean);
  const all = list.includes("*");
  return { devAdmin: true, admin: (_id, name) => all || list.includes(mesasKey(name)) };
}
