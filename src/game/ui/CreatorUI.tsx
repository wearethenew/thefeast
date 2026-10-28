"use client";

import { AVATARS, ROBES, SKIN_TONES } from "../data/avatars";
import { useGame } from "../store";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 first:mt-0">
      <div className="mb-2 eyebrow text-[10px]">{title}</div>
      {children}
    </div>
  );
}

export function CreatorUI() {
  const player = useGame((s) => s.player);
  const update = useGame((s) => s.updatePlayer);
  const setStage = useGame((s) => s.setStage);
  const ready = player.name.trim().length > 1;

  return (
    <div className="pointer-events-none fixed inset-0 flex flex-col justify-between p-4 sm:flex-row sm:p-8">
      <div className="pointer-events-auto">
        <button className="text-xs uppercase tracking-widest text-white/70 hover:text-white" onClick={() => setStage("title")}>
          ← Back
        </button>
        <h2 className="mt-3 text-2xl font-black sm:text-4xl">
          Who&apos;s carrying
          <br />
          <span className="gold-text">the torch?</span>
        </h2>
        <p className="mt-2 max-w-xs text-xs text-white/70 sm:text-sm">Pick your look and robe. Drag to turn around.</p>
      </div>

      <div className="glass pointer-events-auto max-h-[52vh] w-full overflow-y-auto rounded-2xl p-4 sm:max-h-none sm:w-80 sm:self-center">
        <Section title="Your name">
          <input
            value={player.name}
            onChange={(e) => update({ name: e.target.value.slice(0, 24) })}
            placeholder="e.g. Ada"
            className="w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-sm outline-none focus:border-gold"
          />
        </Section>

        <Section title="Character">
          <div className="grid grid-cols-3 gap-2">
            {AVATARS.map((a) => (
              <button
                key={a.id}
                onClick={() => update({ avatarId: a.id, skin: a.sex === "f" ? SKIN_TONES[3] : SKIN_TONES[0] })}
                className={`rounded-lg border px-2 py-2 text-xs font-semibold ${player.avatarId === a.id ? "border-gold bg-gold/20" : "border-white/15 bg-white/5 hover:bg-white/10"}`}
              >
                {a.label}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Skin tone">
          <div className="flex gap-2">
            {SKIN_TONES.map((t) => (
              <button
                key={t}
                aria-label={`Skin tone ${t}`}
                onClick={() => update({ skin: t })}
                className={`h-8 w-8 rounded-full border-2 ${player.skin === t ? "border-gold" : "border-white/20"}`}
                style={{ background: t === "#ffffff" ? "linear-gradient(135deg,#a8774f,#5a3622)" : t }}
              />
            ))}
          </div>
          <div className="mt-1 text-[10px] text-white/50">First swatch keeps the character&apos;s own tone.</div>
        </Section>

        <Section title="Robe">
          <div className="grid grid-cols-2 gap-2">
            {ROBES.map((r) => (
              <button
                key={r.id}
                onClick={() => update({ robeId: r.id })}
                className={`flex items-center gap-2 rounded-lg border px-2 py-2 text-xs font-semibold ${player.robeId === r.id ? "border-gold bg-gold/20" : "border-white/15 bg-white/5 hover:bg-white/10"}`}
              >
                <span className="h-4 w-4 rounded-full border border-gold/70" style={{ background: r.velvet }} />
                {r.label}
              </button>
            ))}
          </div>
          <label className="mt-3 flex items-center gap-2 text-xs">
            <input type="checkbox" checked={player.hoodUp} onChange={(e) => update({ hoodUp: e.target.checked })} className="accent-amber-400" />
            Hood up
          </label>
        </Section>

        <div className="mt-5 flex flex-col gap-2">
          {!player.torchLit ? (
            <button className="btn-gold py-3 text-xs" onClick={() => update({ torchLit: true })}>
              🔥 Light my torch
            </button>
          ) : (
            <button className="btn-gold py-3 text-xs" disabled={!ready} onClick={() => setStage("origin")}>
              {ready ? "Start my journey →" : "Add your name to continue"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
