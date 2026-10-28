"use client";

import { ContactShadows, OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { Character } from "../avatar/Character";
import { EmberField, GradientSky } from "../fx/Backdrop";
import { useGame } from "../store";

// The dressing room: the player's character on a gold-ringed pedestal under stage lights.

function Pedestal() {
  return (
    <group>
      <mesh position-y={-0.06} receiveShadow>
        <cylinderGeometry args={[1.1, 1.2, 0.12, 64]} />
        <meshStandardMaterial color="#0b1546" roughness={0.3} metalness={0.6} />
      </mesh>
      <mesh position-y={0.001} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[1.02, 1.08, 96]} />
        <meshBasicMaterial color="#ffc35a" toneMapped={false} />
      </mesh>
    </group>
  );
}

export function CreatorScene() {
  const player = useGame((s) => s.player);
  const group = useRef<THREE.Group>(null);
  const flareLight = useRef<THREE.PointLight>(null);
  const flare = useRef(0);
  const lit = player.torchLit;
  const prevLit = useRef(lit);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    camera.position.set(0.7, 1.55, 3.3);
  }, [camera]);
  // a burst of light the moment the torch is lit
  useFrame((_, dt) => {
    if (lit && !prevLit.current) flare.current = 1;
    prevLit.current = lit;
    flare.current = Math.max(0, flare.current - dt * 0.8);
    if (flareLight.current) flareLight.current.intensity = flare.current * 30;
  });
  return (
    <>
      <GradientSky glowDir={[0.6, 0.2, -1]} />
      <fog attach="fog" args={["#0a1a78", 6, 20]} />
      <hemisphereLight args={["#7d95ff", "#160c26", 0.5]} />
      <spotLight position={[3, 5, 4]} angle={0.45} penumbra={0.6} intensity={60} color="#fff1dc" castShadow shadow-mapSize={[1024, 1024]} />
      <spotLight position={[-4, 3, -3]} angle={0.5} penumbra={0.8} intensity={40} color="#5b7bff" />
      <pointLight ref={flareLight} position={[0, 2.2, 1.2]} intensity={0} color="#ffa040" distance={6} />
      <mesh rotation-x={-Math.PI / 2} position-y={-0.12}>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#0a0f33" roughness={0.6} />
      </mesh>
      <Pedestal />
      <group ref={group}>
        <Character
          key={player.avatarId}
          avatarId={player.avatarId}
          robeId={player.robeId}
          skin={player.skin}
          hoodUp={player.hoodUp}
          anim={lit ? "cheer" : "idle"}
          torch={lit ? "lit" : "unlit"}
          raiseTorch={lit}
          torchShadows
        />
      </group>
      <ContactShadows position-y={0.005} opacity={0.6} scale={4} blur={2.4} far={2} />
      <EmberField count={lit ? 300 : 80} size={[10, 6, 10]} />
      <OrbitControls target={[0, 1.05, 0]} minDistance={1.6} maxDistance={5} minPolarAngle={0.9} maxPolarAngle={1.65} enablePan={false} />
    </>
  );
}
