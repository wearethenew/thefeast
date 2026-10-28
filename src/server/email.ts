import "server-only";
import nodemailer from "nodemailer";

// Feast email. Preferred: the Feast's own Gmail / Google Workspace mailbox over SMTP:
//   EMAIL_USER      thefeast@wearethenew.org
//   EMAIL_PASSWORD  a Google *app password* for that account (Google account → Security →
//                   2-Step Verification → App passwords), not the normal password
//   EMAIL_HOST      optional, defaults to smtp.gmail.com (mail.google.com is the web app, not SMTP)
// Fallback: Resend (RESEND_API_KEY, INVITE_FROM).

export function emailConfigured() {
  return !!((process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) || process.env.RESEND_API_KEY);
}

let transport: nodemailer.Transporter | null = null;

/** An image shown inside the email body (<img src="cid:ID">), e.g. the check-in QR code. */
export type InlineImage = { cid: string; filename: string; png: Buffer };

export async function sendEmail(to: string, subject: string, html: string, text: string, images: InlineImage[] = []) {
  const user = process.env.EMAIL_USER?.trim();
  const pass = process.env.EMAIL_PASSWORD?.trim();
  if (user && pass) {
    const given = process.env.EMAIL_HOST?.trim();
    const host = !given || given === "mail.google.com" || given === "gmail.com" ? "smtp.gmail.com" : given;
    // port 587 with STARTTLS: 465 is blocked on many networks; and never more than 15 s waiting on it
    transport ??= nodemailer.createTransport({
      host,
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user, pass },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    });
    await transport.sendMail({
      from: `"The Feast 2026 · The New Church" <${user}>`,
      to,
      subject,
      text,
      html,
      attachments: images.map((i) => ({ filename: i.filename, content: i.png, cid: i.cid, contentType: "image/png" })),
    });
    return true;
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
