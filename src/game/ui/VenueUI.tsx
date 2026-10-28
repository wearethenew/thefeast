"use client";

import { useEffect, useRef, useState } from "react";
import { TorchFirst, useDraft, whoIs } from "./torchFirst";
import { MINISTERS } from "../data/ministers";
import { FUSION_CENTRE } from "../data/places";
import { input } from "../input";
import { useGame } from "../store";
import { SPOTS } from "../world/Venue";
import { InviteFriend } from "./InviteFriend";

// Overlay for the Fusion Centre: interaction prompts, the desks' panels, the pass, and the
// minister video picker once you are seated in the hall.

const TEAMS = [
  "Ushering & Protocol",
  "Media & Livestream",
  "The New Music",
  "Treasureville (Kids)",
  "The New Teens",
  "Prayer (Gethsemane)",
  "Hospitality",
  "Parking & Security",
  "Sanitation",
  "Medical",
];

const MAPS_LINK = "https://maps.app.goo.gl/rUMHaDxTcyPGgPUr6";

function Panel({
  title,
  kicker,
  onClose,
  wide,
  children,
}: {
  title: string;
  kicker: string;
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="pointer-events-auto fixed inset-0 z-20 flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <div
        className={`glass max-h-[86vh] w-full overflow-y-auto rounded-2xl p-5 ${wide ? "max-w-2xl" : "max-w-md"}`}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="eyebrow text-[11px]">{kicker}</div>
            <div className="brand-title mt-1 text-3xl">{title}</div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full px-2 text-lg text-white/60 hover:text-white"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="mt-3 text-sm text-white/85">{children}</div>
      </div>
    </div>
  );
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem("torch:" + key, JSON.stringify(value));
  } catch {
    /* storage unavailable: keep it in memory only */
  }
}

/** The venue as Google Maps knows it (the church's own listing). */
const VENUE_Q =
  "The New Church, 60A Surulere Industrial Avenue, Ogba, Ikeja, Lagos";
/** Where people set off from: the airport, the New Church campuses, and the road from the north. */
const ORIGINS = [
  {
    id: "airport",
    label: "✈️ Lagos airport",
    q: "Murtala Muhammed International Airport, Ikeja, Lagos",
    note: "About 6 km: 20 to 40 minutes depending on traffic. Bolt, Uber and airport taxis all serve Ikeja.",
  },
  {
    id: "island",
    label: "Victoria Island",
    q: "Red Carpet Event Centre, Oniru, Victoria Island, Lagos",
    note: "Over the Third Mainland Bridge or Ikorodu Road: allow an hour or more at rush hour.",
  },
  {
    id: "yaba",
    label: "Yaba",
    q: "Jibowu Street, Yaba, Lagos",
    note: "Straight up Ikorodu Road to Ikeja: 30 to 50 minutes.",
  },
  {
    id: "ibadan",
    label: "Ibadan",
    q: "Akala Expressway, Ibadan",
    note: "Lagos–Ibadan Expressway into Ikeja via Ojota or the Berger end: about 2 hours.",
  },
  {
    id: "ife",
    label: "Ile-Ife",
    q: "Parakin, Ile-Ife",
    note: "Via Ibadan and the Lagos–Ibadan Expressway: about 3½ to 4 hours.",
  },
  {
    id: "akure",
    label: "Akure",
    q: "FUTA South Gate, Akure",
    note: "Via Ife, Ibadan and the expressway: about 5 to 6 hours.",
  },
];

/** A live Google map in the panel (no key needed for these embeds). */
function MapFrame({ src, title }: { src: string; title: string }) {
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-white/15 bg-black/30">
      <iframe
        key={src}
        src={src}
        title={title}
        className="block h-[320px] w-full border-0"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
      />
    </div>
  );
}

const tab = (on: boolean) =>
  `rounded-[2px] border px-3 py-1.5 uppercase tracking-[0.02em] text-[11px] font-bold transition ${on ? "border-gold bg-gold text-black" : "border-white/20 bg-black/30 hover:border-white/50"}`;

