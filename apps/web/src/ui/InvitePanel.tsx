import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { KeyRound, Send, Trash2, UserPlus, X } from "lucide-react";
import { createUser, invite, listPeople, removePerson, resetPassword, useAuth, type People } from "../net/auth.ts";

/** Administração de acesso: criar usuários, redefinir senha, convidar por e-mail e remover pessoas. Só para admins. */
export function InvitePanel({ onClose }: { onClose: () => void }) {
  const me = useAuth((s) => s.me);
  const [people, setPeople] = useState<People | null>(null);
  const [text, setText] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<"member" | "admin">("member");
  const [created, setCreated] = useState<string | null>(null);

  const refresh = () => void listPeople().then(setPeople);
  // Atualiza a lista enquanto o painel está aberto (quem aceita o convite passa para "No escritório").
  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 4000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const emails = text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  const send = async () => {
    setSending(true);
    const invited = await invite(emails, role);
    setSending(false);
    setText("");
    setDone(invited.length === 0 ? "Nenhum convite novo (e-mails inválidos ou que já têm conta)." : invited.length === 1 ? `Convite enviado para ${invited[0]}.` : `${invited.length} convites enviados.`);
    refresh();
  };

  const create = async () => {
    const r = await createUser(newEmail.trim(), newName.trim(), newRole);
    setCreated(r === "ok" ? `Usuário criado. ${newEmail.trim()} define a senha no primeiro acesso.` : r === "exists" ? "Esse e-mail já tem conta." : "Confira o e-mail digitado.");
    if (r === "ok") {
      setNewEmail("");
      setNewName("");
      setNewRole("member");
    }
    refresh();
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-auto fixed inset-0 z-40 grid place-items-center bg-deep/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-label="Usuários" className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-[var(--radius-panel)] border border-offwhite/10 bg-space shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-offwhite/8 px-5 py-4">
          <div>
            <h2 className="font-display text-sm font-medium uppercase tracking-[0.1em]">Usuários</h2>
            <p className="mt-0.5 text-xs text-slate">Crie contas, redefina senhas ou convide por e-mail.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate hover:bg-offwhite/8 hover:text-offwhite" aria-label="Fechar (Esc)">
            <X className="size-4" />
          </button>
        </header>
        <div className="space-y-4 overflow-y-auto px-5 py-5">
          <section className="space-y-2">
            <h3 className="label-caps">Criar usuário</h3>
            <input value={newEmail} onChange={(e) => { setNewEmail(e.target.value); setCreated(null); }} type="email" placeholder="E-mail" aria-label="E-mail do novo usuário" className="w-full rounded-xl border border-offwhite/12 bg-deep/70 px-3 py-2 text-sm text-offwhite placeholder:text-slate/60 focus:border-signal focus:outline-none" />
            <input value={newName} onChange={(e) => { setNewName(e.target.value); setCreated(null); }} placeholder="Nome (opcional)" aria-label="Nome do novo usuário" maxLength={32} className="w-full rounded-xl border border-offwhite/12 bg-deep/70 px-3 py-2 text-sm text-offwhite placeholder:text-slate/60 focus:border-signal focus:outline-none" />
            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-xs text-offwhite/85">
                <input type="checkbox" checked={newRole === "admin"} onChange={(e) => setNewRole(e.target.checked ? "admin" : "member")} className="size-3.5 accent-[var(--color-signal)]" />
                Administrador
              </label>
              <button type="button" disabled={!newEmail.trim()} onClick={() => void create()} className="flex items-center gap-2 rounded-xl bg-orange px-4 py-2 text-sm font-semibold text-offwhite hover:brightness-110 disabled:opacity-50">
                <UserPlus className="size-4" />
                Criar
              </button>
            </div>
            {created && (
              <p role="status" className="text-xs text-offwhite/85">
                {created}
              </p>
            )}
          </section>

          <h3 className="label-caps border-t border-offwhite/8 pt-4">Convidar por e-mail</h3>
          {people && !people.mail && <p className="rounded-xl bg-warn/10 px-3 py-2 text-xs leading-relaxed text-warn">O envio de e-mail ainda não foi configurado no servidor. Os links aparecem no console do servidor até lá.</p>}
          <label className="block">
            <span className="label-caps">E-mails</span>
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setDone(null);
              }}
              rows={3}
              placeholder={"ana@empresa.com\nbruno@empresa.com"}
              className="mt-2 w-full resize-none rounded-xl border border-offwhite/12 bg-deep/70 px-3 py-2 text-sm text-offwhite placeholder:text-slate/60 focus:border-signal focus:outline-none"
            />
          </label>
          <div className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs text-offwhite/85">
              <input type="checkbox" checked={role === "admin"} onChange={(e) => setRole(e.target.checked ? "admin" : "member")} className="size-3.5 accent-[var(--color-signal)]" />
              Também pode convidar e remover pessoas
            </label>
            <button type="button" disabled={!emails.length || sending} onClick={() => void send()} className="flex items-center gap-2 rounded-xl bg-orange px-4 py-2 text-sm font-semibold text-offwhite hover:brightness-110 disabled:opacity-50">
              <Send className="size-4" />
              {sending ? "Enviando…" : emails.length > 1 ? `Convidar ${emails.length}` : "Convidar"}
            </button>
          </div>
          {done && (
            <p role="status" className="text-xs text-ok">
              {done}
            </p>
          )}

          <section>
            <h3 className="label-caps">No escritório</h3>
            <ul className="mt-2 divide-y divide-offwhite/6">
              {people?.users.map((u) => (
                <li key={u.email} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{u.name}</p>
                    <p className="truncate text-xs text-slate">
                      {u.email}
                      {u.role === "admin" && " · admin"}
                      {!u.password && " · sem senha"}
                    </p>
                  </div>
                  {u.password && (
                    <button type="button" onClick={() => void resetPassword(u.email).then(refresh)} className="rounded-lg p-1.5 text-slate hover:bg-offwhite/8 hover:text-offwhite" aria-label={`Redefinir a senha de ${u.name}`} title="Redefinir senha (a pessoa cria outra no próximo acesso)">
                      <KeyRound className="size-4" />
                    </button>
                  )}
                  {u.email !== me?.email &&
                    (confirm === u.email ? (
                      <span className="flex items-center gap-1">
                        <button type="button" onClick={() => setConfirm(null)} className="rounded-lg px-2 py-1 text-xs text-slate hover:text-offwhite">
                          Cancelar
                        </button>
                        <button type="button" onClick={() => void removePerson(u.email).then(refresh).finally(() => setConfirm(null))} className="rounded-lg bg-danger/20 px-2 py-1 text-xs font-medium text-danger hover:bg-danger/30">
                          Remover
                        </button>
                      </span>
                    ) : (
                      <button type="button" onClick={() => setConfirm(u.email)} className="rounded-lg p-1.5 text-slate hover:bg-offwhite/8 hover:text-danger" aria-label={`Remover ${u.name}`}>
                        <Trash2 className="size-4" />
                      </button>
                    ))}
                </li>
              ))}
            </ul>
          </section>
          {!!people?.invites.length && (
            <section>
              <h3 className="label-caps">Convites pendentes</h3>
              <ul className="mt-2 divide-y divide-offwhite/6">
                {people.invites.map((i) => (
                  <li key={i.email} className="flex items-center gap-3 py-2">
                    <p className="min-w-0 flex-1 truncate text-sm text-offwhite/85">{i.email}</p>
                    <button type="button" onClick={() => void removePerson(i.email).then(refresh)} className="rounded-lg p-1.5 text-slate hover:bg-offwhite/8 hover:text-danger" aria-label={`Cancelar convite de ${i.email}`}>
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </motion.div>
  );
}
