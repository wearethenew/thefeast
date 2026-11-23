"use client";

import { createContext, useContext } from "react";

/** On a booth's board (3D, in the world) the panel is a plain card; otherwise a modal overlay. */
export const BoardContext = createContext(false);
/** On a page of its own (/breakout, /merch): a card in the middle of the page, not an overlay. */
export const PageContext = createContext(false);

export function Shell({ kicker, title, onClose, wide, children }: { kicker: string; title: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  const onBoard = useContext(BoardContext);
  const onPage = useContext(PageContext);
  const card = (
    <div className={`glass w-full rounded-2xl p-5 sm:p-6 ${onBoard ? "h-full overflow-y-auto" : onPage ? (wide ? "max-w-2xl" : "max-w-md") : `max-h-[92dvh] overflow-y-auto overscroll-contain ${wide ? "max-w-2xl" : "max-w-md"}`}`} onClick={(e) => e.stopPropagation()}>
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
  if (onBoard || onPage) return card;
  return (
    <div className="pointer-events-auto fixed inset-0 z-30 flex items-end justify-center bg-black/50 p-3 sm:items-center" onClick={onClose}>
      {card}
    </div>
  );
}

export const field = "h-12 w-full rounded-[2px] border border-white/15 bg-white/[0.06] px-3.5 text-base outline-none transition placeholder:text-white/40 hover:border-white/40 focus:border-gold";
export const label = "mb-1.5 block font-[family-name:var(--font-label)] text-[12px] font-medium uppercase tracking-[0.08em] text-white/60";

export async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({ ok: false, error: "Something went wrong" }));
  if (!data.ok) throw new Error(data.error ?? "Something went wrong");
  return data;
}