function TravelDesk({ onClose }: { onClose: () => void }) {
  const [from, setFrom] = useState(ORIGINS[0]);
  const embed = `https://maps.google.com/maps?${new URLSearchParams({ saddr: from.q, daddr: VENUE_Q, output: "embed" })}`;
  const open = `https://www.google.com/maps/dir/?${new URLSearchParams({ api: "1", origin: from.q, destination: VENUE_Q, travelmode: "driving" })}`;
  return (
    <Panel
      kicker="Travel Desk"
      title="Getting to the Fusion Centre"
      onClose={onClose}
      wide
    >
      <p className="text-[12px] text-white/70">
        Where are you coming from? The route and live drive time are from Google
        Maps.
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {ORIGINS.map((o) => (
          <button
            key={o.id}
            className={tab(o.id === from.id)}
            onClick={() => setFrom(o)}
          >
            {o.label}
          </button>
        ))}
      </div>
      <MapFrame
        src={embed}
        title={`Route from ${from.label} to the Fusion Centre`}
      />
      <p className="mt-2 text-[12px]">
        {from.note} Set your drop-off to &ldquo;The New Fusion Centre,
        Ogba&rdquo;.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <a
          className="btn-gold block py-3 text-center text-xs"
          href={open}
          target="_blank"
          rel="noreferrer"
        >
          Open this route in Google Maps
        </a>
        <a
          className="btn-ghost block py-3 text-center text-[11px]"
          href={MAPS_LINK}
          target="_blank"
          rel="noreferrer"
        >
          The Fusion Centre on the map
        </a>
      </div>
    </Panel>
  );
}

/** Places to stay near the Fusion Centre (suggestions, not partners: the church will list those). */
const STAYS = [
  {
    name: "Excellence Hotel & Conference Centre",
    area: "Ogba",
    note: "In Ogba itself, a few minutes from the venue",
  },
  {
    name: "Pearlwood Hotel & Suites",
    area: "Ogba",
    note: "Ogba, close to the venue",
  },
  {
    name: "The Dover Hotel",
    area: "Ikeja",
    note: "Ikeja, about 10 minutes away",
  },
  {
    name: "Radisson Blu Hotel Lagos Ikeja",
    area: "Ikeja GRA",
    note: "Ikeja GRA, about 15 minutes away",
  },
  {
    name: "Sheraton Lagos Hotel",
    area: "Ikeja",
    note: "Mobolaji Bank Anthony Way, about 15 minutes away",
  },
  {
    name: "Lagos Airport Hotel",
    area: "Ikeja",
    note: "Handy if you're flying in",
  },
];
const MORE = {
  name: "Short-lets & more",
  area: "Map",
  note: "Short-let apartments and every hotel around Ogba and Ikeja",
};

