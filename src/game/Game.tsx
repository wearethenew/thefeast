"use client";

import { useProgress } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, SMAA, Vignette } from "@react-three/postprocessing";
import { Suspense, lazy, useEffect, useState } from "react";
import { setMusic, unlock } from "./audio";
import { billboardUnmuted, unmuteBillboard } from "./billboardAudio";
import { SongPlayer } from "./ui/SongPlayer";
import { BoothPanels } from "./ui/BoothPanels";
import { useSmallScreen } from "./ui/useSmallScreen";
import { AvatarPicker } from "./ui/AvatarPicker";
import * as THREE from "three";
import { preloadAvatars } from "./avatar/Avatar";
import { WorldScene } from "./scenes/WorldScene";
import { CrowdBaker } from "./crowd/CrowdBaker";
import { useGame } from "./store";
import { TitleUI } from "./ui/TitleUI";
import { VenueUI } from "./ui/VenueUI";

// Stages outside the main journey (creator, globe, flight, the ride) load only if someone goes there.
const Lab = lazy(() => import("./scenes/Lab").then((m) => ({ default: m.Lab })));
const CreatorScene = lazy(() => import("./scenes/CreatorScene").then((m) => ({ default: m.CreatorScene })));
const GlobeScene = lazy(() => import("./scenes/GlobeScene").then((m) => ({ default: m.GlobeScene })));
const CreatorUI = lazy(() => import("./ui/CreatorUI").then((m) => ({ default: m.CreatorUI })));
const OriginUI = lazy(() => import("./ui/OriginUI").then((m) => ({ default: m.OriginUI })));
const FlightUI = lazy(() => import("./ui/FlightUI").then((m) => ({ default: m.FlightUI })));
const DriveUI = lazy(() => import("./ui/DriveUI").then((m) => ({ default: m.DriveUI })));

// Dev aid: keep a short, readable list of runtime errors on window.__errs.
if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  const w = window as unknown as { __errs?: string[]; __game?: typeof useGame };
  w.__game = useGame; // lets scripted playthroughs drive the store
  if (!w.__errs) {
    w.__errs = [];
    const push = (m: unknown) => w.__errs!.length < 50 && w.__errs!.push(String(m).slice(0, 400));
    window.addEventListener("error", (e) => push(e.message));
    const orig = console.error;
    console.error = (...a: unknown[]) => {
      push(a[0] instanceof Error ? a[0].message : a[0]);
      orig(...a);
    };
  }
}

/** The loading card (src/app/page.tsx draws the same card while this code is still downloading). */
function LoaderCard({ progress, label }: { progress: number; label: string }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex flex-col items-center justify-center bg-royal-deep/90">
      <div className="text-xs tracking-[0.5em] text-white/70">THE FEAST 2026</div>
      <div className="gold-text mt-2 text-5xl font-black tracking-tight">THE TORCH</div>
      <div className="mt-8 h-1 w-56 overflow-hidden rounded-full bg-white/10">
        <div className="h-full bg-gradient-to-r from-flame to-gold transition-all" style={{ width: `${progress}%` }} />
      </div>
      <div className="mt-3 text-xs text-white/50">{label}</div>
    </div>
  );
}

function Loader() {
  const { active, progress } = useProgress();
  const stage = useGame((s) => s.stage);
  const warm = useGame((s) => s.warm);
  // once a stage is on screen it stays there: things loading in the background (the crowd's
  // people during the opening film) never bring the loader back over it
  const [shown, setShown] = useState<string | null>(null);
  const begun = useGame((s) => s.begun);
  // the world's own stages also wait for its shaders to finish compiling (see WorldScene)
  const preparing = !active && !warm && (stage === "title" || stage === "venue");
  const done = !active && !preparing;
  useEffect(() => {
    if (done && shown !== stage) setShown(stage);
  }, [done, shown, stage]);
  // phones: the film (and its song) starts on a tap, so it plays with sound from the first scene
  if ((done || shown === stage) && stage === "title" && !begun)
    return (
      <div className="pointer-events-auto fixed inset-0 z-50 flex flex-col items-center justify-center bg-royal-deep/90" onClick={() => useGame.getState().set({ begun: true })}>
        <div className="text-xs tracking-[0.5em] text-white/70">THE FEAST 2026</div>
        <div className="gold-text mt-2 text-5xl font-black tracking-tight">THE TORCH</div>
        <button className="btn-gold mt-8 px-8 py-3.5 text-[15px]">Tap to begin 🔥</button>
        <div className="mt-3 text-xs text-white/50">Sound on for the full experience</div>
      </div>
    );
  if (done || shown === stage) return null;
  return <LoaderCard progress={progress} label={preparing ? "Lighting the city…" : `Lighting the way… ${Math.round(progress)}%`} />;
}

/** Pick a female or male avatar: over the opening film and while walking (not over a form, nor seated). */
function PickAvatar() {
  const stage = useGame((s) => s.stage);
  const panel = useGame((s) => s.panel);
  const seated = useGame((s) => s.seated);
  const warm = useGame((s) => s.warm);
  const shot = useGame((s) => s.procShot?.id);
  const small = useSmallScreen();
  if ((stage !== "title" && stage !== "venue") || panel || seated || !warm) return null;
  // not over the film's flight and campus shots: only from the Fusion Centre on
  if (stage === "title" && shot !== "fusion") return null;
  // centred at the bottom, above the film's bar and the walking prompts; on a phone while walking,
  // bottom left (the arrow pad is on the right)
  const at =
    small && stage === "venue"
      ? "bottom-4 left-4"
      : stage === "title"
        ? "bottom-28 left-1/2 -translate-x-1/2"
        : "bottom-[100px] left-1/2 -translate-x-1/2";
  return <AvatarPicker className={at} />;
}

