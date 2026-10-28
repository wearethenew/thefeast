"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { MERCH } from "../data/merch";
import { MerchArt } from "./MerchArt";
import { WEND_ANSWERS, WEND_TRIES } from "../data/wend";
import { useGame } from "../store";
import { TentPanel } from "./VenueUI";
import { TorchFirst, useDraft, whoIs } from "./torchFirst";

/** Where Get your Torch sends people back to, once they have it. */
const RETURN_LABEL: Record<string, string> = { merch: "your pre-order", game: "claim your prize", volunteer: "Volunteer HQ" };

// The panels the booth buttons open: Get your Torch (registration), Merch pre-order, the WEND
// game, and the help desks. One layer for the opening film and for walking the compound.

const KEY_DETAILS = [
  { day: "Fri 11 Dec", what: "Prayer & Worship Night · Breakout sessions" },
  { day: "Sat 12 Dec", what: "The Word: Pastor Shola Okodugha & Min. Kaestrings" },
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

/** On a booth's board (3D, in the world) the panel is a plain card; otherwise a modal overlay. */
export const BoardContext = createContext(false);

function Shell({ kicker, title, onClose, wide, children }: { kicker: string; title: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  const onBoard = useContext(BoardContext);
  const card = (
    <div className={`glass w-full rounded-2xl p-5 sm:p-6 ${onBoard ? "h-full overflow-y-auto" : `max-h-[92dvh] overflow-y-auto overscroll-contain ${wide ? "max-w-2xl" : "max-w-md"}`}`} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="eyebrow text-[11px]">{kicker}</div>
          <div className="brand-title mt-1 text-3xl">{title}</div>
        </div>
        <button onClick={onClose} className="-mr-1 rounded-full px-2 text-lg text-white/60 hover:text-white" aria-label="Close">
          ✕
        </button>
      </div>
      <div className="mt-4 text-[15px] text-white/85 sm:text-sm">{children}</div>
    </div>
  );
  if (onBoard) return card;
  return (
    <div className="pointer-events-auto fixed inset-0 z-30 flex items-end justify-center bg-black/50 p-3 sm:items-center" onClick={onClose}>
      {card}
    </div>
  );
}

const field = "h-12 w-full rounded-[2px] border border-white/15 bg-white/[0.06] px-3.5 text-base outline-none transition placeholder:text-white/40 hover:border-white/40 focus:border-gold";
const label = "mb-1.5 block font-[family-name:var(--font-label)] text-[12px] font-medium uppercase tracking-[0.08em] text-white/60";

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({ ok: false, error: "Something went wrong" }));
  if (!data.ok) throw new Error(data.error ?? "Something went wrong");
  return data;
}

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