function LodgingDesk({ onClose }: { onClose: () => void }) {
  const [pick, setPick] = useState<(typeof STAYS)[number] | typeof MORE>(
    STAYS[0],
  );
  const near = `${FUSION_CENTRE.lat},${FUSION_CENTRE.lon}`;
  const where = `${pick.name}, ${pick.area}, Lagos`;
  // the Feast weekend: arrive Thursday, leave Monday
  const dates = {
    checkin: "2026-12-10",
    checkout: "2026-12-14",
    group_adults: "1",
    no_rooms: "1",
  };
  const booking = `https://www.booking.com/searchresults.html?${new URLSearchParams({ ss: pick === MORE ? "Ikeja, Lagos, Nigeria" : where, ...dates })}`;
  const src =
    pick === MORE
      ? `https://maps.google.com/maps?${new URLSearchParams({ q: "short let apartments and hotels", ll: near, z: "14", output: "embed" })}`
      : `https://maps.google.com/maps?${new URLSearchParams({ q: where, z: "15", output: "embed" })}`;
  const route = `https://www.google.com/maps/dir/?${new URLSearchParams({ api: "1", origin: where, destination: VENUE_Q, travelmode: "driving" })}`;
  return (
    <Panel
      kicker="Lodging Desk"
      title="Somewhere to stay"
      onClose={onClose}
      wide
    >
      <p className="text-[12px] text-white/70">
        Places near the Fusion Centre for the Feast weekend (10 to 14 Dec). Pick
        one to see it on the map, check prices or get the route.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1.25fr]">
        <div className="flex flex-col gap-1.5">
          {[...STAYS, MORE].map((h) => (
            <button
              key={h.name}
              onClick={() => setPick(h)}
              className={`rounded-[2px] border px-3 py-2 text-left transition ${h === pick ? "border-gold bg-gold/15" : "border-white/15 bg-white/[0.04] hover:border-white/40"}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-bold leading-tight">
                  {h.name}
                </span>
                <span className="eyebrow shrink-0 text-[9px]">{h.area}</span>
              </div>
              <div className="mt-0.5 text-[11px] text-white/60">{h.note}</div>
            </button>
          ))}
        </div>
        <div>
          <div className="overflow-hidden rounded border border-white/15 bg-black/30">
            <iframe
              key={src}
              src={src}
              title={pick.name}
              className="block h-[300px] w-full border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <a
              className="btn-gold block py-3 text-center text-[11px]"
              href={booking}
              target="_blank"
              rel="noreferrer"
            >
              Check prices
            </a>
            {pick === MORE ? (
              <a
                className="btn-ghost block py-3 text-center text-[11px]"
                href={`https://www.google.com/maps/search/short+let+apartments/@${near},15z`}
                target="_blank"
                rel="noreferrer"
              >
                Open in Google Maps
              </a>
            ) : (
              <a
                className="btn-ghost block py-3 text-center text-[11px]"
                href={route}
                target="_blank"
                rel="noreferrer"
              >
                Route to the venue
              </a>
            )}
          </div>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-white/50">
        Suggestions only: confirm prices and availability when you book. Partner
        hotels and member &ldquo;Open Home&rdquo; hosting will be listed here
        once the church confirms them.
      </p>
    </Panel>
  );
}

export function TentPanel({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const [teams, setTeamsRaw] = useDraft<string[]>("volunteer:teams", []);
  const setTeams = (f: (x: string[]) => string[]) => setTeamsRaw(f(teams));
  const [sent, setSent] = useState(false);
  const registered = useGame((s) => s.registered);
  const [needTorch, setNeedTorch] = useState(false);
  if (id === "travel") return <TravelDesk onClose={onClose} />;
  if (id === "lodging") return <LodgingDesk onClose={onClose} />;
  if (id === "volunteer")
    return (
      <Panel
        kicker="Volunteer HQ"
        title="Serve at The Feast 2026"
        onClose={onClose}
      >
        {sent ? (
          <p>
            🙌 Thank you! Your interest in {teams.join(", ")} is saved. The
            Service Teams will reach out before the Feast.
          </p>
        ) : (
          <>
            <p>Pick the teams you&apos;d like to serve on:</p>
            <div className="mt-3 grid grid-cols-2 gap-1.5">
              {TEAMS.map((t) => (
                <button
                  key={t}
                  onClick={() =>
                    setTeams((x) =>
                      x.includes(t) ? x.filter((y) => y !== t) : [...x, t],
                    )
                  }
                  className={`rounded-lg border px-2 py-2 text-left text-[11px] font-semibold ${teams.includes(t) ? "border-gold bg-gold/25" : "border-white/15 bg-white/5"}`}
                >
                  {t}
                </button>
              ))}
            </div>
            {needTorch && !registered ? (
              <div className="mt-4">
                <TorchFirst what="Volunteer HQ" back="volunteer" />
              </div>
            ) : (
              <button
                className="btn-gold mt-4 w-full py-3 text-xs"
                disabled={!teams.length}
                onClick={async () => {
                  // the Service Teams can only reach a torch-bearer
                  if (!registered) return setNeedTorch(true);
                  const me = whoIs();
                  save("volunteer", { teams, at: Date.now() });
                  await fetch("/api/volunteer", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      name: me.name,
                      contact: [me.email, me.phone, me.code].filter(Boolean).join(" · "),
                      teams,
                    }),
                  }).catch(() => {});
                  setSent(true);
                }}
              >
                Count me in
              </button>
            )}
          </>
        )}
      </Panel>
    );
  if (id === "market")
    return (
      <Panel
        kicker="Feast Market"
        title="Food, merch & vendors"
        onClose={onClose}
      >
        <p>
          TORCH merch, food and vendors will be set up in the car park across
          all three days.
        </p>
        <p className="mt-2 text-[11px] text-white/60">
          Vendor list and applications will open here.
        </p>
      </Panel>
    );
  return (
    <Panel kicker="Give" title="Partner with The Feast 2026" onClose={onClose}>
      <p>Help keep The Feast 2026 free for everyone who comes.</p>
      <a
        className="btn-gold mt-4 block py-3 text-center text-xs"
        href="https://wearethenew.org"
        target="_blank"
        rel="noreferrer"
      >
        Give via wearethenew.org
      </a>
    </Panel>
  );
}

