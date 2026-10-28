"use client";

import { useEffect, useState } from "react";
import { TorchFirst } from "./torchFirst";
import { useGame } from "../store";

type Hit = { display_name: string; lat: string; lon: string };

function useAddressSearch(q: string) {
  const [hits, setHits] = useState<Hit[]>([]);
  useEffect(() => {
    if (q.trim().length < 3) {
      setHits([]);
      return;
    }
    const ctrl = new AbortController();
    const id = setTimeout(() => {
      fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then(setHits)
        .catch(() => {});
    }, 600);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [q]);
  return hits;
}

/**
 * Bring a friend: their name, email and where to pick them up. They get an email invite whose
 * link opens their journey from that address, riding in the same danfo as you.
 */
export function InviteFriend({ onClose }: { onClose: () => void }) {
  const me = useGame((s) => s.registered?.name ?? s.player.name);
  // at the Fusion Centre the torch comes first: invites go out from a torch-bearer
  const torchFirst = useGame((s) => !s.registered && (s.stage === "venue" || s.stage === "title"));
  const [needTorch, setNeedTorch] = useState(false);
  const invites = useGame((s) => s.invites);
  const set = useGame((s) => s.set);
  const [friend, setFriend] = useState("");
  const [email, setEmail] = useState("");
  const [q, setQ] = useState("");
  const [pickup, setPickup] = useState<{ label: string; lat: number; lon: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const hits = useAddressSearch(pickup ? "" : q);

  const send = async () => {
    if (torchFirst) return setNeedTorch(true);
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: me || "A friend", friend, email, pickup }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Could not send the invite");
      // no email service configured: hand the message to the visitor's own mail app
      if (!data.sent && data.mailto) window.location.href = data.mailto;
      set({ invites: [...invites, { friend, email, pickup: pickup?.label ?? "", status: data.sent ? "sent" : "email-app" }] });
      setFriend("");
      setEmail("");
      setQ("");
      setPickup(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const ready = friend.trim().length > 1 && /\S+@\S+\.\S+/.test(email);
  return (
    <div className="pointer-events-auto fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <div className="glass max-h-[88dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="eyebrow text-[10px]">Pass the fire</div>
            <div className="text-2xl font-black">Bring a friend to The Feast 2026</div>
          </div>
          <button onClick={onClose} className="rounded-full px-2 text-lg text-white/60 hover:text-white" aria-label="Close">
            ✕
          </button>
        </div>
        <p className="mt-2 text-sm text-white/80">We&apos;ll email them an invite. Their journey starts from the address you give, and the danfo picks them up so you arrive together.</p>
        <input value={friend} onChange={(e) => setFriend(e.target.value.slice(0, 40))} placeholder="Friend's name" className="mt-3 w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-sm outline-none focus:border-gold" />
        <input value={email} onChange={(e) => setEmail(e.target.value.trim())} type="email" placeholder="Friend's email" className="mt-2 w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-sm outline-none focus:border-gold" />
        {pickup ? (
          <div className="mt-2 flex items-center justify-between rounded-lg bg-black/30 px-3 py-2 text-xs">
            <span className="truncate">📍 {pickup.label}</span>
            <button className="ml-2 text-gold" onClick={() => setPickup(null)}>
              change
            </button>
          </div>
        ) : (
          <>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pickup address (street, area, city)" className="mt-2 w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-sm outline-none focus:border-gold" />
            {hits.length > 0 && (
              <div className="mt-1 max-h-36 overflow-y-auto rounded-lg border border-white/10 bg-black/50">
                {hits.map((h) => (
                  <button key={h.lat + h.lon} onClick={() => setPickup({ label: h.display_name, lat: +h.lat, lon: +h.lon })} className="block w-full truncate px-3 py-2 text-left text-xs hover:bg-white/10">
                    {h.display_name}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        {error && <div className="mt-2 text-xs text-red-300">{error}</div>}
        {needTorch && torchFirst ? (
          <div className="mt-4">
            <TorchFirst what="invite your friends" back={null} onGo={onClose} />
          </div>
        ) : (
          <button className="btn-gold mt-4 w-full py-3 text-xs" disabled={!ready || busy} onClick={send}>
            {busy ? "Sending…" : "Send the invite"}
          </button>
        )}
        {invites.length > 0 && (
          <div className="mt-4 border-t border-white/10 pt-3">
            <div className="eyebrow text-[10px]">Riding with you</div>
            {invites.map((i) => (
              <div key={i.email} className="mt-1.5 text-xs text-white/85">
                🔥 <b>{i.friend}</b> · {i.status === "sent" ? `invite emailed to ${i.email}` : `invite opened in your email app`}
                {i.pickup && <div className="truncate pl-5 text-[11px] text-white/55">pickup: {i.pickup}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
