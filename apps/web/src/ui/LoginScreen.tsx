import { useState, type FormEvent } from "react";
import { motion } from "motion/react";
import { ArrowRight, MailCheck } from "lucide-react";
import { loginWithPassword, requestLink, useAuth, type LinkResult, type PasswordResult } from "../net/auth.ts";
import { Logo } from "./Logo.tsx";

type State = "idle" | "sending" | LinkResult | PasswordResult;

const MESSAGES: Partial<Record<State, [string, string]>> = {
  invalid: ["Confira o e-mail digitado.", "text-danger"],
  wrong: ["E-mail ou senha incorretos.", "text-danger"],
  short: ["A senha precisa de pelo menos 8 caracteres.", "text-danger"],
  mismatch: ["As duas senhas não são iguais.", "text-danger"],
  limit: ["Muitas tentativas seguidas. Espere alguns minutos e tente de novo.", "text-warn"],
  offline: ["Não foi possível falar com o servidor. Tente de novo.", "text-danger"],
};

const inputClass =
  "mt-2 w-full rounded-xl border border-offwhite/12 bg-deep/70 px-4 py-3 text-base text-offwhite placeholder:text-slate/70 focus:border-signal focus:outline-none";

/** Entrada com e-mail e senha. Quem ainda não tem senha cria a sua aqui; o link por e-mail continua como alternativa. */
export function LoginScreen() {
  const expired = useAuth((s) => s.expired);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  // Primeiro acesso (ou senha redefinida pelo admin): pede a confirmação e cria a senha.
  const [first, setFirst] = useState(false);
  const [state, setState] = useState<State>("idle");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (state === "sending") return;
    setState("sending");
    const r = await loginWithPassword(email.trim(), password, first ? confirm : undefined);
    if (r === "first") setFirst(true);
    setState(r === "first" ? "idle" : r);
  };

  const askLink = async () => {
    setState("sending");
    setState(await requestLink(email.trim()));
  };

  const reset = () => {
    if (state !== "idle" && state !== "sending") setState("idle");
  };
  const msg = MESSAGES[state];

  return (
    <div className="relative grid h-full place-items-center overflow-y-auto bg-space px-5 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgb(0_183_255/0.14),transparent)]" />
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }} className="relative w-full max-w-sm">
        <Logo size="md" />
        {state === "sent" ? (
          <div className="mt-8 rounded-[var(--radius-panel)] border border-offwhite/10 bg-card/60 p-6">
            <MailCheck className="size-6 text-signal" />
            <h1 className="mt-4 font-display text-base font-medium uppercase tracking-[0.06em]">Confira seu e-mail</h1>
            <p className="mt-2 text-sm leading-relaxed text-offwhite/80">
              Se <strong className="text-offwhite">{email.trim()}</strong> tiver convite, um link de entrada chega em instantes. Abra neste mesmo navegador. O link vale por 15 minutos.
            </p>
            <button type="button" onClick={() => setState("idle")} className="mt-5 text-sm text-slate underline-offset-4 hover:text-offwhite hover:underline">
              Voltar
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-8 rounded-[var(--radius-panel)] border border-offwhite/10 bg-card/60 p-6" noValidate>
            <h1 className="font-display text-base font-medium uppercase tracking-[0.06em]">{first ? "Crie sua senha" : "Entrar no escritório"}</h1>
            <p className="mt-1.5 text-sm text-slate">{first ? "Primeiro acesso: escolha uma senha com pelo menos 8 caracteres." : "Entre com seu e-mail e sua senha."}</p>
            {expired && <p className="mt-4 rounded-xl bg-warn/10 px-3 py-2 text-sm text-warn">O link expirou ou já foi usado. Peça um novo.</p>}
            <label htmlFor="email" className="label-caps mt-5 block">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setFirst(false);
                reset();
              }}
              placeholder="voce@empresa.com"
              aria-invalid={state === "invalid"}
              aria-describedby={msg ? "login-msg" : undefined}
              className={inputClass}
            />
            <label htmlFor="password" className="label-caps mt-4 block">
              {first ? "Nova senha" : "Senha"}
            </label>
            <input
              id="password"
              type="password"
              autoComplete={first ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                reset();
              }}
              aria-invalid={state === "wrong" || state === "short"}
              aria-describedby={msg ? "login-msg" : undefined}
              className={inputClass}
            />
            {first && (
              <>
                <label htmlFor="confirm" className="label-caps mt-4 block">
                  Repita a senha
                </label>
                <input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  autoFocus
                  value={confirm}
                  onChange={(e) => {
                    setConfirm(e.target.value);
                    reset();
                  }}
                  aria-invalid={state === "mismatch"}
                  aria-describedby={msg ? "login-msg" : undefined}
                  className={inputClass}
                />
              </>
            )}
            {msg && (
              <p id="login-msg" role="alert" className={`mt-2 text-sm ${msg[1]}`}>
                {msg[0]}
              </p>
            )}
            <button
              type="submit"
              disabled={state === "sending" || !email.trim() || !password || (first && !confirm)}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-orange px-4 py-3 font-semibold text-offwhite transition hover:brightness-110 disabled:opacity-50"
            >
              {state === "sending" ? "Entrando…" : first ? "Criar senha e entrar" : "Entrar"}
              <ArrowRight className="size-4" />
            </button>
            <button
              type="button"
              disabled={state === "sending" || !email.trim()}
              onClick={() => void askLink()}
              className="mt-3 w-full text-sm text-slate underline-offset-4 hover:text-offwhite hover:underline disabled:opacity-50 disabled:hover:no-underline"
            >
              Receber link de entrada
            </button>
            <p className="mt-4 text-xs leading-relaxed text-slate">Ainda não tem acesso? Peça a quem administra o Infinity Space.</p>
          </form>
        )}
      </motion.div>
    </div>
  );
}
