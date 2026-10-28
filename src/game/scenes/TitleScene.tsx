"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { Character } from "../avatar/Character";
import { AVATARS, ROBES, SKIN_TONES } from "../data/avatars";
import { EmberField, GradientSky } from "../fx/Backdrop";
import { SandFloor, Skyline } from "../fx/Landscape";

// Opening shot: a procession of torch-bearers in Feast robes walking out of a blue haze
// toward the camera, with the lead bearer holding the torch high.

const PROCESSION = Array.from({ length: 11 }, (_, i) => {
  const row = Math.floor(i / 3);
  const col = (i % 3) - 1;
  return {
    id: i,
    avatarId: AVATARS[(i * 5 + 1) % AVATARS.length].id,
    robeId: i % 4 === 3 ? ROBES[2].id : i % 5 === 4 ? ROBES[1].id : ROBES[0].id,
    skin: AVATARS[(i * 5 + 1) % AVATARS.length].sex === "f" ? SKIN_TONES[3] : SKIN_TONES[0],
    hoodUp: i % 2 === 0,
    x: col * 2.05 + (row % 2) * 0.7,
    z: -3 - row * 2.9,
    speed: 0.92 + ((i * 37) % 10) / 100,
  };
});

function Walker({ p }: { p: (typeof PROCESSION)[number] }) {
  const ref = useMemo(() => ({ g: null as THREE.Group | null }), []);
  useFrame((_, dt) => {
    if (!ref.g) return;
    ref.g.position.z += dt * 0.55 * p.speed;
    if (ref.g.position.z > 3) ref.g.position.z -= 17;
  });
  return (
    <group ref={(g) => void (ref.g = g)} position={[p.x, 0, p.z]}>
      <Character avatarId={p.avatarId} robeId={p.robeId} skin={p.skin} hoodUp={p.hoodUp} anim="walk" timeScale={0.62 * p.speed} torchLight={p.id < 5} />
    </group>
  );
}

function CameraDrift() {
  const { camera } = useThree();
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    camera.position.set(Math.sin(t * 0.08) * 1.2, 1.25 + Math.sin(t * 0.13) * 0.08, 5.2);
    camera.lookAt(0, 1.35, -2);
  });
  return null;
}

export function TitleScene() {
  return (
    <>
      <GradientSky top="#071a7a" mid="#3156d8" glow="#ff9a4a" glowDir={[0.15, 0.2, -1]} glowAmount={0.9} sharpness={7} />
      <fog attach="fog" args={["#5a5cb0", 60, 950]} />
      <hemisphereLight args={["#7d95ff", "#3a2a1a", 0.7]} />
      <directionalLight position={[-6, 9, -14]} intensity={2.2} color="#ffb070" castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-14} shadow-camera-right={14} shadow-camera-top={14} shadow-camera-bottom={-14} />
      <SandFloor size={1600} />
      <Skyline radius={420} count={90} />
      {PROCESSION.map((p) => (
        <Walker key={p.id} p={p} />
      ))}
      <EmberField count={500} size={[16, 8, 18]} />
      <CameraDrift />
    </>
  );
}
