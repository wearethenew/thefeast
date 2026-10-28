import QRCode from "qrcode";
import { daysPass, pickedDays } from "@/server/days";
import { findOne } from "@/server/storage";
import { bad, clean } from "@/server/validate";

// "I've registered already": back on another visit (or another phone), the check-in pass's ticket
// ID finds your registration, and you have your torch again without registering twice. Only the
// ticket ID works (it's your pass, and not something anyone could guess); an email alone doesn't.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return bad("Invalid request");
  // "tf26 abcd efgh", "TF26ABCDEFGH" and the like all read as TF26-ABCD-EFGH
  const raw = clean(body.ticket, 40).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const m = raw.match(/^TF26([A-Z0-9]{4})([A-Z0-9]{4})$/);
  if (!m) return bad("That doesn't look like a ticket ID: it's on your pass, like TF26-ABCD-EFGH");
  const ticket = `TF26-${m[1]}-${m[2]}`;
  const r = await findOne("registrations", "ticket_id", ticket);
  if (!r) return bad("We couldn't find that ticket ID. Check it against your confirmation email.", 404);
  const online = String(r.attendance) === "online";
  const firstName = String(r.first_name ?? "");
  const lastName = String(r.last_name ?? "");
  const qr = await QRCode.toBuffer(ticket, { type: "png", width: 440, margin: 2, errorCorrectionLevel: "M", color: { dark: "#06134d", light: "#ffffff" } });
  return Response.json({
    ok: true,
    ticket,
    code: String(r.referral_code ?? ""),
    firstName,
    name: [firstName, lastName].filter(Boolean).join(" "),
    email: String(r.email ?? ""),
    phone: String(r.phone ?? ""),
    online,
    passDays: online ? "Online" : daysPass(pickedDays(r.days)),
    qr: "data:image/png;base64," + qr.toString("base64"),
  });
}
