import { after } from "next/server";
import { BREAKOUTS, breakoutTitle } from "@/game/data/breakouts";
import { pickedDays } from "@/server/days";
import { emailConfigured, sendEmail } from "@/server/email";
import { fill, findOne, rowsOf, save } from "@/server/storage";
import { bad, clean } from "@/server/validate";

// Saturday's breakout sessions, booked with the attendant in the Main Hall. Only onsite registrants
// coming on Saturday can book (checked here against their registration, by ticket ID); one place
// each, while a session has room. Every answer is kept: a "no" too.
//   { ticket, action: "status" }            → eligible?, already answered?, each session's places
//   { ticket, action: "no" }                → "not now", kept
//   { ticket, action: "join", session }     → a place, numbered: among all breakout registrations
//                                             (number) and within the session (session_number)

const SITE = "thefeast.wearethenew.org";
const norm = (v: unknown) => String(v ?? "").replace(/\s+/g, "").toUpperCase();

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return bad("Invalid request");
  const raw = clean(body.ticket, 40).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const m = raw.match(/^TF26([A-Z0-9]{4})([A-Z0-9]{4})$/);
  if (!m) return bad("We couldn't read your ticket ID");
  const ticket = `TF26-${m[1]}-${m[2]}`;
  const reg = await findOne("registrations", "ticket_id", ticket);
  if (!reg) return bad("We couldn't find your registration", 404);
  // onsite, and with us on Saturday
  const eligible = String(reg.attendance) === "onsite" && pickedDays(reg.days).some((d) => d.id === "sat");

  const rows = await rowsOf("breakouts");
  const state = () => {
    const placed = rows.filter((r) => r.status === "registered");
    const mine = rows.filter((r) => norm(r.ticket_id) === ticket);
    const booked = mine.find((r) => r.status === "registered");
    return {
      ok: true,
      eligible,
      answered: booked ? "yes" : mine.some((r) => r.answer === "no") ? "no" : null,
      booked: booked ? { session: String(booked.session), number: Number(booked.number) || null, sessionNumber: Number(booked.session_number) || null } : null,
      sessions: BREAKOUTS.map((b) => ({ id: b.id, cap: b.cap, taken: placed.filter((r) => r.session === b.id).length })),
    };
  };
  const action = String(body.action ?? "status");
  if (action === "status" || !eligible) return Response.json(state());

  const who = {
    ticket_id: ticket,
    first_name: String(reg.first_name ?? ""),
    last_name: String(reg.last_name ?? ""),
    email: String(reg.email ?? ""),
    phone: String(reg.phone ?? ""),
  };
  const now = state();
  if (now.booked) return Response.json(now);

  if (action === "no") {
    await save("breakouts", { ...who, answer: "no", status: "declined" });
    rows.push({ ...who, answer: "no", status: "declined" });
    return Response.json(state());
  }

  if (action !== "join") return bad("Invalid request");
  const b = BREAKOUTS.find((x) => x.id === body.session);
  if (!b) return bad("Pick a breakout session");
  const taken = now.sessions.find((s) => s.id === b.id)!.taken;
  if (taken >= b.cap) return bad(`${b.name} is full. Please pick another session.`, 409);
  // numbered in the order places are taken: what the sheet says, counted again just after saving
  // (two people booking at the same moment can't end up with the same number)
  let number = rows.filter((r) => r.status === "registered").length + 1;
  let sessionNumber = taken + 1;
  const at = await save("breakouts", { ...who, answer: "yes", session: b.id, status: "registered", number, session_number: sessionNumber });
  if (at) {
    const fresh = await rowsOf("breakouts");
    const upTo = fresh.slice(0, at - 1).filter((r) => r.status === "registered");
    const n = upTo.length;
    const sn = upTo.filter((r) => r.session === b.id).length;
    if (n && sn && sn > b.cap) {
      // the last place went to someone a moment earlier
      await fill("breakouts", at, { status: "full", number: "", session_number: "" });
      return bad(`${b.name} just filled up. Please pick another session.`, 409);
    }
    if (n && (n !== number || sn !== sessionNumber)) {
      number = n;
      sessionNumber = sn;
      await fill("breakouts", at, { number, session_number: sessionNumber });
    }
  }

  if (emailConfigured() && who.email) {
    const mail = confirmation(who.first_name || "friend", breakoutTitle(b));
    after(() => sendEmail(who.email, mail.subject, mail.html, mail.text).catch((e) => console.error("[breakout] email failed", e)));
  }
  return Response.json({ ok: true, eligible, answered: "yes", booked: { session: b.id, number, sessionNumber }, sessions: now.sessions.map((s) => (s.id === b.id ? { ...s, taken: s.taken + 1 } : s)) });
}

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function confirmation(firstName: string, session: string) {
  const subject = `Your ${session} breakout session is confirmed 🔥`;
  const text = `Hello ${firstName},

Your registration for ${session} break-out session at The Feast 2026 is confirmed!

Get ready for a powerful experience.

Encourage others to register here: ${SITE}

The fire continues.
The torch is yours to carry.

With love,
The New Church.`;
  // in the registration email's style: white, #242424 text, mono eyebrow and a yellow rule
  const mono = `font-family:'Geist Mono',ui-monospace,'Courier New',monospace;letter-spacing:1.5px;text-transform:uppercase`;
  const html = `<div style="font-family:Manrope,Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#242424;line-height:1.5;font-size:15px">
  <div style="padding:8px 0 16px;border-bottom:2px solid #ffc634;margin-bottom:24px">
    <div style="${mono};font-size:11px;color:#656565">The Feast 2026 · Breakout sessions</div>
  </div>
  <p style="margin:0 0 14px">Hello ${esc(firstName)},</p>
  <p style="margin:0 0 14px">Your registration for <b>${esc(session)}</b> break-out session at The Feast 2026 is confirmed!</p>
  <p style="margin:0 0 14px">Get ready for a powerful experience.</p>
  <p style="margin:0 0 14px">Encourage others to register here: <a href="https://${SITE}" style="color:#242424">${SITE}</a></p>
  <p style="margin:0 0 14px">The fire continues.<br>The torch is yours to carry.</p>
  <p style="margin:0">With love,<br>The New Church.</p>
</div>`;
  return { subject, text, html };
}
