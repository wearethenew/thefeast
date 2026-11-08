import "server-only";
import nodemailer from "nodemailer";

// Feast email. Preferred: the Feast's own Gmail / Google Workspace mailbox over SMTP:
//   EMAIL_USER      the Feast mailbox address
//   EMAIL_PASSWORD  a Google *app password* for that account (Google account → Security →
//                   2-Step Verification → App passwords), not the normal password
//   EMAIL_HOST      optional, defaults to smtp.gmail.com (mail.google.com is the web app, not SMTP)
// Fallback: Resend (RESEND_API_KEY, INVITE_FROM).

export function emailConfigured() {
  return !!((process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) || process.env.RESEND_API_KEY);
}

/** The mail server's port that works from here (587 first; 465 where 587 is blocked). */
let port: 587 | 465 | null = null;
const transports = new Map<number, nodemailer.Transporter>();

function transportOn(p: 587 | 465, host: string, user: string, pass: string) {
  let t = transports.get(p);
  if (!t) {
    t = nodemailer.createTransport({
      host,
      port: p,
      // 587 upgrades to TLS (STARTTLS); 465 is TLS from the start
      secure: p === 465,
      requireTLS: p === 587,
      auth: { user, pass },
      connectionTimeout: 10000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    });
    transports.set(p, t);
  }
  return t;
}

/** Couldn't reach the mail server at all (as opposed to it saying no). */
const unreachable = (e: unknown) => {
  const code = (e as { code?: string })?.code;
  return code === "ETIMEDOUT" || code === "ECONNECTION" || code === "ESOCKET" || code === "ECONNREFUSED";
};

/** An image shown inside the email body (<img src="cid:ID">), e.g. the check-in QR code. */
export type InlineImage = { cid: string; filename: string; png: Buffer };

export async function sendEmail(to: string, subject: string, html: string, text: string, images: InlineImage[] = []) {
  const user = process.env.EMAIL_USER?.trim();
  const pass = process.env.EMAIL_PASSWORD?.trim();
  if (user && pass) {
    const given = process.env.EMAIL_HOST?.trim();
    const host = !given || given === "mail.google.com" || given === "gmail.com" ? "smtp.gmail.com" : given;
    const mail = {
      from: `"The Feast 2026 · The New Church" <${user}>`,
      to,
      subject,
      text,
      html,
      attachments: images.map((i) => ({ filename: i.filename, content: i.png, cid: i.cid, contentType: "image/png" })),
    };
    // port 587 (STARTTLS) first; some networks block it, and then 465 (TLS), kept for next time
    const order: (587 | 465)[] = port ? [port, port === 587 ? 465 : 587] : [587, 465];
    let last: unknown;
    for (const p of order) {
      try {
        await transportOn(p, host, user, pass).sendMail(mail);
        port = p;
        return true;
      } catch (e) {
        last = e;
        if (!unreachable(e)) throw e;
      }
    }
    throw last;
  }
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.INVITE_FROM ?? "The Feast 2026 <onboarding@resend.dev>",
      to: [to],
      subject,
      html,
      text,
      attachments: images.map((i) => ({ filename: i.filename, content: i.png.toString("base64"), content_id: i.cid })),
    }),
  });
  if (!res.ok) throw new Error(`email: ${res.status} ${await res.text()}`);
  return true;
}