function RegisterPanel({ onClose }: { onClose: () => void }) {
  const stage = useGame((s) => s.stage);
  const set = useGame((s) => s.set);
  const register = useGame((s) => s.register);
  // already registered on this browser: straight to your torch, pass and referral ID
  const [already] = useState(() => useGame.getState().registered);
  const back = useGame((s) => s.torchReturn);
  const [f, setF] = useState({ name: "", email: "", phone: "", country: "Nigeria" });
  const [kids, setKids] = useState<boolean | null>(null);
  const [teens, setTeens] = useState<boolean | null>(null);
  const [kidsCount, setKidsCount] = useState("");
  const [teensCount, setTeensCount] = useState("");
  const [kidsAges, setKidsAges] = useState<string[]>([]);
  const [attendance, setAttendance] = useState<"onsite" | "online" | null>(null);
  const [days, setDays] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ code: string; ticket?: string; qr?: string; emailed: boolean; days?: string; online?: boolean } | null>(already ? { ...already, emailed: false } : null);
  const up = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const chip = (on: boolean) => `h-12 rounded-[2px] border px-3 text-[15px] font-semibold uppercase tracking-[0.02em] transition ${on ? "border-gold bg-gold text-black" : "border-white/20 bg-white/[0.06] text-white/85 hover:border-white/40"}`;
  // everything required answered: only then can it be sent
  const agesOk = !kids || (Number(kidsCount) >= 1 && kidsAges.slice(0, Number(kidsCount)).filter((a) => a !== "" && Number(a) >= 0 && Number(a) <= 12).length === Number(kidsCount));
  const ready =
    !!f.name.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim()) &&
    f.phone.replace(/\D/g, "").length >= 7 &&
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
      const r = await post("/api/register", { ...f, attendance, days: attendance === "onsite" ? days : [], kids, kidsCount: Number(kidsCount) || 0, kidsAges: ages, teens, teensCount: Number(teensCount) || 0 });
      setDone({ code: r.code, ticket: r.ticket, qr: r.qr, emailed: r.emailed, days: r.passDays, online: attendance === "online" });
      // your torch: carried from here on, and the Main Hall's doors open to you
      register({ code: r.code, ticket: r.ticket, qr: r.qr, days: r.passDays, online: attendance === "online", firstName: f.name.trim().split(/\s+/)[0], name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim(), at: Date.now() });
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell kicker="Get your Torch" title={done ? "You've got your torch! 🔥" : "Register for The Feast 2026"} onClose={onClose}>
      {done ? (
        <div>
          <p>
            {already
              ? `You're registered${already.firstName ? `, ${already.firstName}` : ""}, and your torch is lit. The Main Hall is open to you.`
              : `Your registration for The Feast 2026: The Torch is confirmed${done.emailed ? `, and we've emailed your pass to ${f.email}` : ""}. Carry your torch into the Main Hall.`}
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
          {stage === "title" && (
            <button className="btn-gold mt-4 w-full py-3 text-xs" onClick={() => set({ panel: null, stage: "venue", spawnAt: "door", arrived: true, venueSpot: null, seated: false })}>
              Walk in with the crowd →
            </button>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <div className="rounded-xl border border-white/10 bg-black/25 p-3">
            <div className="eyebrow mb-1.5 text-[11px]">The Torch · Key details</div>
            {KEY_DETAILS.map((d) => (
              <div key={d.day} className="flex gap-3 py-0.5 text-[14px] sm:text-[12px]">
                <span className="w-20 shrink-0 font-bold">{d.day}</span>
                <span className="text-white/80">{d.what}</span>
              </div>
            ))}
          </div>
          <div>
            <label className={label}>Name</label>
            <input className={field} value={f.name} onChange={up("name")} autoComplete="name" placeholder="Your full name" required />
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
          <div className="sticky -bottom-5 -mx-5 -mb-5 border-t border-white/10 bg-black/90 px-5 pb-5 pt-3 backdrop-blur sm:-bottom-6 sm:-mx-6 sm:-mb-6 sm:px-6 sm:pb-6">
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

// ---------- Merch ----------

/** A product shot on a soft studio backdrop. */
function Swatch({ item, color, design, big }: { item: (typeof MERCH)[number]; color?: string; design?: number; big?: boolean }) {
  return (
    <div className={`flex items-center justify-center rounded-lg bg-[radial-gradient(circle_at_50%_35%,#f7f5f0,#d9d4ca_70%,#bdb6aa)] ${big ? "h-40 p-2" : "h-20 p-1"}`}>
      <MerchArt item={item} color={color} design={design} className="h-full w-full" />
    </div>
  );
}

function MerchPanel({ onClose }: { onClose: () => void }) {
  // what they've picked is kept through the trip to Get your Torch and back
  const [pick, setPickRaw] = useDraft<string>("merch:pick", MERCH[0].id);
  const item = MERCH.find((m) => m.id === pick)!;
  const [size, setSize] = useDraft("merch:size", item.sizes[0]);
  const [color, setColor] = useDraft("merch:color", item.colors[0]);
  const [design, setDesign] = useDraft("merch:design", 0);
  const [qty, setQty] = useDraft("merch:qty", 1);
  const setPick = (id: string) => {
    const next = MERCH.find((m) => m.id === id)!;
    setPickRaw(id);
    setSize(next.sizes[0]);
    setColor(next.colors[0]);
    setDesign(0);
  };
  const registered = useGame((s) => s.registered);
  const [needTorch, setNeedTorch] = useState(false);
  const f = whoIs();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registered) return setNeedTorch(true);
    setBusy(true);
    setErr("");
    try {
      await post("/api/merch", { name: f.name, email: f.email, phone: f.phone, item: item.id, size, color: color.name, design: item.designs?.[design], quantity: qty });
      setDone(true);
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell kicker="Feast Merch" title={done ? "Pre-order received 🙌" : "Pre-order your Feast merch"} onClose={onClose} wide>
      {done ? (
        <p>
          Thanks {f.name.split(" ")[0]}! Your pre-order for {qty} × {item.name} ({item.designs ? `${item.designs[design]}, ` : ""}{color.name}{item.sizes.length > 1 ? `, ${size}` : ""}) is in. Pick it up at the Merch booth at The Feast 2026; we&apos;ll be in touch at {f.email}.
        </p>
      ) : (
        <form onSubmit={submit}>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
            {MERCH.map((m) => (
              <button
                type="button"
                key={m.id}
                onClick={() => setPick(m.id)}
                className={`rounded-xl border p-2 text-left transition ${pick === m.id ? "border-gold bg-gold/15" : "border-white/15 bg-white/5 hover:bg-white/10"}`}
              >
                <Swatch item={m} />
                <div className="mt-1.5 text-[12px] font-bold leading-tight">{m.name}</div>
              </button>
            ))}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1.1fr_1fr]">
            <Swatch item={item} color={color.hex} design={design} big />
            <div>
              <div className="text-base font-extrabold">{item.name}</div>
              <p className="mt-1 text-[12px] text-white/70">{item.blurb}</p>
              {item.designs && (
                <>
                  <label className={`${label} mt-3`}>Design · {item.designs[design]}</label>
                  <div className="flex flex-wrap gap-1.5">
                    {item.designs.map((d, i) => (
                      <button
                        type="button"
                        key={d}
                        onClick={() => setDesign(i)}
                        className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition ${design === i ? "border-gold bg-gold text-black" : "border-white/20 bg-black/30 hover:border-white/50"}`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <label className={`${label} mt-3`}>Colour · {color.name}</label>
              <div className="flex gap-2">
                {item.colors.map((c) => (
                  <button
                    type="button"
                    key={c.name}
                    title={c.name}
                    aria-label={c.name}
                    onClick={() => setColor(c)}
                    className={`h-8 w-8 rounded-full border-2 shadow-inner transition ${color.name === c.name ? "border-gold scale-110" : "border-white/30 hover:border-white/70"}`}
                    style={{ background: c.hex }}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <div>
              <label className={label}>Size</label>
              <select className={field} value={size} onChange={(e) => setSize(e.target.value)}>
                {item.sizes.map((s) => (
                  <option key={s} className="bg-black">
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Quantity</label>
              <input className={field} type="number" min={1} max={20} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(20, +e.target.value || 1)))} />
            </div>
          </div>
          {registered && (
            <div className="mt-3 text-[13px] text-white/70">
              Pre-ordering as <b className="text-white">{f.name}</b> · {f.email}
            </div>
          )}
          {/* pinned to the bottom of the form, always in view */}
          <div className="sticky -bottom-5 -mx-5 -mb-5 mt-3 border-t border-white/10 bg-black/90 px-5 pb-5 pt-3 backdrop-blur sm:-bottom-6 sm:-mx-6 sm:-mb-6 sm:px-6 sm:pb-6">
            {err && <div className="mb-2 text-xs text-red-300">{err}</div>}
            {needTorch && !registered ? (
              <TorchFirst what="your pre-order" back="merch" />
            ) : (
              <button className="btn-gold w-full py-3.5 text-[15px]" disabled={busy}>
                {busy ? "Sending…" : "Pre-order"}
              </button>
            )}
          </div>
        </form>
      )}
    </Shell>
  );
}

// ---------- WEND ----------

/** The letters of a word in a new order (never the word itself). */
function scramble(word: string, seed: number) {
  const out = [...word];
  let k = seed;
  for (let tries = 0; tries < 20; tries++) {
    for (let i = out.length - 1; i > 0; i--) {
      k = (k * 16807) % 2147483647;
      const j = k % (i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    if (out.join("") !== word) break;
  }
  return out;
}

const WHEEL = 260;
/** Hints show at most this many letters, and never the first or the last. */
const MAX_HINTS = 2;

/** Which letters the hints show, in order: inner letters only, spread across the word. */
function hintOrder(word: string, seed: number) {
  const inner = Array.from({ length: Math.max(0, word.length - 2) }, (_, i) => i + 1);
  return scramble(inner.map((i) => String.fromCharCode(65 + i)).join(""), seed)
    .map((c) => c.charCodeAt(0) - 65)
    .slice(0, MAX_HINTS);
}

function WendPanel({ onClose }: { onClose: () => void }) {
  const [round, setRound] = useState(0);
  const [seed, setSeed] = useState(() => 1 + Math.floor(Math.random() * 100000));
  const target = WEND_ANSWERS[round];
  const answer = target.word;
  const letters = useMemo(() => scramble(answer, seed + round * 977), [answer, seed, round]);
  const [path, setPath] = useState<number[]>([]);
  const [dragging, setDragging] = useState(false);
  const [solved, setSolved] = useDraft<number[]>("wend:solved", []);
  const [tries, setTries] = useState(0);
  const [hints, setHints] = useState(0);
  const [shake, setShake] = useState(false);
  const [started, setStarted] = useState(() => Date.now());
  const registered = useGame((s) => s.registered);
  const [needTorch, setNeedTorch] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const claim = whoIs();
  const [err, setErr] = useState("");
  const done = solved.includes(round);
  const won = solved.length === WEND_ANSWERS.length;
  const word = path.map((i) => letters[i]).join("");
  // which letters the hints show is fixed per year (shuffling the wheel never shows new ones)
  const [hintSeed] = useState(() => 1 + Math.floor(Math.random() * 100000));
  const hinted = useMemo(() => hintOrder(answer, hintSeed + round * 31).slice(0, hints), [answer, hintSeed, round, hints]);

  const r = WHEEL / 2 - 34;
  const spot = (i: number) => {
    const a = (i / letters.length) * Math.PI * 2 - Math.PI / 2;
    return [WHEEL / 2 + Math.cos(a) * r, WHEEL / 2 + Math.sin(a) * r];
  };
  /** The letter under the pointer (works on the 3D booth board too: the browser does the hit test). */
  const under = (e: React.PointerEvent) => {
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-li]") as HTMLElement | null;
    return el ? Number(el.dataset.li) : -1;
  };
  const down = (e: React.PointerEvent) => {
    if (done) return;
    const i = under(e);
    if (i < 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
    setPath([i]);
    setErr("");
  };
  const move = (e: React.PointerEvent) => {
    if (!dragging) return;
    const i = under(e);
    if (i < 0) return;
    // back over the previous letter undoes the last step
    if (path.length > 1 && i === path[path.length - 2]) setPath(path.slice(0, -1));
    else if (!path.includes(i)) setPath([...path, i]);
  };
  const up = () => {
    if (!dragging) return;
    setDragging(false);
    if (path.length < 2) return setPath([]);
    const n = tries + 1;
    setTries(n);
    if (word === answer) {
      setSolved([...solved, round]);
      post("/api/game", { answer, guesses: Math.min(n, WEND_TRIES), won: true, seconds: (Date.now() - started) / 1000 }).catch(() => {});
    } else {
      setShake(true);
      setTimeout(() => setShake(false), 450);
      setErr(word.length < answer.length ? `Keep going: it's ${answer.length} letters` : "Not quite, try again");
      setTimeout(() => setPath([]), 450);
    }
  };
  /** Play a given year (the year picker), or the next one not yet solved. */
  const pick = (to: number) => {
    setRound(to);
    setPath([]);
    setTries(0);
    setHints(0);
    setErr("");
    setStarted(Date.now());
  };
  const next = () => {
    const left = WEND_ANSWERS.map((_, i) => (round + 1 + i) % WEND_ANSWERS.length).filter((i) => !solved.includes(i));
    pick(left[0] ?? 0);
  };

  return (
    <Shell kicker="WEND · The Feast 2026 word game" title={won ? "You know your Feasts! 🔥" : `The Feast ${target.year}: what was the theme?`} onClose={onClose} wide>
      {!won && (
        <>
          {/* pick the year to guess */}
          <div className="grid grid-cols-4 gap-1.5" role="tablist" aria-label="Pick a year">
            {WEND_ANSWERS.map((a, i) => (
              <button
                key={a.year}
                role="tab"
                aria-selected={i === round}
                className={`h-11 rounded-[2px] border font-[family-name:var(--font-label)] text-sm font-semibold transition ${
                  i === round ? "border-gold bg-gold text-black" : solved.includes(i) ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-200" : "border-white/20 bg-white/[0.06] text-white/85 hover:border-white/40"
                }`}
                onClick={() => i !== round && pick(i)}
              >
                {a.year}
                {solved.includes(i) && " ✓"}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[12px] text-white/70">
            Drag across the letters to connect them and spell the {target.year} theme. Every letter is used once. {solved.length} of {WEND_ANSWERS.length} years solved.
          </p>
          {/* the answer slots: your letters as you drag, the hints as faint guides */}
          <div className={`mt-3 flex justify-center gap-1 ${shake ? "animate-[shake_0.45s]" : ""}`}>
            {[...answer].map((ch, i) => {
              const shown = done ? ch : word[i] ?? "";
              const hint = !done && !shown && hinted.includes(i);
              return (
                <div
                  key={i}
                  className={`flex h-10 w-8 items-center justify-center rounded-md border text-lg font-black sm:w-9 ${
                    done ? "border-emerald-400 bg-emerald-500" : shown ? "border-gold bg-gold/20" : "border-white/25 bg-black/30"
                  }`}
                >
                  {shown || (hint ? <span className="text-white/35">{ch}</span> : "")}
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex justify-center">
            <div
              className="relative select-none"
              style={{ width: WHEEL, height: WHEEL, touchAction: "none" }}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
            >
              <div className="absolute inset-3 rounded-full border border-white/15 bg-white/5" />
              <svg className="pointer-events-none absolute inset-0" width={WHEEL} height={WHEEL}>
                {path.slice(1).map((p, k) => {
                  const [x1, y1] = spot(path[k]);
                  const [x2, y2] = spot(p);
                  return <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#f2b81f" strokeWidth="7" strokeLinecap="round" opacity="0.85" />;
                })}
              </svg>
              {letters.map((ch, i) => {
                const [x, y] = spot(i);
                const on = path.includes(i) || done;
                return (
                  <div
                    key={i}
                    data-li={i}
                    className={`absolute flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-xl font-black shadow-lg transition ${
                      on ? "scale-110 bg-gold text-black" : "bg-white text-black hover:scale-105"
                    }`}
                    style={{ left: x, top: y }}
                  >
                    {ch}
                  </div>
                );
              })}
            </div>
          </div>
          {err && <div className="mt-1 text-center text-xs text-amber-300">{err}</div>}
          <div className="mt-3 flex gap-2">
            {done ? (
              <>
                <div className="flex-1 self-center text-center font-bold">
                  🔥 {target.year}: {answer}!
                </div>
                <button className="btn-gold flex-1 py-2.5 text-xs" onClick={next}>
                  Next year →
                </button>
              </>
            ) : (
              <>
                <button className="btn-ghost flex-1 py-2.5 text-[11px]" onClick={() => setHints(Math.min(MAX_HINTS, hints + 1))} disabled={hints >= MAX_HINTS}>
                  💡 Hint: show a letter ({MAX_HINTS - hints} left)
                </button>
                <button className="btn-ghost flex-1 py-2.5 text-[11px]" onClick={() => setSeed(seed + 1)}>
                  🔀 Shuffle
                </button>
              </>
            )}
          </div>
        </>
      )}
      {won && (
        <div className="rounded-xl border border-white/10 bg-black/25 p-3">
          {claimed ? (
            <p>🏆 Prize claimed! We&apos;ll be in touch at {claim.email} to sort out your prize.</p>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setErr("");
                // a prize goes to a torch-bearer
                if (!registered) return setNeedTorch(true);
                try {
                  await post("/api/game", { answer, guesses: Math.min(tries, WEND_TRIES) || 1, won: true, claim: true, name: claim.name, email: claim.email, phone: claim.phone });
                  setClaimed(true);
                } catch (x) {
                  setErr((x as Error).message);
                }
              }}
            >
              <p className="font-bold">You connected every theme: {WEND_ANSWERS.map((a) => `${a.year} ${a.word}`).join(" · ")}. Claim your prize:</p>
              {registered && (
                <div className="mt-2 text-[13px] text-white/70">
                  Claiming as <b className="text-white">{claim.name}</b> · {claim.email}
                </div>
              )}
              {err && <div className="mt-1 text-xs text-red-300">{err}</div>}
              {needTorch && !registered ? (
                <div className="mt-2">
                  <TorchFirst what="claim your prize" back="game" />
                </div>
              ) : (
                <button className="btn-gold mt-2 w-full py-2.5 text-xs">Claim my prize</button>
              )}
            </form>
          )}
          <button
            className="btn-ghost mt-2 w-full py-2 text-[11px]"
            onClick={() => {
              setSolved([]);
              setClaimed(false);
              setSeed(seed + 7);
              next();
            }}
          >
            Play again
          </button>
        </div>
      )}
    </Shell>
  );
}

/** The open booth's panel (on its board in the world: see BoothBoards). */
export function BoothPanels({ id }: { id?: string } = {}) {
  const open = useGame((s) => s.panel);
  const panel = id ?? open;
  const set = useGame((s) => s.set);
  const close = () => set({ panel: null });
  if (!panel) return null;
  if (panel === "register") return <RegisterPanel onClose={close} />;
  if (panel === "merch") return <MerchPanel onClose={close} />;
  if (panel === "game") return <WendPanel onClose={close} />;
  return <TentPanel id={panel} onClose={close} />;
}
