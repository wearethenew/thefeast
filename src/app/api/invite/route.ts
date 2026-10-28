import { randomBytes } from "node:crypto";
import { emailConfigured, sendEmail } from "@/server/email";
import { save } from "@/server/storage";
import { bad, clean, isEmail } from "@/server/validate";

// "Bring a friend": emails your friend an invite to The Feast with a link that opens the
// journey already set to their pickup address, riding with you.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return bad("Invalid request");
  const from = clean(body.from, 80);
  const friend = clean(body.friend, 80);
  const email = clean(body.email, 120);
  const pickup = body.pickup && typeof body.pickup === "object" ? { label: clean(body.pickup.label, 160), lat: Number(body.pickup.lat), lon: Number(body.pickup.lon) } : null;
  if (from.length < 2 || friend.length < 2) return bad("Add both names");
  if (!isEmail(email)) return bad("That email doesn't look right");
  if (pickup && (!Number.isFinite(pickup.lat) || !Number.isFinite(pickup.lon))) return bad("Pick the address from the list");

  const id = randomBytes(6).toString("hex");
  const payload = Buffer.from(JSON.stringify({ id, from, friend, pickup })).toString("base64url");
  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  const link = `${origin}/?invite=${payload}`;
  await save("invites", { id, from_name: from, friend_name: friend, friend_email: email, pickup_label: pickup?.label ?? null, pickup_lat: pickup?.lat ?? null, pickup_lon: pickup?.lon ?? null });

  const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  const subject = `${from} is bringing you to The Feast 2026 🔥`;
  const text = `Hi ${friend},\n\n${from} has invited you to The Feast 2026 — THE TORCH, 11–13 December at The Fusion Centre, 60A Surulere Industrial Avenue, Ogba, Lagos.\n\n${pickup ? `You'll be picked up from ${pickup.label} and ride together.\n\n` : ""}Light your torch and join the journey: ${link}\n\nThe New Church`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;background:#06134d;color:#fff;padding:28px;border-radius:16px">
    <div style="letter-spacing:6px;font-size:12px;opacity:.8">THE FEAST 2026</div>
    <div style="font-size:44px;font-weight:900;color:#f6c35a;line-height:1">THE TORCH</div>
    <p style="font-size:16px">Hi ${esc(friend)},</p>
    <p style="font-size:16px"><b>${esc(from)}</b> has invited you to <b>The Feast 2026</b>, <b>11–13 December</b> at The Fusion Centre, 60A Surulere Industrial Avenue, Ogba, Lagos.</p>
    ${pickup ? `<p style="font-size:15px">🚐 You'll be picked up from <b>${esc(pickup.label)}</b> and ride together.</p>` : ""}
    <p><a href="${link}" style="display:inline-block;background:#f6c35a;color:#1b1030;padding:14px 22px;border-radius:999px;font-weight:800;text-decoration:none">Light your torch →</a></p>
    <p style="font-size:12px;opacity:.7">The New Church · wearethenew.org</p></div>`;

  let sent = false;
  if (emailConfigured()) sent = await sendEmail(email, subject, html, text);
  // without an email service the browser opens the visitor's own mail app with this message
  const mailto = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
  return Response.json({ ok: true, sent, link, mailto: sent ? null : mailto });
}
