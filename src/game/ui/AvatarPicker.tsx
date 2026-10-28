"use client";

import { AVATAR_KEY, PLAYER_AVATARS, useGame } from "../store";

// Bottom of the screen: pick who you are, a woman or a man (heads only, no names). That's the
// avatar you walk in and take part as. Female until you choose; kept on this browser.

/** A head and shoulders, drawn: long hair for her, short for him. */
function Head({ sex }: { sex: "f" | "m" }) {
  return (
    <svg viewBox="0 0 48 48" className="h-full w-full" aria-hidden>
      {/* shoulders */}
      <path d="M8 48c0-9 7-14 16-14s16 5 16 14z" fill="#f4c21a" opacity="0.9" />
      {sex === "f" && <path d="M12 26c-1-12 5-19 12-19s13 7 12 19c-1 5-3 9-4 10H16c-1-1-3-5-4-10z" fill="#1d140f" />}
      {/* neck and face */}
      <rect x="20.5" y="27" width="7" height="8" rx="3" fill="#9c6b4e" />
      <ellipse cx="24" cy="21" rx="8.2" ry="9.4" fill="#a8745a" />
      {sex === "m" ? (
        <path d="M15.6 19c0-6.5 3.8-10 8.4-10s8.4 3.5 8.4 10c-1.5-3.2-4.2-4.6-8.4-4.6s-6.9 1.4-8.4 4.6z" fill="#1d140f" />
      ) : (
        <path d="M15.8 20c.4-7 4-10.6 8.2-10.6S31.8 13 32.2 20c-2.6-4.4-6-6-8.2-6s-5.6 1.6-8.2 6z" fill="#1d140f" />
      )}
    </svg>
  );
}

/** `className` places it (it's centred at the bottom, above whatever else sits there). */
export function AvatarPicker({ className = "" }: { className?: string }) {
  const avatarId = useGame((s) => s.player.avatarId);
  const update = useGame((s) => s.updatePlayer);
  const pick = (id: string) => {
    update({ avatarId: id });
    try {
      localStorage.setItem(AVATAR_KEY, id);
    } catch {
      /* storage unavailable: for this visit only */
    }
  };
  return (
    <div className={`pointer-events-auto fixed z-20 flex gap-3 rounded-[4px] border border-white/15 bg-black/70 px-3 py-2 backdrop-blur ${className}`} role="radiogroup" aria-label="Your avatar">
      {(["f", "m"] as const).map((sex) => {
        const id = PLAYER_AVATARS[sex];
        const on = avatarId === id;
        return (
          <button
            key={sex}
            role="radio"
            aria-checked={on}
            aria-label={sex === "f" ? "Female avatar" : "Male avatar"}
            onClick={() => pick(id)}
            className={`flex flex-col items-center gap-1 transition ${on ? "" : "opacity-60 hover:opacity-100"}`}
          >
            <span className={`block h-14 w-14 overflow-hidden rounded-full border-2 bg-black ${on ? "border-gold" : "border-white/25"}`}>
              <Head sex={sex} />
            </span>
            <span className={`font-[family-name:var(--font-label)] text-[11px] font-medium uppercase tracking-[0.12em] ${on ? "text-gold" : "text-white/80"}`}>{sex === "f" ? "Female" : "Male"}</span>
          </button>
        );
      })}
    </div>
  );
}
