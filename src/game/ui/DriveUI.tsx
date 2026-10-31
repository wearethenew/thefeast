"use client";

import { useEffect, useRef, useState } from "react";
import { say, unlock } from "../audio";
import { input } from "../input";
import { useGame } from "../store";
import { MAJOR, getLagos, loadLagos, type LagosWorld } from "../world/lagosData";
import { ACCELERATE } from "../world/Driving";
import { YouTubeFrame } from "./youtube";

const PX = 0.5; // minimap pixels per metre in the pre-rendered road layer

function useRoadLayer() {
  const layer = useRef<{ canvas: HTMLCanvasElement; ox: number; oz: number } | null>(null);
  const [w, setW] = useState<LagosWorld | null>(getLagos());
  useEffect(() => {
    if (!w) loadLagos().then(setW);
  }, [w]);
  if (!layer.current && typeof document !== "undefined") {
    if (w) {
      const { minX, maxX, minZ, maxZ } = w.bounds;
      const c = document.createElement("canvas");
      c.width = Math.ceil((maxX - minX) * PX) + 40;
      c.height = Math.ceil((maxZ - minZ) * PX) + 40;
      const g = c.getContext("2d")!;
      g.lineCap = "round";
      g.lineJoin = "round";
      const ox = -minX * PX + 20;
      const oz = -minZ * PX + 20;
      for (const b of w.buildings) {
        g.fillStyle = "rgba(255,255,255,0.08)";
        g.beginPath();
        b.pts.forEach(([x, z], i) => (i ? g.lineTo(x * PX + ox, z * PX + oz) : g.moveTo(x * PX + ox, z * PX + oz)));
        g.fill();
      }
      for (const r of w.roads) {
        g.strokeStyle = MAJOR.has(r.type) ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.32)";
        g.lineWidth = Math.max(1.5, r.width * PX);
        g.beginPath();
        r.pts.forEach(([x, z], i) => (i ? g.lineTo(x * PX + ox, z * PX + oz) : g.moveTo(x * PX + ox, z * PX + oz)));
        g.stroke();
      }
      layer.current = { canvas: c, ox, oz };
    }
  }
  return layer.current;
}

function Minimap() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const layer = useRoadLayer();
  const routeKey = useGame((s) => s.route);
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = canvas.current;
      const w = getLagos();
      if (!c || !layer || !w) return;
      const g = c.getContext("2d")!;
      const { x, z, heading } = useGame.getState().tele;
      const S = c.width;
      g.clearRect(0, 0, S, S);
      g.save();
      g.beginPath();
      g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
      g.clip();
      g.fillStyle = "rgba(6,19,77,0.85)";
      g.fillRect(0, 0, S, S);
      g.translate(S / 2, S / 2 + S * 0.15);
      // heading-up map: rotate so the car always points up the screen
      g.rotate(Math.PI + heading);
      const zoom = 1.3;
      g.scale(zoom, zoom);
      g.drawImage(layer.canvas, -(x * PX + layer.ox), -(z * PX + layer.oz));
      // remaining route
      const route = w.routes[routeKey];
      g.strokeStyle = "#ffa22e";
      g.lineWidth = 4 / zoom;
      g.beginPath();
      route.pts.forEach(([rx, rz], i) => {
        const px = (rx - x) * PX, pz = (rz - z) * PX;
        if (i) g.lineTo(px, pz);
        else g.moveTo(px, pz);
      });
      g.stroke();
      // destination
      g.fillStyle = "#ff7a1a";
      g.beginPath();
      g.arc((w.gate[0] - x) * PX, (w.gate[1] - z) * PX, 7 / zoom, 0, Math.PI * 2);
      g.fill();
      g.restore();
      // the cab
      g.fillStyle = "#ffd24a";
      g.beginPath();
      g.moveTo(S / 2, S / 2 + S * 0.15 - 9);
      g.lineTo(S / 2 - 6, S / 2 + S * 0.15 + 7);
      g.lineTo(S / 2 + 6, S / 2 + S * 0.15 + 7);
      g.closePath();
      g.fill();
      g.strokeStyle = "rgba(242,181,68,0.6)";
      g.lineWidth = 2;
      g.beginPath();
      g.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2);
      g.stroke();
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [layer, routeKey]);
  return <canvas ref={canvas} width={180} height={180} className="h-36 w-36 sm:h-44 sm:w-44" />;
}

function Readout() {
  const tele = useGame((s) => s.tele);
  const km = tele.remainingM / 1000;
  const etaMin = Math.max(1, Math.round(tele.remainingM / 1000 / 35 * 60)); // ~35 km/h Lagos average
  return (
    <div className="glass rounded-xl px-4 py-2.5">
      <div className="eyebrow text-[10px]">To The Fusion Centre</div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-black">{km >= 1 ? km.toFixed(1) + " km" : Math.round(tele.remainingM) + " m"}</span>
        <span className="text-xs text-white/60">~{etaMin} min in real Lagos traffic</span>
      </div>
      <div className="truncate text-[11px] text-white/70">{tele.street || "Lagos"}</div>
    </div>
  );
}

