"use client";

import dynamic from "next/dynamic";

// the loading card from the very first moment, while the game's code is still downloading
function Booting() {
  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex flex-col items-center justify-center bg-royal-deep/90">
      <div className="text-xs tracking-[0.5em] text-white/70">THE FEAST 2026</div>
      <div className="gold-text mt-2 text-5xl font-black tracking-tight">THE TORCH</div>
      <div className="mt-8 h-1 w-56 overflow-hidden rounded-full bg-white/10">
        <div className="h-full w-[4%] bg-gradient-to-r from-flame to-gold" />
      </div>
      <div className="mt-3 text-xs text-white/50">Lighting the way…</div>
    </div>
  );
}

const Game = dynamic(() => import("@/game/Game"), { ssr: false, loading: Booting });

export default function Home() {
  return <Game />;
}
