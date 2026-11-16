import { useState, type FormEvent } from "react";
import { motion } from "motion/react";
import { ArrowRight, MailCheck } from "lucide-react";
import { requestLink, useAuth } from "../net/auth.ts";
import { Logo } from "./Logo.tsx";

/** Entrada com e-mail: o servidor manda um link mágico (sem senha). Só entra quem foi convidado. */
export function LoginScreen() {
  const expired = useAuth((s) => s.expired);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "invalid" | "limit" | "offline">("idle");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (state === "sending") return;
    setState("sending");
    setState(await requestLink(email.trim()));
  };

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
              Usar outro e-mail
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-8 rounded-[var(--radius-panel)] border border-offwhite/10 bg-card/60 p-6" noValidate>
            <h1 className="font-display text-base font-medium uppercase tracking-[0.06em]">Entrar no escritório</h1>
            <p className="mt-1.5 text-sm text-slate">Sem senha: enviamos um link para o seu e-mail.</p>
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
                if (state !== "idle" && state !== "sending") setState("idle");
              }}
              placeholder="voce@empresa.com"
              aria-invalid={state === "invalid"}
              aria-describedby={state !== "idle" && state !== "sending" ? "login-msg" : undefined}
              className="mt-2 w-full rounded-xl border border-offwhite/12 bg-deep/70 px-4 py-3 text-base text-offwhite placeholder:text-slate/70 focus:border-signal focus:outline-none"
            />
            {state === "invalid" && (
              <p id="login-msg" className="mt-2 text-sm text-danger">
                Confira o e-mail digitado.
              </p>
            )}
            {state === "limit" && (
              <p id="login-msg" className="mt-2 text-sm text-warn">
                Muitos pedidos seguidos. Espere alguns minutos e tente de novo.
              </p>
            )}
            {state === "offline" && (
              <p id="login-msg" className="mt-2 text-sm text-danger">
                Não foi possível falar com o servidor. Tente de novo.
              </p>
            )}
            <button
              type="submit"
              disabled={state === "sending" || !email.trim()}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-orange px-4 py-3 font-semibold text-offwhite transition hover:brightness-110 disabled:opacity-50"
            >
              {state === "sending" ? "Enviando…" : "Receber link de entrada"}
              <ArrowRight className="size-4" />
            </button>
            <p className="mt-4 text-xs leading-relaxed text-slate">Ainda não tem acesso? Peça um convite a quem administra o Infinity Space.</p>
          </form>
        )}
      </motion.div>
    </div>
  );
}
