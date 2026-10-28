"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { Suspense, lazy, use, useEffect, useMemo, useRef } from "react";
import { streetPaths } from "../crowd/flows";
import * as THREE from "three";
import { GradientSky } from "../fx/Backdrop";
import { useGame } from "../store";
import { City, DistantCity } from "../world/City";
import type { CarState } from "../world/Driving";
import { FusionCentre } from "../world/FusionCentre";
import { loadLagos } from "../world/lagosData";
import { Venue } from "../world/Venue";
import { OpeningFilm } from "../world/OpeningFilm";
import { RoadScreen } from "../world/RoadScreen";
import { BoothButtons } from "../world/BoothButtons";
import { BoothBoards } from "../world/BoothBoards";

// The landing, the ride and the traffic belong to the switched-off ride across Lagos: load on demand.
const Approach = lazy(() => import("../world/Approach").then((m) => ({ default: m.Approach })));
const Driving = lazy(() => import("../world/Driving").then((m) => ({ default: m.Driving })));
const Signage = lazy(() => import("../world/Signage").then((m) => ({ default: m.Signage })));
const Traffic = lazy(() => import("../world/Traffic").then((m) => ({ default: m.Traffic })));

// Bright late-afternoon Lagos, like the architect's renders: warm sun from the west, clear sky.
const SUN_DIR = new THREE.Vector3(-0.6, 0.62, 0.48).normalize();

/** Directional sunlight whose shadow box follows the camera's focus. */
function Sun({ dusk = false }: { dusk?: boolean }) {
  const light = useRef<THREE.DirectionalLight>(null);
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  useFrame(() => {
    const l = light.current;
    if (!l) return;
    if (!l.target.parent) scene.add(l.target);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const focus = camera.position.clone().add(dir.multiplyScalar(30));
    focus.y = 0;
    l.target.position.copy(focus);
    l.position.copy(focus).add(SUN_DIR.clone().multiplyScalar(300));
  });
  return (
    <directionalLight
      ref={light}
      intensity={dusk ? 1.9 : 3.4}
      color={dusk ? "#ffb27a" : "#fff0d8"}
      castShadow
      shadow-mapSize={[2048, 2048]}
      shadow-camera-left={-90}
      shadow-camera-right={90}
      shadow-camera-top={90}
      shadow-camera-bottom={-90}
      shadow-camera-near={10}
      shadow-camera-far={700}
      shadow-bias={-0.0004}
      shadow-normalBias={0.04}
    />
  );
}

const lagosPromise = typeof window !== "undefined" ? loadLagos() : null;

/**
 * Compiles every shader in the city and the Fusion Centre in parallel, in the background, before
 * the first frame shows them (three would otherwise compile each one, blocking, the first time it's
 * drawn: seconds of frozen screen). The loading screen stays up until it's done.
 */
function Warm({ children }: { children: React.ReactNode }) {
  const group = useRef<THREE.Group>(null);
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const g = group.current;
    if (!g || useGame.getState().warm) return;
    // park everything on a layer the camera doesn't draw while it compiles
    const parked: THREE.Object3D[] = [];
    g.traverse((o) => {
      if (o.layers.isEnabled(0)) {
        o.layers.set(31);
        parked.push(o);
      }
    });
    let live = true;
    gl.compileAsync(g, camera, scene)
      .catch(() => {})
      .then(() => {
        for (const o of parked) o.layers.set(0);
        if (live) useGame.getState().set({ warm: true });
      });
    return () => {
      live = false;
      for (const o of parked) o.layers.set(0);
    };
  }, [gl, camera, scene]);
  return <group ref={group}>{children}</group>;
}

export function WorldScene() {
  const world = use(lagosPromise!);
  const stage = useGame((s) => s.stage);
  const flightPhase = useGame((s) => s.flightPhase);
  const car = useRef<CarState>(null);
  const approaching = stage === "drive" && flightPhase === "approach";
  // by the Fusion Centre the crowd walks the fence side of both streets and Lagos traffic keeps
  // moving on the other half; everywhere else as usual
  const shot = useGame((s) => s.procShot?.id);
  const walks = useMemo(() => streetPaths(world), [world]);
  const busyLagos = stage === "venue" || (stage === "title" && shot === "fusion");
  // the Feast evening: the opening film and the Fusion Centre itself, torches lit
  const dusk = stage === "title" || stage === "venue";

  return (
    <>
      {dusk ? (
        <>
          {/* dusk for the procession, so the torches and the city lights carry the picture */}
          {/* a natural Lagos dusk: soft blue overhead easing into a warm, hazy sunset at the horizon */}
          <GradientSky key="dusk" top="#3f63b4" mid="#e2b49c" glow="#ffb066" glowDir={[SUN_DIR.x, 0.08, SUN_DIR.z]} glowAmount={0.85} sharpness={3.5} spread={1.0} />
          <fog attach="fog" args={["#b495a0", 600, 4800]} />
          <hemisphereLight args={["#aab4e8", "#6a5038", 1.0]} />
        </>
      ) : (
        <>
          <GradientSky key="day" top="#2f6fd0" mid="#a9c9ef" glow="#ffd9a0" glowDir={[SUN_DIR.x, 0.25, SUN_DIR.z]} glowAmount={0.5} sharpness={8} />
          <fog attach="fog" args={["#b9cbe3", 380, 3600]} />
          <hemisphereLight args={["#cfe0ff", "#7a6a55", 1.15]} />
        </>
      )}
      <Sun dusk={dusk} />
      <Warm>
        <City world={world} />
        <DistantCity world={world} />
        <FusionCentre world={world} />
        {stage === "title" && <OpeningFilm world={world} />}
      </Warm>
      {/* route signage belongs to the ride across Lagos */}
      {stage === "drive" && <Signage world={world} />}
      {!dusk && <Traffic world={world} player={car} />}
      {dusk && (
        <Suspense fallback={null}>
          <Traffic world={world} walks={walks} count={140} radius={320} active={busyLagos} />
        </Suspense>
      )}
      {dusk && <BoothButtons />}
      {dusk && <BoothBoards />}
      {dusk && <RoadScreen world={world} />}
      {approaching && <Approach />}
      {stage === "drive" && !approaching && <Driving world={world} car={car} />}
      {stage === "venue" && <Venue world={world} />}
    </>
  );
}
