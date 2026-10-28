import { randomInt } from "crypto";
import QRCode from "qrcode";
import { after } from "next/server";
import { emailConfigured, sendEmail } from "@/server/email";
import { column, save } from "@/server/storage";
import { bad, clean, isEmail } from "@/server/validate";
import { daysFull, daysPass, pickedDays } from "@/server/days";

const SITE = "thefeast.wearethenew.org";

/** FIRSTNAME + ME + a number: 1123 first, then the next free number for a shared first name. */
async function referralCode(firstName: string) {
  const stem = (firstName.toUpperCase().replace(/[^A-Z]/g, "") || "TORCH") + "ME";
  const taken = new Set((await column("registrations", "referral_code")).map((c) => c.toUpperCase()));
  for (let n = 1123; ; n++) if (!taken.has(stem + n)) return stem + n;
}

/** The check-in pass: TF26-XXXX-XXXX (no 0/O/1/I to misread), unique, good for all three days. */
async function ticketId() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const taken = new Set(await column("registrations", "ticket_id"));
  for (;;) {
    let id = "TF26-";
    for (let i = 0; i < 8; i++) id += (i === 4 ? "-" : "") + abc[randomInt(abc.length)];
    if (!taken.has(id)) return id;
  }
}

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function confirmation(firstName: string, code: string, ticket: string, plan: string, passDays: string, online: boolean) {
  const gate = online
    ? "You're joining online. If you decide to come onsite, show this QR code at the gate."
    : `Show this QR code at the gate (${passDays}). One code works for all your days.`;
  const subject = `${firstName}, You've Got Your Torch! 🔥`;
  const text = `Hello ${firstName},

You've got your torch! Your registration for The Feast 2026: The Torch is confirmed.
${plan}

Your check-in pass: ${ticket}
${gate} (11th to 13th December 2026, The Fusion Centre, Ogba, Lagos)

Get ready for a powerful experience of faith, community, creativity and transformation as we gather to encounter God and carry the fire forward.

Your referral ID, to pass the torch to your friends and family: ${code}
Encourage them to register here: ${SITE}

The fire continues.
The torch is yours to carry.

With love,
The New Church.`;
  // plain and clean, in The New's style: white, #242424 text, a serif headline in caps, mono
  // eyebrows and yellow rules (no background colours)
  const mono = `font-family:'Geist Mono',ui-monospace,'Courier New',monospace;letter-spacing:1.5px;text-transform:uppercase`;
  const serif = `font-family:'DM Serif Display',Georgia,'Times New Roman',serif;text-transform:uppercase;letter-spacing:-0.5px`;
  const html = `<div style="font-family:Manrope,Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#242424;line-height:1.5;font-size:15px">
  <div style="padding:8px 0 16px;border-bottom:2px solid #ffc634;margin-bottom:24px">
    <div style="${mono};font-size:11px;color:#656565">The Feast 2026 · 11–13 December</div>
    <div style="${serif};font-size:40px;line-height:1;color:#000;margin-top:6px">The Torch</div>
    <div style="${mono};font-size:11px;color:#656565;margin-top:6px">The Fusion Centre · Ogba, Lagos</div>
  </div>
  <p style="margin:0 0 14px">Hello ${esc(firstName)},</p>
  <p style="margin:0 0 14px"><b>You've got your torch!</b> Your registration for The Feast 2026: The Torch is confirmed.${plan ? ` ${esc(plan)}` : ""}</p>
  <div style="text-align:center;margin:26px 0;padding:18px 0;border-top:1px solid #d6d6d6;border-bottom:1px solid #d6d6d6">
    <div style="${mono};font-size:11px;color:#656565">Your check-in pass · ${esc(passDays)}</div>
    <img src="cid:checkin-qr" width="200" height="200" alt="Check-in QR code ${esc(ticket)}" style="display:block;margin:10px auto"/>
    <div style="${mono};font-size:20px;font-weight:600;color:#000">${esc(ticket)}</div>
    <div style="font-size:13px;color:#656565;margin-top:4px">${esc(gate)}</div>
  </div>
  <p style="margin:0 0 14px">Get ready for a powerful experience of faith, community, creativity and transformation as we gather to encounter God and carry the fire forward.</p>
  <div style="${mono};font-size:11px;color:#656565;margin:22px 0 4px">Your referral ID</div>
  <div style="${serif};font-size:28px;line-height:1.1;color:#000;padding-bottom:6px;border-bottom:2px solid #ffc634;display:inline-block">${esc(code)}</div>
  <p style="margin:14px 0 22px">Pass the torch: friends and family can register at <a href="https://${SITE}" style="color:#242424;text-decoration:none;border-bottom:1.5px solid #ffc634">${SITE}</a></p>
  <p style="margin:0">The fire continues.<br/>The torch is yours to carry.</p>
  <p style="margin:18px 0 0">With love,<br/><b>The New Church</b></p>
</div>`;
  return { subject, text, html };
}

