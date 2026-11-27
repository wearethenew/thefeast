"use client";

import Link from "next/link";
import { useState } from "react";
import { INSTALLATIONS } from "../data/places";
import { Shell, field, label, post } from "./Shell";
import { useGame } from "../store";
import { breakoutEligible } from "../breakout";

// Get your Torch: registration for The Feast 2026. Opened from the booth in the game, and on a page
// of its own at thefeast.wearethenew.org/register (standalone: no game around it).

/** Where Get your Torch sends people back to, once they have it. */
const RETURN_LABEL: Record<string, string> = { merch: "your pre-order", game: "claim your prize", volunteer: "Volunteer HQ" };

const KEY_DETAILS = [
  { day: "Fri 11 Dec", what: "Prayer & Worship Night" },
  { day: "Sat 12 Dec", what: "The Word: Pastor Shola Okodugha & Min. Kaestrings · Breakout sessions" },
  { day: "Sun 13 Dec", what: "The Word: Pastor Shola Okodugha & Min. Sunmisola Agbebi-Okeleye" },
];
/** How you'll attend onsite: the days, as stored and as said. */
/** The three Feast days: pick any of them when coming onsite. */
export const DAYS = [
  { id: "fri", label: "Friday", date: "11 Dec" },
  { id: "sat", label: "Saturday", date: "12 Dec" },
  { id: "sun", label: "Sunday", date: "13 Dec" },
];
const COUNTRIES = ["Nigeria", "United Kingdom", "United States", "Canada", "Ghana", "South Africa", "Kenya", "Ireland", "Germany", "United Arab Emirates", "Other"];

// ---------- Get your Torch ----------

/** Yes / No, and when yes, how many. */
function YesNoCount({ title, on, count, setOn, setCount, chip, what }: { title: string; on: boolean | null; count: string; setOn: (v: boolean) => void; setCount: (v: string) => void; chip: (on: boolean) => string; what: string }) {
  return (
    <div>
      <label className={label}>{title}</label>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={chip(on === true)} onClick={() => setOn(true)}>
          Yes
        </button>
        <button type="button" className={chip(on === false)} onClick={() => setOn(false)}>
          No
        </button>
      </div>
      {on && <input className={`${field} mt-2`} type="number" min={1} max={20} inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} placeholder={`How many ${what}?`} required />}
    </div>
  );
}

/** A plain yes or no question. */
function YesNo({ title, on, setOn, chip }: { title: string; on: boolean | null; setOn: (v: boolean) => void; chip: (on: boolean) => string }) {
  return (
    <div>
      <label className={label}>{title}</label>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={chip(on === true)} onClick={() => setOn(true)}>
          Yes
        </button>
        <button type="button" className={chip(on === false)} onClick={() => setOn(false)}>
          No
        </button>
      </div>
    </div>
  );
}

/** One age box per kid. */
function KidsAges({ count, ages, setAges }: { count: number; ages: string[]; setAges: (v: string[]) => void }) {
  if (count < 1) return null;
  return (
    <div>
      <label className={label}>{count === 1 ? "What's their age?" : "What are their ages?"}</label>
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: Math.min(count, 20) }, (_, i) => (
          <input
            key={i}
            className={`${field} text-center`}
            type="number"
            min={0}
            max={12}
            inputMode="numeric"
            value={ages[i] ?? ""}
            onChange={(e) => {
              const next = [...ages];
              next[i] = e.target.value;
              setAges(next);
            }}
            placeholder={count === 1 ? "Age" : `Kid ${i + 1}`}
            aria-label={`Age of kid ${i + 1}`}
            required
          />
        ))}
      </div>
    </div>
  );
}

