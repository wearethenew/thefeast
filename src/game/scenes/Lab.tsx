"use client";

import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { AVATARS, ROBES, SKIN_TONES } from "../data/avatars";
import { Character } from "../avatar/Character";

/** Dev scene: every avatar side by side in robes with torches, for checking fit, clips and lighting. */
// ?cam=x,y,z&t=x,y,z frames the camera (handy for screenshots)
function param(name: string, fallback: [number, number, number]) {
  const v = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get(name) : null;
  return (v ? v.split(",").map(Number) : fallback) as [number, number, number];
}

export function Lab() {
  const cam = param("cam", [0, 1.6, 4.2]);
  const target = param("t", [0, 1.1, 0]);
  return (
    <>
      <PerspectiveCamera makeDefault position={cam} fov={40} />
      <color attach="background" args={["#0b1230"]} />
      <hemisphereLight args={["#8fa6ff", "#1a1a2a", 0.6]} />
      <directionalLight position={[3, 5, 4]} intensity={1.4} castShadow shadow-mapSize={[2048, 2048]} />
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#2a2f45" roughness={0.9} />
      </mesh>
      {AVATARS.map((a, i) => (
        <Character
          key={a.id}
          avatarId={a.id}
          robeId={ROBES[i % ROBES.length].id}
          skin={a.sex === "f" ? SKIN_TONES[3] : SKIN_TONES[0]}
          hoodUp={i % 2 === 1}
          anim={(["idle", "walk", "idle", "cheer", "walk", "idle"] as const)[i]}
          raiseTorch={i === 3}
          position={[(i - 2.5) * 1.0, 0, 0]}
        />
      ))}
      <OrbitControls target={target} />
    </>
  );
}