/** "Yes, how many?": 0 when not coming with any. */
function howMany(v: unknown) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(0, Math.min(20, n)) : 0;
}

// Get your Torch: register for The Feast, get a referral ID and a check-in QR code, and a
// confirmation email with both.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return bad("Invalid request");
  // first and last name as given (an older page may still send one "name": split at its first space)
  const given = clean(body.name, 120).replace(/\s+/g, " ");
  const firstName = clean(body.firstName, 60).replace(/\s+/g, " ") || given.split(" ")[0];
  const lastName = clean(body.lastName, 60).replace(/\s+/g, " ") || given.split(" ").slice(1).join(" ");
  const email = clean(body.email, 120).toLowerCase();
  const phone = clean(body.phone, 40);
  const country = clean(body.country, 60);
  const referredBy = clean(body.referredBy, 40).toUpperCase();
  if (!firstName) return bad("Please add your first name");
  if (!lastName) return bad("Please add your last name");
  if (!isEmail(email)) return bad("Please add a valid email");
  if (phone.replace(/\D/g, "").length < 7) return bad("Please add a phone number");
  if (!country) return bad("Please add your country");
  const attendance = body.attendance === "online" ? "online" : body.attendance === "onsite" ? "onsite" : "";
  if (!attendance) return bad("How will you be attending?");
  const picked = attendance === "onsite" ? pickedDays(body.days) : [];
  if (attendance === "onsite" && !picked.length) return bad("Which days will you be with us?");
  const days = picked.map((d) => d.id).join(",");
  const kids = body.kids === true ? howMany(body.kidsCount) : 0;
  const kidsAges = kids ? (Array.isArray(body.kidsAges) ? body.kidsAges : []).slice(0, kids).map((a: unknown) => Math.floor(Number(a))) : [];
  if (kids && (kidsAges.length < kids || kidsAges.some((a: number) => !(a >= 0 && a <= 12)))) return bad("Please add each kid's age (0 to 12)");
  const teens = body.teens === true ? howMany(body.teensCount) : 0;
  if (body.kids === true && kids < 1) return bad("How many kids are coming with you?");
  if (body.teens === true && teens < 1) return bad("How many teenagers are coming with you?");
  const ages = kidsAges.length ? ` (${kidsAges.length === 1 ? "age" : "ages"} ${kidsAges.join(", ")})` : "";
  const company = [kids && `${kids} ${kids === 1 ? "kid" : "kids"}${ages}`, teens && `${teens} ${teens === 1 ? "teenager" : "teenagers"}`].filter(Boolean).join(" and ");
  const when = attendance === "online" ? "You're joining online." : `You're with us onsite: ${daysFull(picked)}.`;
  const plan = [when, company && `You're coming with ${company}.`].filter(Boolean).join(" ");
  const passDays = attendance === "online" ? "Online" : daysPass(picked);
  const [code, ticket] = await Promise.all([referralCode(firstName), ticketId()]);
  const qr = await QRCode.toBuffer(ticket, { type: "png", width: 440, margin: 2, errorCorrectionLevel: "M", color: { dark: "#06134d", light: "#ffffff" } });
  const mail = confirmation(firstName, code, ticket, plan, attendance === "online" ? "Online" : daysFull(picked), attendance === "online");
  // the pass is shown straight away; the email goes after the reply (a slow mail server never
  // keeps anyone waiting on the form)
  const emailed = emailConfigured();
  if (emailed)
    after(() =>
      sendEmail(email, mail.subject, mail.html, mail.text, [{ cid: "checkin-qr", filename: `${ticket}.png`, png: qr }]).catch((e) =>
        console.error("[register] email failed", e),
      ),
    );
  await save("registrations", {
    first_name: firstName,
    last_name: lastName || null,
    email,
    phone,
    country,
    referral_code: code,
    referred_by: referredBy || null,
    emailed,
    attendance,
    days: days || null,
    with_kids: kids > 0,
    with_teens: teens > 0,
    kids_count: kids,
    kids_ages: kidsAges.join(", ") || null,
    teens_count: teens,
    ticket_id: ticket,
  });
  return Response.json({ ok: true, code, ticket, passDays, qr: "data:image/png;base64," + qr.toString("base64"), emailed });
}
