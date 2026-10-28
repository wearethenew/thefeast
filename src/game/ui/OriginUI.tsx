"use client";

import { useEffect, useState } from "react";
import { FLY_THRESHOLD_KM, FUSION_CENTRE, INSTALLATIONS, distanceKm } from "../data/places";
import { useGame } from "../store";
import { GoToVenue } from "./DriveUI";
import { InviteFriend } from "./InviteFriend";

type Hit = { display_name: string; lat: string; lon: string };

function useSearch(q: string) {
  const [hits, setHits] = useState<Hit[]>([]);
  useEffect(() => {
    if (q.trim().length < 3) {
      setHits([]);
      return;
    }
    const ctrl = new AbortController();
    const id = setTimeout(() => {
      // OpenStreetMap Nominatim: fine for light use; swap for a hosted geocoder before launch.
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

export function OriginUI() {
  const origin = useGame((s) => s.origin);
  const setOrigin = useGame((s) => s.setOrigin);
  const depart = useGame((s) => s.departFromOrigin);
  const setStage = useGame((s) => s.setStage);
  const name = useGame((s) => s.player.name);
  const [q, setQ] = useState("");
  const hits = useSearch(q);
  const [locating, setLocating] = useState(false);
  const [inviting, setInviting] = useState(false);
  const invites = useGame((s) => s.invites);
  const invitedBy = useGame((s) => s.invitedBy);

  const km = origin ? Math.round(distanceKm(origin, FUSION_CENTRE)) : 0;
  const fly = km > FLY_THRESHOLD_KM;

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        setOrigin({ lat: p.coords.latitude, lon: p.coords.longitude, label: "Home", detail: "Your current location" });
      },
      () => setLocating(false),
      { timeout: 10000 },
    );
  };

  return (
    <div className="pointer-events-none fixed inset-0 flex flex-col justify-between p-4 sm:p-8">
      {inviting && <InviteFriend onClose={() => setInviting(false)} />}
      <div className="pointer-events-auto max-w-sm">
        {invitedBy && (
          <div className="mb-3 rounded-xl bg-gold/90 px-3 py-2 text-xs font-bold text-black">
            🔥 {invitedBy.from} invited you. The danfo picks you both up and you arrive together.
          </div>
        )}
        <button className="text-xs uppercase tracking-widest text-white/70 hover:text-white" onClick={() => setStage("create")}>
          ← Back
        </button>
        <h2 className="mt-3 text-2xl font-black sm:text-4xl">
          Where are you
          <br />
          <span className="gold-text">coming from{name ? `, ${name.split(" ")[0]}` : ""}?</span>
        </h2>
      </div>

      <div className="glass pointer-events-auto w-full rounded-2xl p-4 sm:w-96">
        <div className="mb-2 eyebrow text-[10px]">Your campus</div>
        <div className="grid grid-cols-4 gap-1.5">
          {INSTALLATIONS.map((i) => (
            <button
              key={i.id}
              onClick={() => setOrigin({ lat: i.lat, lon: i.lon, label: i.name, detail: `${i.venue}, ${i.address}`, installationId: i.id })}
              className={`rounded-lg border px-1.5 py-2 text-[11px] font-semibold ${origin?.installationId === i.id ? "border-gold bg-gold/25" : "border-white/15 bg-white/5 hover:bg-white/10"}`}
            >
              {i.name}
            </button>
          ))}
        </div>

        <div className="mb-2 mt-4 eyebrow text-[10px]">Or anywhere in the world</div>
        <div className="flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search your city or address"
            className="min-w-0 flex-1 rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-sm outline-none focus:border-gold"
          />
          <button onClick={useMyLocation} className="btn-ghost shrink-0 px-3 text-[10px]">
            {locating ? "…" : "📍 Me"}
          </button>
        </div>
        {hits.length > 0 && (
          <div className="mt-2 max-h-36 overflow-y-auto rounded-lg border border-white/10 bg-black/40">
            {hits.map((h) => (
              <button
                key={h.lat + h.lon}
                onClick={() => {
                  setOrigin({ lat: +h.lat, lon: +h.lon, label: h.display_name.split(",")[0], detail: h.display_name });
                  setQ("");
                }}
                className="block w-full truncate px-3 py-2 text-left text-xs hover:bg-white/10"
              >
                {h.display_name}
              </button>
            ))}
          </div>
        )}

        {origin && (
          <div className="mt-4 rounded-xl bg-black/30 p-3">
            <div className="text-sm font-bold">{origin.label}</div>
            <div className="truncate text-[11px] text-white/60">{origin.detail}</div>
            <div className="mt-2 text-xs text-white/85">
              {km < 2 ? (
                "You're already at the Fusion Centre!"
              ) : fly ? (
                <>
                  ✈️ {km.toLocaleString()} km · fly into <b>Murtala Muhammed Airport</b>, then take a cab to Ogba
                </>
              ) : (
                <>🚕 {km} km · drive across Lagos to Ogba</>
              )}
            </div>
            <button className="btn-gold mt-3 w-full py-3 text-xs" onClick={depart}>
              {fly ? "Board the flight →" : "Get in the cab →"}
            </button>
            <button className="btn-ghost mt-2 w-full py-2.5 text-[11px]" onClick={() => setInviting(true)}>
              🔥 Bring a friend {invites.length ? `(${invites.length} riding with you)` : ""}
            </button>
            <div className="mt-2 flex justify-center">
              <GoToVenue />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
