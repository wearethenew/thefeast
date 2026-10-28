"use client";

import { Html } from "@react-three/drei";
import { useGame } from "../store";
import { COMPOUND, HALL, MAIN_DOOR, TENTS } from "./compound";

// Buttons pinned to the booths (and Join the Feast on the Fusion Centre itself): they sit on their
// spot in the world and move with the camera, so from the aerial view every one is on screen.

const ICON: Record<string, string> = { register: "🔥", merch: "🛍️", game: "🎮", give: "💛", travel: "🧭", lodging: "🛏️", volunteer: "🙌" };

export function BoothButtons() {
  const set = useGame((s) => s.set);
  const stage = useGame((s) => s.stage);
  const shot = useGame((s) => s.procShot?.id);
  const panel = useGame((s) => s.panel);
  const inHall = useGame((s) => s.zone === "hall");
  // out of the way while a booth's board is open, and inside the hall (the booths are outside)
  if (panel || inHall) return null;
  // in the opening film only once the camera is over the Fusion Centre; always while walking
  if (stage === "title" ? shot !== "fusion" : stage !== "venue") return null;
  return (
    <group position={[COMPOUND.center[0], 0, COMPOUND.center[1]]} rotation-y={COMPOUND.rotation}>
      {TENTS.map((t) => {
        const big = t.id === "register" || t.id === "merch";
        return (
          <Html key={t.id} position={[t.x, t.w > 4 ? 7.6 : 4.4, t.z]} center zIndexRange={[20, 10]}>
            <button
              onClick={() => set({ panel: t.id })}
              className={`whitespace-nowrap rounded-[2px] font-bold uppercase tracking-[0.02em] transition hover:scale-105 ${
                big ? "btn-gold animate-[bob_2.4s_ease-in-out_infinite] px-5 py-3 text-sm" : "border border-white/25 bg-black/85 px-3.5 py-2 text-xs text-white"
              }`}
            >
              {ICON[t.id]} {t.id === "register" ? "Get your Torch" : t.id === "merch" ? "Pre-order your Merch" : t.label}
            </button>
          </Html>
        );
      })}
      {stage === "title" && <Html position={[MAIN_DOOR.x, HALL.h + 2.4, HALL.z1 + 0.5]} center zIndexRange={[20, 10]}>
        <button
          onClick={() => set({ stage: "venue", spawnAt: "door", arrived: true, venueSpot: null, seated: false, panel: null })}
          className="btn-gold flex items-center gap-2 whitespace-nowrap px-5 py-3 text-sm transition hover:scale-105"
        >
          🔥 Join the Feast
        </button>
      </Html>}
    </group>
  );
}