/** On phones a booth's form is a sheet over the whole screen (on bigger screens it's on the booth's board). */
function PhonePanel() {
  const small = useSmallScreen();
  const panel = useGame((s) => s.panel);
  const stage = useGame((s) => s.stage);
  if (!small || !panel || (stage !== "title" && stage !== "venue")) return null;
  return (
    <div className="fixed inset-0 z-40">
      <BoothPanels />
    </div>
  );
}

/** Dev aid: expose the three.js state for scripted debugging. */
function DevExpose() {
  const three = useThree();
  if (process.env.NODE_ENV !== "production") (window as unknown as { __three?: unknown }).__three = three;
  return null;
}

function Scene() {
  const stage = useGame((s) => s.stage);
  switch (stage) {
    case "title":
      return <WorldScene />;
    case "create":
      return <CreatorScene />;
    case "origin":
    case "flight":
      return <GlobeScene />;
    case "drive":
    case "venue":
      return <WorldScene />;
  }
}

function Overlay() {
  const stage = useGame((s) => s.stage);
  switch (stage) {
    case "title":
      return <TitleUI />;
    case "create":
      return <CreatorUI />;
    case "origin":
      return <OriginUI />;
    case "flight":
      return <FlightUI />;
    case "drive":
      return <DriveUI />;
    case "venue":
      return <VenueUI />;
  }
}

export default function Game() {
  const [lost, setLost] = useState(false);
  const lab = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("lab");
  // pinching (trackpad, ctrl+scroll, two fingers, Safari's gestures) zooms the 3D camera, never the
  // page: the labels and buttons on screen stay put
  useEffect(() => {
    const noPageZoom = (e: Event) => e.preventDefault();
    const wheel = (e: WheelEvent) => e.ctrlKey && e.preventDefault();
    const touch = (e: TouchEvent) => e.touches.length > 1 && e.preventDefault();
    window.addEventListener("wheel", wheel, { passive: false });
    document.addEventListener("touchmove", touch, { passive: false });
    for (const g of ["gesturestart", "gesturechange", "gestureend"]) document.addEventListener(g, noPageZoom, { passive: false });
    return () => {
      window.removeEventListener("wheel", wheel);
      document.removeEventListener("touchmove", touch);
      for (const g of ["gesturestart", "gesturechange", "gestureend"]) document.removeEventListener(g, noPageZoom);
    };
  }, []);
  useEffect(() => {
    // audio may only start after a user gesture
    // the billboard's song is the soundtrack: unmute it with the first tap (the synth pad steps aside)
    const first = () => {
      unlock();
      if (!billboardUnmuted()) setMusic(false);
      unmuteBillboard();
    };
    window.addEventListener("pointerdown", first);
    window.addEventListener("keydown", first, { once: true });
    preloadAvatars();
    // arriving from a friend's invite: you'll ride with them, from the pickup they set
    const inv = new URLSearchParams(window.location.search).get("invite");
    if (inv) {
      try {
        const data = JSON.parse(atob(inv.replace(/-/g, "+").replace(/_/g, "/")));
        useGame.getState().set({
          invitedBy: data,
          player: { ...useGame.getState().player, name: data.friend ?? "" },
          origin: data.pickup ? { lat: data.pickup.lat, lon: data.pickup.lon, label: data.pickup.label.split(",")[0], detail: data.pickup.label } : null,
        });
      } catch {
        /* a broken link just starts the normal journey */
      }
    }
    // ?stage=drive etc. jumps straight to a stage (development / demos)
    const st = new URLSearchParams(window.location.search).get("stage");
    if (st) useGame.getState().debugJump(st as never);
  }, []);

  return (
    <div className="fixed inset-0 select-none">
      <Canvas
        shadows
        dpr={[1, 1.5]}
        gl={{ antialias: false, toneMapping: THREE.NeutralToneMapping, outputColorSpace: THREE.SRGBColorSpace, powerPreference: "high-performance" }}
        camera={{ position: [0, 1.6, 4], fov: 40, near: 0.1, far: 30000 }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener("webglcontextlost", (e) => {
            e.preventDefault();
            setLost(true);
          });
        }}
      >
        <Suspense fallback={null}>
          {lab ? <Lab /> : <Scene />}
          {/* real people for the crowds, baked in the background while the opening film plays */}
          <CrowdBaker />
          <DevExpose />
          <EffectComposer multisampling={0}>
            <SMAA />
            <Bloom intensity={0.85} luminanceThreshold={0.9} luminanceSmoothing={0.2} mipmapBlur />
            <Vignette darkness={0.45} offset={0.35} />
          </EffectComposer>
        </Suspense>
      </Canvas>
      {!lab && (
        // above in-scene HTML (the LED wall), below the loader
        <div className="pointer-events-none fixed inset-0 z-10">
          <Overlay />
        </div>
      )}
      {!lab && <PhonePanel />}
      {!lab && <PickAvatar />}
      {/* the soundtrack (unseen: its picture and buttons are on the road billboard) */}
      {!lab && <SongPlayer />}
      <Loader />
      {lost && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-royal-deep/95 p-6 text-center">
          <div className="gold-text text-3xl font-black">The graphics took a breather</div>
          <p className="max-w-sm text-sm text-white/80">Your browser reset its 3D graphics. Reload to carry on from the start.</p>
          <button className="btn-gold px-7 py-3 text-xs" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      )}
    </div>
  );
}
