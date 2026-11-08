"use client";

import { useEffect, useRef, useState } from "react";
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

/** `className` places it (it's centred at the bottom, above whatever else sits there); `compact` on phones. */
export function AvatarPicker({ className = "", compact = false }: { className?: string; compact?: boolean }) {
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
  const ref = useRef<HTMLDivElement>(null);
  const covered = useCovered(ref);
  return (
    <div ref={ref} aria-hidden={covered || undefined} className={`${covered ? "invisible pointer-events-none" : "pointer-events-auto"} fixed z-20 flex rounded-[4px] border border-white/15 bg-black/70 backdrop-blur ${compact ? "gap-2 px-2 py-1.5" : "gap-3 px-3 py-2"} ${className}`} role="radiogroup" aria-label="Your avatar">
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
            <span className={`block overflow-hidden rounded-full border-2 bg-black ${compact ? "h-9 w-9" : "h-14 w-14"} ${on ? "border-gold" : "border-white/25"}`}>
              <Head sex={sex} />
            </span>
            <span className={`font-[family-name:var(--font-label)] font-medium uppercase tracking-[0.12em] ${compact ? "text-[9px]" : "text-[11px]"} ${on ? "text-gold" : "text-white/80"}`}>{sex === "f" ? "Female" : "Male"}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Does r overlap q (with a few pixels' margin)? */
const overlaps = (r: DOMRect, q: DOMRect, m = 6) =>
  r.left < q.right + m && r.right > q.left - m && r.top < q.bottom + m && r.bottom > q.top - m;

/** Something you can see: text of its own, a background, a border or a picture. */
function drawn(el: Element) {
  if (el instanceof HTMLImageElement || el instanceof HTMLVideoElement || el instanceof HTMLIFrameElement || el instanceof SVGSVGElement) return true;
  for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent!.trim()) return true;
  const cs = getComputedStyle(el);
  const solid = (c: string) => c && c !== "transparent" && !/rgba\([^)]*,\s*0\)$/.test(c);
  return solid(cs.backgroundColor) || cs.backgroundImage !== "none" || (parseFloat(cs.borderTopWidth) > 0 && solid(cs.borderTopColor));
}

function shown(el: Element) {
  for (let e: Element | null = el; e && e !== document.body; e = e.parentElement) {
    const cs = getComputedStyle(e);
    if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) < 0.05) return false;
  }
  return true;
}

/**
 * Is any other card, prompt or button on screen where the picker sits? Then the picker steps
 * aside (it's hidden, not moved, until that's gone). The 3D scene, and the name tags that float
 * over it, don't count.
 */
function useCovered(ref: React.RefObject<HTMLDivElement | null>) {
  const [covered, setCovered] = useState(false);
  useEffect(() => {
    const check = () => {
      const me = ref.current;
      if (!me) return;
      const r = me.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight;
      const scene = document.querySelector("canvas")?.parentElement?.parentElement ?? null;
      let hit = false;
      for (const el of document.body.querySelectorAll("*")) {
        if (me.contains(el) || el.contains(me) || (scene && scene.contains(el))) continue;
        if (el instanceof HTMLCanvasElement || el.tagName === "SCRIPT" || el.tagName === "STYLE") continue;
        const q = el.getBoundingClientRect();
        if (q.width < 2 || q.height < 2 || !overlaps(r, q)) continue;
        // layout layers spread over the whole screen aren't cards
        if (q.width * q.height > vw * vh * 0.6) continue;
        if (!drawn(el) || !shown(el)) continue;
        hit = true;
        break;
      }
      setCovered(hit);
    };
    check();
    const id = window.setInterval(check, 300);
    window.addEventListener("resize", check);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", check);
    };
  }, [ref]);
  return covered;
}