function TestimonyPanel({ onClose }: { onClose: () => void }) {
  const [text, setText] = useDraft("testimony:text", "");
  const [done, setDone] = useState(false);
  const registered = useGame((s) => s.registered);
  const [needTorch, setNeedTorch] = useState(false);
  return (
    <Panel
      kicker="Hall of Torches"
      title="Share what God has done"
      onClose={onClose}
    >
      {done ? (
        <p>🔥 Your testimony has been added to the Hall of Torches.</p>
      ) : (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="Your testimony…"
            className="w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-sm outline-none focus:border-gold"
          />
          {needTorch && !registered ? (
            <div className="mt-3">
              <TorchFirst what="your testimony" back={null} onGo={onClose} />
            </div>
          ) : (
            <button
              className="btn-gold mt-3 w-full py-3 text-xs"
              disabled={text.trim().length < 5}
              onClick={async () => {
                if (!registered) return setNeedTorch(true);
                save("testimony", { text, at: Date.now() });
                await fetch("/api/testimony", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name: whoIs().name, text }),
                }).catch(() => {});
                setDone(true);
              }}
            >
              Post testimony
            </button>
          )}
        </>
      )}
    </Panel>
  );
}

function CourtPanel({ onClose }: { onClose: () => void }) {
  const [inviting, setInviting] = useState(false);
  if (inviting) return <InviteFriend onClose={onClose} />;
  return (
    <Panel kicker="Torch Relay" title="Pass the fire" onClose={onClose}>
      <p>
        Every friend you invite lights a new torch on the Feast map. Share your
        link and see how many torches you can light before 11 December.
      </p>
      <button
        className="btn-gold mt-4 w-full py-3 text-xs"
        onClick={() => setInviting(true)}
      >
        Invite a friend by email
      </button>
      <button
        className="btn-ghost mt-2 w-full py-3 text-[11px]"
        onClick={() => {
          const url =
            typeof window !== "undefined"
              ? window.location.origin
              : "https://thefeast.wearethenew.org";
          const text =
            "I'm carrying the torch to The Feast 2026 (11–13 Dec, The Fusion Centre, Ogba). Light yours:";
          if (navigator.share)
            navigator
              .share({ title: "The Feast 2026 · The Torch", text, url })
              .catch(() => {});
          else navigator.clipboard?.writeText(`${text} ${url}`);
        }}
      >
        Pass the fire (share)
      </button>
    </Panel>
  );
}

