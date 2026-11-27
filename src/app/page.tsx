"use client";

import dynamic from "next/dynamic";

// the loading card from the very first moment, while the game's code is still downloading: the
// same card (and the same words) the game's own loader carries on with, so it reads as one
function Booting() {
  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex flex-col items-center justify-center bg-royal-deep/90">
      <div className="text-xs tracking-[0.5em] text-white/70">THE FEAST 2026</div>
      <div className="gold-text mt-2 text-5xl font-black tracking-tight">THE TORCH</div>
      <div className="mt-8 h-1 w-56 overflow-hidden rounded-full bg-white/10">
        <div className="h-full w-[4%] bg-gradient-to-r from-flame to-gold" />
      </div>
      <div className="mt-3 text-xs text-white/50">Bringing great joy to the city…</div>
      {/* while it loads: can't wait? register now (its own light page); registered already, a breakout session */}
      <div className="pointer-events-auto mt-10 flex flex-col items-center gap-3 text-center">
        <div className="text-[13px] text-white/75">Can&apos;t wait?</div>
        <a href="/register" className="btn-gold px-7 py-3 text-[14px]">
          Register now 🔥
        </a>
        <a href="/breakout" className="text-[12px] text-white/70 underline-offset-4 hover:text-white hover:underline">
          Registered already? Book your breakout session →
        </a>
      </div>
    </div>
  );
}

const Game = dynamic(() => import("@/game/Game"), { ssr: false, loading: Booting });

export default function Home() {
  return <Game />;
}
