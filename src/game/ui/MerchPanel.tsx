"use client";

import { useState } from "react";
import { MERCH } from "../data/merch";
import { MerchArt } from "./MerchArt";
import { useGame } from "../store";
import { TorchFirst, useDraft, whoIs } from "./torchFirst";
import { Shell, field, label, post } from "./Shell";

// ---------- Merch ----------

function Swatch({ item, color, design, big }: { item: (typeof MERCH)[number]; color?: string; design?: number; big?: boolean }) {
  return (
    <div className={`flex items-center justify-center rounded-lg bg-[radial-gradient(circle_at_50%_35%,#f7f5f0,#d9d4ca_70%,#bdb6aa)] ${big ? "h-40 p-2" : "h-20 p-1"}`}>
      <MerchArt item={item} color={color} design={design} className="h-full w-full" />
    </div>
  );
}

/**
 * The Merch booth's pre-order form. In the game it needs your torch first; on its own page
 * (`standalone`, /merch) anyone can pre-order with their name, email and phone.
 */
export function MerchPanel({ onClose, standalone = false }: { onClose: () => void; standalone?: boolean }) {
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
  // on the /merch page without a torch on this browser: your details typed in
  const [contact, setContact] = useDraft("merch:contact", { name: "", email: "", phone: "" });
  const typed = standalone && !registered;
  const f = typed ? contact : whoIs();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registered && !standalone) return setNeedTorch(true);
    if (typed) {
      if (contact.name.trim().length < 2) return setErr("Please add your name");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim())) return setErr("Please add a valid email");
      if (contact.phone.replace(/\D/g, "").length < 7) return setErr("Please add a phone number");
    }
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
          {typed && (
            <div className="mt-3 space-y-2.5">
              <div>
                <label className={label}>Full name</label>
                <input className={field} value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} autoComplete="name" required />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className={label}>Email</label>
                  <input className={field} type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} autoComplete="email" required />
                </div>
                <div>
                  <label className={label}>Phone number</label>
                  <input className={field} type="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} autoComplete="tel" required />
                </div>
              </div>
            </div>
          )}
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
