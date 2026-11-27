"use client";

import Link from "next/link";
import { PageContext } from "./Shell";

/**
 * A page of its own outside the game (/breakout, /merch): The Feast's name at the top, the card in
 * the middle, and the way into The Feast at the bottom. The site keeps the page itself still for the
 * game, so the frame scrolls on its own.
 */
export function PageFrame({ children, footer = true }: { children: React.ReactNode; /** The way to Get your Torch at the bottom (not on /register itself). */ footer?: boolean }) {
  return (
    <main className="fixed inset-0 overflow-y-auto overscroll-contain bg-royal-deep bg-[radial-gradient(ellipse_at_50%_0%,rgba(242,184,31,0.18),transparent_60%)] px-3 pb-10 pt-8 text-white sm:px-6">
      <Link href="/" className="mx-auto block w-fit text-center">
        <div className="text-[11px] tracking-[0.5em] text-white/70">THE FEAST 2026</div>
        <div className="gold-text mt-1 text-4xl font-black tracking-tight sm:text-5xl">THE TORCH</div>
        <div className="mt-1 text-[12px] text-white/60">11–13 December · The Fusion Centre, Ogba</div>
      </Link>
      <div className="mt-7 flex justify-center">
        <PageContext.Provider value={true}>{children}</PageContext.Provider>
      </div>
      {footer && (
        <Link href="/register" className="mx-auto mt-6 block w-fit text-[13px] text-white/75 underline-offset-4 hover:text-white hover:underline">
          Not registered yet? Get your torch at thefeast.wearethenew.org/register →
        </Link>
      )}
    </main>
  );
}
