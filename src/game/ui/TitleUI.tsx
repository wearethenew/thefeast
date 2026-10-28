"use client";

import { LogoBadge } from "../brand";
import { useGame } from "../store";

/** Over the opening film: the Feast and THE TORCH, the shot caption, and the way in. */
export function TitleUI() {
  const set = useGame((s) => s.set);
  const shot = useGame((s) => s.procShot);
  const invitedBy = useGame((s) => s.invitedBy);
  const panel = useGame((s) => s.panel);
  const freeCam = useGame((s) => s.freeCam);
  const join = () => set({ stage: "venue", spawnAt: "street", arrived: true, venueSpot: null, seated: false });
  return (
    <div className="pointer-events-none fixed inset-0">
      {/* each cut dips through black */}
      <div key={"cut-" + shot?.id} className="absolute inset-0 animate-[cut_0.8s_ease-out_forwards] bg-black" />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />
      <header className={`absolute inset-x-0 top-0 flex items-start justify-between p-5 transition-opacity sm:p-8 ${panel ? "opacity-0" : ""}`}>
        <div className="leading-none">
          <div className="text-[11px] tracking-[0.55em] text-white/85">THE</div>
          <div className="text-2xl font-semibold tracking-[0.35em]">FEAST 2026</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right text-xs font-semibold tracking-[0.2em] text-white/85">THE NEW</div>
          <LogoBadge size={38} />
        </div>
      </header>

      {shot && !panel && (
        <div key={shot.id} className="absolute left-5 top-28 max-w-[min(90vw,520px)] animate-[rise_0.9s_ease-out_both] sm:left-8 sm:top-32">
          <div className="mb-1 h-0.5 w-12 bg-gradient-to-r from-flame to-gold" />
          <div className="text-2xl font-black leading-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)] sm:text-3xl">{shot.title}</div>
          <div className="mt-0.5 text-xs text-white/85 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)] sm:text-sm">{shot.sub}</div>
        </div>
      )}

      {freeCam && !panel && (
        <button className="btn-gold pointer-events-auto absolute bottom-24 right-4 px-4 py-2.5 text-xs sm:bottom-6 sm:right-6" onClick={() => set({ freeCam: false })}>
          ⟲ Reset view
        </button>
      )}
      <main className={`absolute inset-x-0 bottom-0 flex flex-col items-center text-center transition-opacity ${shot?.id === "fusion" ? "p-3 sm:p-5" : "p-5 sm:p-8"} ${panel ? "pointer-events-none opacity-0" : ""}`}>
        {invitedBy && (
          <div className="pointer-events-auto mb-3 rounded-full bg-gold px-4 py-2 text-xs font-extrabold text-black shadow-lg">
            🔥 {invitedBy.from} invited you, {invitedBy.friend}. Get your torch and walk in together.
          </div>
        )}
        {shot?.id === "fusion" ? (
          // over the Fusion Centre: the booths' own buttons are the way in, so keep the screen clear:
          // just the way through the gate, and a line of small print under it
          <div className="flex flex-col items-center gap-2">
            <button className="btn-gold pointer-events-auto whitespace-nowrap px-5 py-2.5 text-[12px] shadow-lg" onClick={join}>
              Enter through the gate →
            </button>
            <div className="text-[10px] text-white/70 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] sm:text-[11px]">
              Drag to explore · tap a booth to register, pre-order merch or play a game
            </div>
          </div>
        ) : (
          <>
            <div className="text-xs tracking-[0.6em] text-white/85 sm:text-sm">THE</div>
            <h1 className="gold-text text-7xl font-black leading-[0.85] tracking-tight drop-shadow-[0_6px_30px_rgba(255,150,40,0.35)] sm:text-8xl">TORCH</h1>
            <div className="mt-2 text-sm font-semibold text-white/90">Dec 11th – 13th, 2026 · The Fusion Centre, Ogba, Lagos</div>
            <button className="pointer-events-auto mt-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70 underline-offset-4 hover:text-white hover:underline" onClick={() => set({ skipFilm: useGame.getState().skipFilm + 1 })}>
              Skip to the Fusion Centre ›
            </button>
          </>
        )}
      </main>
    </div>
  );
}