function Pedal({ label, k, className = "" }: { label: string; k: "up" | "down" | "left" | "right"; className?: string }) {
  const on = () => ((input as Record<string, unknown>)[k] = true);
  const off = () => ((input as Record<string, unknown>)[k] = false);
  return (
    <button
      className={`glass flex h-16 w-16 items-center justify-center rounded-2xl text-lg font-black active:bg-gold/40 ${className}`}
      onPointerDown={on}
      onPointerUp={off}
      onPointerLeave={off}
      onPointerCancel={off}
    >
      {label}
    </button>
  );
}

export function DriveUI() {
  const flightPhase = useGame((s) => s.flightPhase);
  const arrived = useGame((s) => s.arrived);
  const autopilot = useGame((s) => s.autopilot);
  const speed = useGame((s) => Math.round(s.tele.speedKmh));
  const set = useGame((s) => s.set);
  const origin = useGame((s) => s.origin);
  const route = useGame((s) => s.route);
  const ride = useGame((s) => s.ride);

  if (flightPhase === "approach" && route === "airport")
    return (
      <div className="pointer-events-none fixed inset-x-0 top-0 flex flex-col items-center p-5 text-center">
        <div className="text-[11px] font-bold uppercase tracking-[0.4em] text-white/80">Now landing</div>
        <div className="gold-text text-4xl font-black sm:text-5xl">Welcome to Lagos</div>
        <div className="mt-1 text-xs text-white/70">That blue roof below? That&apos;s The Fusion Centre.</div>
        <button className="btn-ghost pointer-events-auto mt-3 px-4 py-1.5 text-[10px]" onClick={() => useGame.getState().afterLanding()}>
          Skip →
        </button>
      </div>
    );

  return (
    <div className="pointer-events-none fixed inset-0 p-3 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Readout />
          {ride === "danfo" && <Passengers />}
        </div>
        <div className="flex flex-col items-end gap-2">
          <Minimap />
          <GoToVenue />
        </div>
      </div>

      {ride !== null && !arrived && (
        <div className="absolute bottom-24 left-3 sm:bottom-16 sm:left-5">
          <Radio />
        </div>
      )}

      {!arrived && ride !== null && (
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
          <div className="text-4xl font-black tabular-nums">
            {speed}
            <span className="ml-1 text-xs font-semibold text-white/60">km/h</span>
          </div>
          {ride === "cab" && (
            <button
              className={`pointer-events-auto rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-wider ${autopilot ? "bg-gold text-black" : "glass"}`}
              onClick={() => set({ autopilot: !autopilot })}
            >
              {autopilot ? "🚕 Driver is taking you · tap to drive" : "🧭 Let the cab driver take me"}
            </button>
          )}
          <div className="flex items-center gap-3">
            <span className="hidden text-[10px] text-white/60 sm:inline">W/↑ drive · S/↓ brake · A/D steer</span>
            <button className="pointer-events-auto text-[10px] font-semibold text-gold underline-offset-2 hover:underline" onClick={() => set({ skipDrive: useGame.getState().skipDrive + 1 })}>
              Skip ahead →
            </button>
          </div>
        </div>
      )}

      {!arrived && !autopilot && ride === "cab" && (
        <>
          <div className="pointer-events-auto absolute bottom-4 left-4 flex gap-2 sm:hidden">
            <Pedal label="◀" k="left" />
            <Pedal label="▶" k="right" />
          </div>
          <div className="pointer-events-auto absolute bottom-4 right-4 flex gap-2 sm:hidden">
            <Pedal label="⏷" k="down" />
            <Pedal label="⏶" k="up" className="bg-gold/30" />
          </div>
        </>
      )}

      {ride === null && !(flightPhase === "approach" && route === "airport") && <RideChoice origin={origin?.label} fromAirport={route === "airport"} />}

      {arrived && (
        <div className="pointer-events-auto absolute inset-x-0 bottom-6 mx-auto w-[min(92vw,420px)]">
          <div className="glass rounded-2xl p-5 text-center">
            <div className="eyebrow text-[10px]">You&apos;ve arrived</div>
            <div className="mt-1 text-2xl font-black">The Fusion Centre</div>
            <div className="text-xs text-white/70">60A Surulere Industrial Avenue, Ogba</div>
            {ride === "danfo" && useGame.getState().passengers.length > 0 && (
              <div className="mt-1 text-[11px] text-white/70">You came with {useGame.getState().passengers.join(", ")}</div>
            )}
            <button className="btn-gold mt-4 w-full py-3 text-xs" onClick={() => set({ stage: "venue", venueSpot: null })}>
              🔥 Step out with your torch
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function RideChoice({ origin, fromAirport }: { origin?: string; fromAirport: boolean }) {
  const set = useGame((s) => s.set);
  const choose = (ride: "cab" | "danfo", autopilot = false) => {
    unlock();
    set({ ride, autopilot, flightPhase: "globe" });
    if (ride === "danfo") say("Ogba! Ogba! Fusion Centre! Oya enter!");
  };
  return (
    <div className="pointer-events-auto absolute inset-x-0 top-[22%] mx-auto w-[min(94vw,460px)]">
      <div className="glass rounded-2xl p-5 text-center">
        <div className="eyebrow text-[10px]">{fromAirport ? "Murtala Muhammed Airport" : "Obafemi Awolowo Way, Ikeja"}</div>
        <div className="mt-1 text-2xl font-black">How are you getting to Ogba?</div>
        <div className="mt-1 text-xs text-white/70">
          {origin ? `All the way from ${origin}. ` : ""}It&apos;s about {fromAirport ? "6" : "4"} km to The Fusion Centre.
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-left">
          <button className="rounded-xl border border-gold/60 bg-gold/15 p-3 hover:bg-gold/25" onClick={() => choose("danfo")}>
            <div className="text-2xl">🚐</div>
            <div className="text-sm font-black">Board a danfo</div>
            <div className="text-[11px] text-white/70">Hold on tight. The conductor is calling, other Feast people join on the way.</div>
          </button>
          <button className="rounded-xl border border-white/20 bg-white/5 p-3 hover:bg-white/10" onClick={() => choose("cab")}>
            <div className="text-2xl">🚕</div>
            <div className="text-sm font-black">Drive a cab</div>
            <div className="text-[11px] text-white/70">Take the wheel yourself and drive it like a Lagos driver.</div>
          </button>
        </div>
        <button className="mt-2 text-[11px] text-white/60 underline-offset-2 hover:underline" onClick={() => choose("cab", true)}>
          Or let a cab driver take me
        </button>
      </div>
    </div>
  );
}

function Passengers() {
  const passengers = useGame((s) => s.passengers);
  const name = useGame((s) => s.player.name);
  const line = useGame((s) => s.conductorLine);
  return (
    <div className="glass mt-2 max-w-[260px] rounded-xl px-3 py-2">
      <div className="eyebrow text-[10px]">On this danfo</div>
      <div className="mt-1 flex flex-wrap gap-1">
        <span className="rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold text-black">{name || "You"}</span>
        {passengers.map((p) => (
          <span key={p} className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold">
            {p}
          </span>
        ))}
      </div>
      {line && <div className="mt-1.5 text-[11px] italic text-white/80">Conductor: “{line}”</div>}
    </div>
  );
}

/** Feast Radio: the minister's music in a visible YouTube player, as YouTube requires. */
export function Radio() {
  const radio = useGame((s) => s.radio);
  const set = useGame((s) => s.set);
  if (!radio)
    return (
      <button
        className="glass pointer-events-auto rounded-full px-3 py-1.5 text-[11px] font-bold"
        onClick={() => {
          unlock();
          set({ radio: ACCELERATE });
        }}
      >
        📻 Feast Radio: I Accelerate
      </button>
    );
  return (
    <div className="glass pointer-events-auto w-[220px] overflow-hidden rounded-xl">
      <div className="flex items-center justify-between px-2.5 py-1.5">
        <div className="eyebrow text-[10px]">Feast Radio</div>
        <button className="text-xs text-white/60 hover:text-white" onClick={() => set({ radio: null })} aria-label="Turn the radio off">
          ✕
        </button>
      </div>
      <YouTubeFrame
        width="220"
        height="200"
        src={`https://www.youtube-nocookie.com/embed/${radio}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
        title="I Accelerate — Pastor Shola Okodugha feat. Sunmisola Agbebi"
        allow="autoplay; encrypted-media; picture-in-picture"
        style={{ border: 0, display: "block" }}
      />
      <div className="px-2.5 py-1.5 text-[10px] text-white/75">I Accelerate · Pastor Shola Okodugha feat. Sunmisola Agbebi</div>
    </div>
  );
}

/** Shortcut straight to the venue, from anywhere in the journey. */
export function GoToVenue({ className = "" }: { className?: string }) {
  const set = useGame((s) => s.set);
  return (
    <button
      className={`btn-ghost pointer-events-auto px-3 py-1.5 text-[10px] ${className}`}
      onClick={() => set({ stage: "venue", arrived: true, autopilot: false, venueSpot: null, flightPhase: "globe", ride: useGame.getState().ride ?? "cab" })}
    >
      ⚡ Go straight to The Fusion Centre
    </button>
  );
}