function MinisterPicker() {
  const now = useGame((s) => s.nowPlaying);
  const set = useGame((s) => s.set);
  const play = (minister: string, video: string) =>
    set({ nowPlaying: { minister, video } });
  return (
    <>
      <PhonePicker
        now={now?.video}
        play={play}
        standUp={() => set({ seated: false })}
      />
      <div className="pointer-events-auto absolute bottom-3 left-1/2 hidden w-[min(96vw,760px)] -translate-x-1/2 sm:block">
        <div className="glass rounded-2xl p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="eyebrow text-[10px]">On the LED wall</div>
            <button
              className="btn-ghost px-3 py-1 text-[10px]"
              onClick={() => set({ seated: false })}
            >
              Stand up
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {MINISTERS.map((m) => (
              <div key={m.id} className="rounded-xl bg-black/30 p-2">
                <div className="font-script text-base leading-none text-gold">
                  {m.title}
                </div>
                <div className="text-xs font-bold uppercase">{m.name}</div>
                <div className="mt-1.5 flex flex-col gap-1">
                  {m.videos.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => play(m.id, v.id)}
                      className={`truncate rounded-md px-2 py-1 text-left text-[11px] ${now?.video === v.id ? "bg-gold text-black" : "bg-white/5 hover:bg-white/15"}`}
                    >
                      ▶ {v.title}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * Phones: a slim sheet along the bottom edge, one swipeable row of videos. Drag its handle up (or
 * tap it) for the whole list by minister, down to tuck it away again.
 */
function PhonePicker({
  now,
  play,
  standUp,
}: {
  now?: string;
  play: (minister: string, video: string) => void;
  standUp: () => void;
}) {
  const [open, setOpen] = useState(false);
  const drag = useRef<{ y: number; moved: boolean } | null>(null);
  const row = useRef<HTMLDivElement>(null);
  // the video that's on stays in view in the row
  useEffect(() => {
    if (open) return;
    row.current
      ?.querySelector<HTMLElement>("[data-on]")
      ?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [now, open]);
  const down = (e: React.PointerEvent) => {
    drag.current = { y: e.clientY, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.y;
    if (dy < -28 && !open) setOpen(true);
    else if (dy > 28 && open) setOpen(false);
    else return;
    d.moved = true;
    d.y = e.clientY;
  };
  const up = () => {
    if (drag.current && !drag.current.moved) setOpen(!open);
    drag.current = null;
  };
  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-0 sm:hidden">
      <div className="glass rounded-t-2xl pb-[max(8px,env(safe-area-inset-bottom))]">
        {/* the handle: drag up for everything, down to tuck it away */}
        <div className="flex items-center justify-between px-3 pt-1">
          <div className="eyebrow text-[9px]">On the LED wall</div>
          <button
            aria-label={open ? "Show less" : "Show all videos"}
            className="flex h-6 w-24 touch-none items-center justify-center"
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={() => (drag.current = null)}
          >
            <span className="h-1 w-10 rounded-full bg-white/50" />
          </button>
          <button
            className="btn-ghost px-2.5 py-1 text-[9px]"
            onClick={standUp}
          >
            Stand up
          </button>
        </div>
        {open ? (
          <div className="max-h-[45vh] overflow-y-auto overscroll-contain px-3 pb-1">
            {MINISTERS.map((m) => (
              <div key={m.id} className="mt-2">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-script text-sm leading-none text-gold">
                    {m.title}
                  </span>
                  <span className="text-[11px] font-bold uppercase">
                    {m.name}
                  </span>
                </div>
                <div className="mt-1 flex flex-col gap-1">
                  {m.videos.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => {
                        play(m.id, v.id);
                        setOpen(false);
                      }}
                      className={`truncate rounded-md px-2 py-1.5 text-left text-[11px] ${now === v.id ? "bg-gold text-black" : "bg-white/5"}`}
                    >
                      ▶ {v.title}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div
            ref={row}
            className="flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain px-3 pb-1 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {MINISTERS.flatMap((m) =>
              m.videos.map((v) => {
                const on = now === v.id;
                return (
                  <button
                    key={v.id}
                    data-on={on || undefined}
                    onClick={() => play(m.id, v.id)}
                    className={`flex w-[62vw] max-w-[260px] shrink-0 snap-center items-center gap-2 rounded-lg p-1.5 text-left ${on ? "bg-gold text-black" : "bg-white/[0.07]"}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- small YouTube thumbnail */}
                    <img
                      src={`https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`}
                      alt=""
                      className="h-[40px] w-[71px] shrink-0 rounded object-cover"
                    />
                    <span className="min-w-0">
                      <span
                        className={`block truncate text-[9px] font-bold uppercase ${on ? "text-black/70" : "text-gold"}`}
                      >
                        {m.name}
                      </span>
                      <span className="line-clamp-2 text-[11px] leading-tight">
                        {on ? "▶ " : ""}
                        {v.title}
                      </span>
                    </span>
                  </button>
                );
              }),
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function VenueUI() {
  const spot = useGame((s) => s.venueSpot);
  const seated = useGame((s) => s.seated);
  const set = useGame((s) => s.set);
  const registered = useGame((s) => !!s.registered);
  const [open, setOpen] = useState<string | null>(null);
  // the moment the torch is handed over
  const [handed, setHanded] = useState(false);
  const [wasRegistered] = useState(registered);
  useEffect(() => {
    if (!registered || wasRegistered) return;
    setHanded(true);
    const id = setTimeout(() => setHanded(false), 5000);
    return () => clearTimeout(id);
  }, [registered, wasRegistered]);

  const boothPanel = useGame((s) => s.panel);
  const label =
    spot === "seat" ? "Sit here" : SPOTS.find((s) => s.id === spot)?.label;
  const activate = () => {
    if (!spot) return;
    if (spot === "seat") set({ seated: true });
    else if (spot === "hall") {
      if (registered) setOpen(null);
      else set({ panel: "register" });
    } else if (spot === "kiosk") set({ panel: "register" });
    else if (spot.startsWith("tent:")) set({ panel: spot.slice(5) });
    else setOpen(spot);
  };

  // E / Space / Enter activates the nearby spot
  useEffect(() => {
    const id = setInterval(() => {
      if (input.action) {
        input.action = false;
        activate();
      }
    }, 80);
    return () => clearInterval(id);
  });

  // a form open (a booth's, or one of the spots here): nothing else on screen
  const form = !!boothPanel || !!open;
  return (
    <div className="pointer-events-none fixed inset-0 p-3 sm:p-5">
      {!form && (
        <>
          <div className="flex items-start justify-between">
            <div className="glass rounded-xl px-4 py-2.5">
              <div className="eyebrow text-[10px]">
                The Fusion Centre · Ogba
              </div>
              <div className="text-sm font-bold">
                {seated
                  ? "In the main hall"
                  : registered
                    ? "Explore with your torch"
                    : "Get your torch to go in"}
              </div>
              <div className="text-[11px] text-white/60">
                {registered
                  ? "Tap a booth's button to shop or play"
                  : "Register at the Get your Torch desk: the Main Hall opens to torch-bearers"}
              </div>
            </div>
            <button
              className="btn-ghost pointer-events-auto px-3 py-1.5 text-[10px]"
              onClick={() =>
                // back to the Fusion Centre from above, booths and all (not the film from the start)
                set({ stage: "title", seated: false, nowPlaying: null, skipFilm: useGame.getState().skipFilm + 1 })
              }
            >
              Exit
            </button>
          </div>

          {!seated && label && spot !== "hall" && (
            <div className="absolute bottom-24 left-1/2 -translate-x-1/2 sm:bottom-10">
              <button
                className="btn-gold pointer-events-auto px-6 py-3 text-xs"
                onClick={activate}
              >
                {label}{" "}
                <span className="ml-2 hidden rounded bg-black/20 px-1.5 sm:inline">
                  E
                </span>
              </button>
            </div>
          )}
          {!seated && spot === "hall" && registered && (
            <div className="absolute bottom-24 left-1/2 -translate-x-1/2 text-center text-xs text-white/80 sm:bottom-10">
              Walk in through the doors ↑
            </div>
          )}
          {!seated && spot === "hall" && !registered && (
            <div className="absolute bottom-24 left-1/2 -translate-x-1/2 text-center sm:bottom-10">
              <div className="mb-2 text-xs text-white/85">
                The Main Hall is for torch-bearers. Register to get yours.
              </div>
              <button
                className="btn-gold pointer-events-auto px-6 py-3 text-xs"
                onClick={activate}
              >
                🔥 Get your Torch{" "}
                <span className="ml-2 hidden rounded bg-black/20 px-1.5 sm:inline">
                  E
                </span>
              </button>
            </div>
          )}
          {handed && (
            <div className="absolute left-1/2 top-24 -translate-x-1/2 animate-[bob_2.4s_ease-in-out_infinite] rounded-full bg-gold px-5 py-2.5 text-sm font-extrabold text-black shadow-[0_6px_24px_rgba(0,0,0,0.45)]">
              🔥 The torch is yours. The Main Hall is open.
            </div>
          )}
          {!seated && !label && (
            <div className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 text-[10px] text-white/60 sm:block">
              W/S walk · A/D turn · E interact · drag to look around · scroll to
              zoom
            </div>
          )}

          {!seated && (
            <>
              {/* small screens: an arrow pad (up and down walk, left and right turn) */}
              <div className="pointer-events-auto absolute bottom-4 right-4 grid grid-cols-3 grid-rows-2 gap-1.5 sm:hidden">
                <div className="col-start-2">
                  <HoldButton k="up" aria="Walk forward" />
                </div>
                <div className="col-start-1 row-start-2">
                  <HoldButton k="left" aria="Turn left" />
                </div>
                <div className="col-start-2 row-start-2">
                  <HoldButton k="down" aria="Walk back" />
                </div>
                <div className="col-start-3 row-start-2">
                  <HoldButton k="right" aria="Turn right" />
                </div>
              </div>
            </>
          )}

          {seated && <MinisterPicker />}
        </>
      )}

      {open === "walkway" && <TestimonyPanel onClose={() => setOpen(null)} />}
      {open === "court" && <CourtPanel onClose={() => setOpen(null)} />}
    </div>
  );
}

/** Which way each arrow points (degrees, clockwise from up). */
const ARROW_TURN = { up: 0, right: 90, down: 180, left: 270 };

function HoldButton({
  k,
  aria,
}: {
  k: "up" | "down" | "left" | "right";
  aria: string;
}) {
  const on = () => ((input as Record<string, unknown>)[k] = true);
  const off = () => ((input as Record<string, unknown>)[k] = false);
  return (
    <button
      aria-label={aria}
      className="glass h-14 w-14 touch-none select-none rounded-[4px] text-lg font-black active:bg-gold/40"
      onPointerDown={on}
      onPointerUp={off}
      onPointerLeave={off}
      onPointerCancel={off}
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg
        viewBox="0 0 24 24"
        className="mx-auto h-5 w-5"
        style={{ transform: `rotate(${ARROW_TURN[k]}deg)` }}
        aria-hidden
      >
        <path d="M12 5 L20 18 H4 Z" fill="currentColor" />
      </svg>
    </button>
  );
}
