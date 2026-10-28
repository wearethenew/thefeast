"use client";

import { useState } from "react";
import { useGame } from "../store";

// The torch is the first thing everyone does: any form that sends someone's details (a merch
// pre-order, volunteering, a prize claim, a testimony) can be filled in, but sending it asks for
// the torch first. Their registration then supplies the name, email and phone, and they come
// straight back to the form they were on.

/** Send them to Get your Torch, and back to `back` (a booth panel id) afterwards. */
export function askForTorch(back: string | null) {
  useGame.getState().set({ torchReturn: back, panel: "register" });
}

/** What these forms send about the person: from their registration. */
export function whoIs() {
  const r = useGame.getState().registered;
  return { name: r?.name ?? r?.firstName ?? "", email: r?.email ?? "", phone: r?.phone ?? "", code: r?.code ?? "" };
}

/** The note shown when someone tries to send a form without their torch. */
export function TorchFirst({ what, back, onGo }: { what: string; back: string | null; onGo?: () => void }) {
  return (
    <div className="rounded-[2px] border border-gold/60 bg-gold/10 p-3.5 text-[14px] sm:text-[13px]">
      <div className="font-bold text-gold">Get your torch first 🔥</div>
      <p className="mt-1 text-white/85">
        Everything at The Feast 2026 starts with your torch. Register (it&apos;s free and takes a minute), then come back to {what}: we&apos;ll keep what you&apos;ve
        picked here.
      </p>
      <button
        type="button"
        className="btn-gold mt-3 w-full py-3 text-[14px]"
        onClick={() => {
          onGo?.();
          askForTorch(back);
        }}
      >
        Get your Torch first →
      </button>
    </div>
  );
}

/** Form state that survives the trip to Get your Torch and back (kept for this visit). */
const drafts = new Map<string, unknown>();
export function useDraft<T>(key: string, init: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => (drafts.has(key) ? (drafts.get(key) as T) : init));
  return [
    v,
    (next: T) => {
      drafts.set(key, next);
      setV(next);
    },
  ];
}
