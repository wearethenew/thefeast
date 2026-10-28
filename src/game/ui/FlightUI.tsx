"use client";

import { FUSION_CENTRE, distanceKm } from "../data/places";
import { useGame } from "../store";
import { GoToVenue } from "./DriveUI";

export function FlightUI() {
  const origin = useGame((s) => s.origin);
  const t = useGame((s) => s.tele.flightT);
  const set = useGame((s) => s.set);
  const name = useGame((s) => s.player.name);
  if (!origin) return null;
  const km = Math.round(distanceKm(origin, FUSION_CENTRE));
  const hours = km / 800 + 0.5;
  const left = Math.max(0, hours * (1 - t));
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 flex justify-center p-4">
      <div className="glass pointer-events-auto w-full max-w-lg rounded-2xl px-5 py-4">
        <div className="flex items-center justify-between eyebrow text-[10px]">
          <span>TORCH Air · Flight TA1211</span>
          <span>Passenger: {name || "Guest"}</span>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <div>
            <div className="text-xl font-black">{origin.label}</div>
            <div className="text-[10px] text-white/60">Departure</div>
          </div>
          <div className="mx-3 h-px flex-1 bg-gradient-to-r from-white/20 via-gold to-white/20" />
          <div className="text-right">
            <div className="text-xl font-black">LOS</div>
            <div className="text-[10px] text-white/60">Murtala Muhammed Intl.</div>
          </div>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-gradient-to-r from-flame to-gold" style={{ width: `${t * 100}%` }} />
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-white/70">
          <span>
            {km.toLocaleString()} km · {left >= 1 ? `${Math.floor(left)}h ${Math.round((left % 1) * 60)}m` : `${Math.round(left * 60)}m`} remaining
          </span>
          <span className="flex items-center gap-3">
            <button className="text-gold underline-offset-2 hover:underline" onClick={() => set({ stage: "drive", flightPhase: "approach", route: "airport" })}>
              Skip to landing →
            </button>
          </span>
        </div>
        <div className="mt-2 flex justify-end">
          <GoToVenue />
        </div>
      </div>
    </div>
  );
}
