import nodemailer, { type Transporter } from "nodemailer";

/**
 * E-mails de entrada e de convite. Com SMTP_URL (ex.: smtps://usuario:senha@smtp.gmail.com:465)
 * ou SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS, envia de verdade; sem isso (desenvolvimento),
 * mostra o link no console do servidor.
 */

let transporter: Transporter | null | undefined;

function transport(): Transporter | null {
  if (transporter !== undefined) return transporter;
  const url = process.env.SMTP_URL;
  const host = process.env.SMTP_HOST;
  if (url) transporter = nodemailer.createTransport(url);
  else if (host) {
    const port = Number(process.env.SMTP_PORT ?? 587);
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  } else transporter = null;
  return transporter;
}

export function mailConfigured(): boolean {
  return transport() !== null;
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Último e-mail "enviado" sem SMTP (para testes locais). */
export const outbox: Mail[] = [];

export async function sendMail(m: Mail): Promise<void> {
  const t = transport();
  if (!t) {
    outbox.push(m);
    if (outbox.length > 20) outbox.shift();
    console.log(`[login] sem SMTP configurado. E-mail para ${m.to}: ${m.text.split("\n").find((l) => l.startsWith("http")) ?? m.subject}`);
    return;
  }
  await t.sendMail({ from: process.env.MAIL_FROM ?? "Infinity Space <space@ai-infinity.io>", ...m });
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** E-mail simples, legível em qualquer cliente, com o botão de entrar. */
export function linkMail(to: string, link: string, kind: "login" | "invite", by?: string): Mail {
  const subject = kind === "invite" ? "Você foi convidado para o Infinity Space" : "Seu link para entrar no Infinity Space";
  const lead =
    kind === "invite"
      ? `${by ? `${by} convidou você` : "Você foi convidado"} para o escritório virtual da AI Infinity.`
      : "Use o botão abaixo para entrar no escritório. O link vale por 15 minutos e só funciona uma vez.";
  const tail = kind === "invite" ? "O convite vale por 7 dias. Depois disso, peça um link novo na tela de entrada." : "Se não foi você que pediu, pode ignorar este e-mail.";
  const text = `${lead}\n\n${link}\n\n${tail}`;
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#00112A;font-family:Arial,Helvetica,sans-serif;color:#F2F0EF">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:480px;background:#0A2547;border-radius:16px;padding:32px">
<tr><td style="font-size:13px;letter-spacing:2px;font-weight:bold">INFINITY SPACE</td></tr>
<tr><td style="padding-top:20px;font-size:16px;line-height:1.5">${esc(lead)}</td></tr>
<tr><td style="padding-top:24px"><a href="${esc(link)}" style="display:inline-block;background:#EE5C29;color:#F2F0EF;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:12px">Entrar no escritório</a></td></tr>
<tr><td style="padding-top:24px;font-size:12px;line-height:1.5;color:#8A93A3">${esc(tail)}</td></tr>
</table></td></tr></table></body></html>`;
  return { to, subject, text, html };
}