export function RegisterPanel({ onClose, standalone = false }: { onClose: () => void; /** On its own page (/register), not in the game. */ standalone?: boolean }) {
  const set = useGame((s) => s.set);
  const register = useGame((s) => s.register);
  // already registered on this browser: straight to your torch, pass and referral ID
  const [already] = useState(() => useGame.getState().registered);
  const back = useGame((s) => s.torchReturn);
  const [f, setF] = useState({ firstName: "", lastName: "", email: "", phone: "", country: "Nigeria" });
  const fullName = `${f.firstName.trim()} ${f.lastName.trim()}`.trim();
  const [member, setMember] = useState<boolean | null>(null);
  const [installation, setInstallation] = useState("");
  const [firstTime, setFirstTime] = useState<boolean | null>(null);
  const [kids, setKids] = useState<boolean | null>(null);
  const [teens, setTeens] = useState<boolean | null>(null);
  const [kidsCount, setKidsCount] = useState("");
  const [teensCount, setTeensCount] = useState("");
  const [kidsAges, setKidsAges] = useState<string[]>([]);
  const [attendance, setAttendance] = useState<"onsite" | "online" | null>(null);
  const [days, setDays] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // registered already (another visit, another phone): the ticket ID brings the torch back
  const [returning, setReturning] = useState(false);
  const [ticketIn, setTicketIn] = useState("");
  const [welcomeBack, setWelcomeBack] = useState<string | null>(null);
  const [done, setDone] = useState<{ code: string; ticket?: string; qr?: string; emailed: boolean; days?: string; online?: boolean } | null>(already ? { ...already, emailed: false } : null);
  const up = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const chip = (on: boolean) => `h-12 rounded-[2px] border px-3 text-[15px] font-semibold uppercase tracking-[0.02em] transition ${on ? "border-gold bg-gold text-black" : "border-white/20 bg-white/[0.06] text-white/85 hover:border-white/40"}`;
  // everything required answered: only then can it be sent
  const agesOk = !kids || (Number(kidsCount) >= 1 && kidsAges.slice(0, Number(kidsCount)).filter((a) => a !== "" && Number(a) >= 0 && Number(a) <= 12).length === Number(kidsCount));
  const ready =
    !!f.firstName.trim() &&
    !!f.lastName.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim()) &&
    f.phone.replace(/\D/g, "").length >= 7 &&
    member !== null &&
    (!member || !!installation) &&
    firstTime !== null &&
    attendance !== null &&
    (attendance === "online" || days.length > 0) &&
    kids !== null &&
    agesOk &&
    teens !== null &&
    (!teens || Number(teensCount) >= 1);
  const toggleDay = (id: string) => setDays(days.includes(id) ? days.filter((d) => d !== id) : DAYS.map((d) => d.id).filter((d) => d === id || days.includes(d)));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return setErr("Please answer every question first");
    if (member === null) return setErr("Are you a member of The New Church?");
    if (member && !installation) return setErr("Which installation do you attend?");
    if (firstTime === null) return setErr("Is this your first time at The Feast?");
    if (attendance === null) return setErr("How will you be attending?");
    if (attendance === "onsite" && !days.length) return setErr("Which days will you be with us?");
    if (kids === null) return setErr("Are you coming with kids?");
    if (kids && !(Number(kidsCount) >= 1)) return setErr("How many kids are coming with you?");
    const ages = kids ? kidsAges.slice(0, Number(kidsCount)).map(Number) : [];
    if (kids && (ages.length < Number(kidsCount) || ages.some((a) => !(a >= 0 && a <= 12)))) return setErr("Please add each kid's age (0 to 12)");
    if (teens === null) return setErr("Are you coming with teenagers?");
    if (teens && !(Number(teensCount) >= 1)) return setErr("How many teenagers are coming with you?");
    setBusy(true);
    setErr("");
    try {
      const r = await post("/api/register", { ...f, member, installation: member ? installation : "", firstTime, attendance, days: attendance === "onsite" ? days : [], kids, kidsCount: Number(kidsCount) || 0, kidsAges: ages, teens, teensCount: Number(teensCount) || 0 });
      setDone({ code: r.code, ticket: r.ticket, qr: r.qr, emailed: r.emailed, days: r.passDays, online: attendance === "online" });
      // your torch: carried from here on, and the Main Hall's doors open to you
      register({ code: r.code, ticket: r.ticket, qr: r.qr, days: r.passDays, online: attendance === "online", firstName: f.firstName.trim(), name: fullName, email: f.email.trim(), phone: f.phone.trim(), at: Date.now() });
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const findMine = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await post("/api/torch", { ticket: ticketIn });
      setDone({ code: r.code, ticket: r.ticket, qr: r.qr, emailed: false, days: r.passDays, online: r.online });
      setWelcomeBack(r.firstName || "");
      register({ code: r.code, ticket: r.ticket, qr: r.qr, days: r.passDays, online: r.online, firstName: r.firstName, name: r.name, email: r.email, phone: r.phone, at: Date.now() });
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell kicker="Get your Torch" title={done ? (welcomeBack !== null ? "Welcome back! 🔥" : "You've got your torch! 🔥") : returning ? "Registered already?" : "Register for The Feast 2026"} onClose={onClose}>
      {done ? (
        <div>
          <p>
            {welcomeBack !== null
              ? `Here's your torch again${welcomeBack ? `, ${welcomeBack}` : ""}: it's lit, and the Main Hall is open to you.`
              : already
              ? `You're registered${already.firstName ? `, ${already.firstName}` : ""}, and your torch is lit. The Main Hall is open to you.`
              : `Your registration for The Feast 2026: The Torch is confirmed${done.emailed ? `, and your pass is on its way to ${f.email}` : ""}. ${standalone ? "Your torch is lit on this phone: take it into The Feast whenever you like." : "Carry your torch into the Main Hall."}`}
          </p>
          {done.ticket && (
            <div className="mt-4 flex items-center gap-4 rounded bg-white p-3 text-black">
              {done.qr && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={done.qr} alt={`Check-in QR code ${done.ticket}`} className="h-28 w-28 shrink-0" />
              )}
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.2em]">Check-in pass · {done.days ?? "Fri · Sat · Sun"}</div>
                <div className="mt-1 text-lg font-black tracking-wider">{done.ticket}</div>
                <div className="mt-1 text-[11px] leading-snug">{done.online ? "You're joining online. If you come onsite, show this QR code at the gate." : "Show this QR code at the gate. One code works for all your days."}</div>
              </div>
            </div>
          )}
          <div className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-white/60">Your referral ID</div>
          <div className="mt-1 flex items-center gap-2">
            <div className="flex-1 rounded-xl bg-gold px-4 py-3 text-center text-2xl font-black tracking-[0.15em] text-black">{done.code}</div>
            <button className="btn-ghost px-3 py-3 text-xs" onClick={() => navigator.clipboard?.writeText(done.code)}>
              Copy
            </button>
          </div>
          <p className="mt-3 text-[12px] text-white/70">Pass the torch: share your referral ID and point friends and family to thefeast.wearethenew.org.</p>
          {back && (
            <button className="btn-gold mt-4 w-full py-3 text-[14px]" onClick={() => set({ panel: back, torchReturn: null })}>
              Back to {RETURN_LABEL[back] ?? "where you were"} →
            </button>
          )}
          {standalone ? (
            // on its own page: onsite on Saturday, book a breakout (the ticket's filled in there); and
            // The Feast itself, where the torch on this phone opens the Main Hall
            <>
              {breakoutEligible({ code: done.code, firstName: "", at: 0, ticket: done.ticket, days: done.days, online: done.online }) && (
                <Link href="/breakout" className="btn-gold mt-4 block w-full py-3 text-center text-xs">
                  Book your Saturday breakout session →
                </Link>
              )}
              <Link href="/" className="btn-ghost mt-3 block w-full py-3 text-center text-xs">
                Walk into The Feast →
              </Link>
            </>
          ) : (
            // always: wherever you are, it takes you to the Main Hall doors with your torch
            <button className="btn-gold mt-4 w-full py-3 text-xs" onClick={() => set({ panel: null, stage: "venue", spawnAt: "door", arrived: true, venueSpot: null, seated: false, toDoor: Date.now() })}>
              Walk in with the crowd →
            </button>
          )}
        </div>
      ) : returning ? (
        <form onSubmit={findMine} className="space-y-3">
          <p className="text-[14px] text-white/80 sm:text-[13px]">Enter the ticket ID on your pass (it&apos;s in your confirmation email) and you&apos;ll have your torch again.</p>
          <div>
            <label className={label}>Ticket ID</label>
            <input className={`${field} font-bold uppercase tracking-wider`} value={ticketIn} onChange={(e) => setTicketIn(e.target.value)} placeholder="TF26-ABCD-EFGH" autoCapitalize="characters" autoCorrect="off" spellCheck={false} required />
          </div>
          {err && <div className="text-[13px] text-red-300">{err}</div>}
          <button className="btn-gold w-full py-3.5 text-[15px]" disabled={busy || ticketIn.replace(/[^a-z0-9]/gi, "").length < 12}>
            {busy ? "Finding your torch…" : "Get my torch 🔥"}
          </button>
          <button type="button" className="w-full py-2 text-[12px] text-white/70 underline-offset-4 hover:underline" onClick={() => (setReturning(false), setErr(""))}>
            Not registered yet? Register instead
          </button>
        </form>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <button type="button" className="w-full rounded-xl border border-gold/50 bg-gold/10 px-3 py-2.5 text-left text-[14px] font-semibold text-gold sm:text-[13px]" onClick={() => (setReturning(true), setErr(""))}>
            Registered already? Get your torch with your ticket ID →
          </button>
          <div className="rounded-xl border border-white/10 bg-black/25 p-3">
            <div className="eyebrow mb-1.5 text-[11px]">The Torch · Key details</div>
            {KEY_DETAILS.map((d) => (
              <div key={d.day} className="flex gap-3 py-0.5 text-[14px] sm:text-[12px]">
                <span className="w-20 shrink-0 font-bold">{d.day}</span>
                <span className="text-white/80">{d.what}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className={label}>First name</label>
              <input className={field} value={f.firstName} onChange={up("firstName")} autoComplete="given-name" required />
            </div>
            <div>
              <label className={label}>Last name</label>
              <input className={field} value={f.lastName} onChange={up("lastName")} autoComplete="family-name" required />
            </div>
          </div>
          <div>
            <label className={label}>Email</label>
            <input className={field} type="email" value={f.email} onChange={up("email")} autoComplete="email" required />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className={label}>Phone number</label>
              <input className={field} type="tel" value={f.phone} onChange={up("phone")} autoComplete="tel" required />
            </div>
            <div>
              <label className={label}>Country</label>
              <select className={field} value={f.country} onChange={up("country")}>
                {COUNTRIES.map((c) => (
                  <option key={c} value={c} className="bg-black">
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <YesNo title="Are you a member of The New Church?" on={member} setOn={setMember} chip={chip} />
          {member && (
            <div>
              <label className={label}>Which installation do you attend?</label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {INSTALLATIONS.map((i) => (
                  <button key={i.id} type="button" aria-pressed={installation === i.name} className={chip(installation === i.name)} onClick={() => setInstallation(i.name)}>
                    {i.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <YesNo title="Is this your first time at The Feast?" on={firstTime} setOn={setFirstTime} chip={chip} />
          <div>
            <label className={label}>How will you be attending?</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={chip(attendance === "onsite")} onClick={() => setAttendance("onsite")}>
                Onsite
              </button>
              <button type="button" className={chip(attendance === "online")} onClick={() => setAttendance("online")}>
                Online only
              </button>
            </div>
          </div>
          {attendance === "onsite" && (
            <div>
              <label className={label}>Which days will you be with us? Pick all that apply</label>
              <div className="grid grid-cols-3 gap-2">
                {DAYS.map((d) => (
                  <button key={d.id} type="button" aria-pressed={days.includes(d.id)} className={`${chip(days.includes(d.id))} flex h-14 flex-col items-center justify-center gap-0.5 leading-none`} onClick={() => toggleDay(d.id)}>
                    <span>{d.label}</span>
                    <span className="text-[11px] font-medium normal-case opacity-75">{d.date}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <YesNoCount title="Are you coming with kids?" on={kids} count={kidsCount} setOn={setKids} setCount={setKidsCount} chip={chip} what="kids" />
          {kids && <KidsAges count={Number(kidsCount) || 0} ages={kidsAges} setAges={setKidsAges} />}
          <YesNoCount title="Are you coming with teenagers?" on={teens} count={teensCount} setOn={setTeens} setCount={setTeensCount} chip={chip} what="teenagers" />
          {/* pinned to the bottom of the form, always in view; it lights up once everything's answered */}
          <div className={`sticky ${standalone ? "bottom-0" : "-bottom-5 sm:-bottom-6"} -mx-5 -mb-5 border-t border-white/10 bg-black/90 px-5 pb-5 pt-3 backdrop-blur sm:-mx-6 sm:-mb-6 sm:px-6 sm:pb-6`}>
            {err && <div className="mb-2 text-xs text-red-300">{err}</div>}
            <button className="btn-gold w-full py-3.5 text-[15px] disabled:cursor-not-allowed disabled:opacity-40" disabled={busy || !ready}>
              {busy ? "Registering…" : "Get your Torch 🔥"}
            </button>
            {!ready && <div className="mt-1.5 text-center text-[11px] text-white/55">Answer every question to get your torch</div>}
          </div>
        </form>
      )}
    </Shell>
  );
}
