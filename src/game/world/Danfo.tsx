"use client";

import { RoundedBox } from "@react-three/drei";
import type { ThreeElements } from "@react-three/fiber";
import { forwardRef, useMemo } from "react";
import * as THREE from "three";

// The player's danfo: yellow VW-style minibus with black stripes, see-through windows (so the
// passengers show), an open sliding door for the conductor and a roof rack.
// About 4.7 m long, nose toward +Z, wheels on y = 0. Wheels are named like the cab's.

const yellow = new THREE.MeshPhysicalMaterial({ color: "#f2b705", roughness: 0.45, metalness: 0.15, clearcoat: 0.5 });
const black = new THREE.MeshStandardMaterial({ color: "#111111", roughness: 0.6 });
const glass = new THREE.MeshPhysicalMaterial({ color: "#5f7380", roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.28 });
const interior = new THREE.MeshStandardMaterial({ color: "#2a2422", roughness: 0.9 });
const seat = new THREE.MeshStandardMaterial({ color: "#5b1d1d", roughness: 0.8 });
const tyre = new THREE.MeshStandardMaterial({ color: "#151515", roughness: 0.9 });
const rim = new THREE.MeshStandardMaterial({ color: "#9aa0a8", metalness: 0.9, roughness: 0.3 });
const headMat = new THREE.MeshStandardMaterial({ color: "#fffbe8", emissive: "#fff3cc", emissiveIntensity: 4, toneMapped: false });
const tailMat = new THREE.MeshStandardMaterial({ color: "#ff2020", emissive: "#ff1a1a", emissiveIntensity: 2.5, toneMapped: false });

/** Seat positions (danfo-local) for passengers, front-to-back, kerb side first. */
export const DANFO_SEATS: [number, number, number][] = [
  [0.45, 0.42, 0.55],
  [-0.45, 0.42, 0.55],
  [0.45, 0.42, -0.35],
  [-0.15, 0.42, -0.35],
  [-0.55, 0.42, -0.35],
  [0.45, 0.42, -1.25],
  [-0.15, 0.42, -1.25],
  [-0.55, 0.42, -1.25],
];
/** Where the conductor hangs on, in the open doorway (right / kerb side). */
export const CONDUCTOR_SPOT: [number, number, number] = [1.12, 0.32, 0.65];

export const Danfo = forwardRef<THREE.Group, Omit<ThreeElements["group"], "ref">>(function Danfo({ children, ...props }, ref) {
  const wheelGeo = useMemo(() => new THREE.CylinderGeometry(0.37, 0.37, 0.26, 20).rotateZ(Math.PI / 2), []);
  const rimGeo = useMemo(() => new THREE.CylinderGeometry(0.2, 0.2, 0.28, 10).rotateZ(Math.PI / 2), []);
  const spot = useMemo(() => {
    const l = new THREE.SpotLight("#fff3d6", 45, 45, 0.55, 0.6, 1.5);
    l.target.position.set(0, 0, 14);
    return l;
  }, []);
  return (
    <group ref={ref} {...props}>
      {/* lower body + floor */}
      <RoundedBox args={[1.95, 0.95, 4.7]} radius={0.16} smoothness={3} position-y={0.85} material={yellow} castShadow receiveShadow />
      <mesh position-y={0.4} material={interior}>
        <boxGeometry args={[1.8, 0.05, 4.4]} />
      </mesh>
      {/* black stripes */}
      {[0.62, 0.95].map((y) => (
        <mesh key={y} position-y={y} material={black}>
          <boxGeometry args={[1.97, 0.1, 4.72]} />
        </mesh>
      ))}
      {/* window band: pillars + glass, left open at the sliding door */}
      {[2.25, 1.2, -0.3, -1.4, -2.3].map((z) => (
        <group key={z}>
          <mesh position={[-0.94, 1.7, z]} material={yellow}>
            <boxGeometry args={[0.08, 0.75, 0.14]} />
          </mesh>
          {z !== 1.2 && (
            <mesh position={[0.94, 1.7, z]} material={yellow}>
              <boxGeometry args={[0.08, 0.75, 0.14]} />
            </mesh>
          )}
        </group>
      ))}
      <mesh position={[-0.96, 1.7, 0]} material={glass}>
        <boxGeometry args={[0.03, 0.72, 4.5]} />
      </mesh>
      <mesh position={[0.96, 1.7, -0.9]} material={glass}>
        <boxGeometry args={[0.03, 0.72, 2.7]} />
      </mesh>
      <mesh position={[0, 1.7, 2.33]} rotation-x={-0.12} material={glass}>
        <boxGeometry args={[1.8, 0.72, 0.03]} />
      </mesh>
      <mesh position={[0, 1.7, -2.34]} material={glass}>
        <boxGeometry args={[1.8, 0.6, 0.03]} />
      </mesh>
      {/* roof + rack */}
      <RoundedBox args={[1.95, 0.22, 4.7]} radius={0.1} smoothness={3} position-y={2.15} material={yellow} castShadow />
      {[-0.7, 0.7].map((x) => (
        <mesh key={x} position={[x, 2.35, -0.5]} material={black}>
          <boxGeometry args={[0.06, 0.06, 3]} />
        </mesh>
      ))}
      {/* sliding door, slid back over the rear window */}
      <mesh position={[1.0, 1.15, -0.9]} material={yellow}>
        <boxGeometry args={[0.05, 1.7, 1.0]} />
      </mesh>
      {/* bench seats */}
      {[0.55, -0.35, -1.25].map((z) => (
        <group key={z} position-z={z}>
          <mesh position={[0, 0.52, -0.05]} material={seat}>
            <boxGeometry args={[1.7, 0.12, 0.5]} />
          </mesh>
          <mesh position={[0, 0.85, -0.3]} material={seat}>
            <boxGeometry args={[1.7, 0.6, 0.08]} />
          </mesh>
        </group>
      ))}
      {/* lights */}
      {[-0.7, 0.7].map((x) => (
        <mesh key={"h" + x} position={[x, 0.95, 2.36]} material={headMat}>
          <boxGeometry args={[0.3, 0.16, 0.04]} />
        </mesh>
      ))}
      {[-0.75, 0.75].map((x) => (
        <mesh key={"t" + x} position={[x, 1.0, -2.36]} material={tailMat}>
          <boxGeometry args={[0.26, 0.22, 0.04]} />
        </mesh>
      ))}
      <primitive object={spot} position={[0, 0.95, 2.4]} />
      <primitive object={spot.target} />
      {[
        [-0.9, 1.5, true],
        [0.9, 1.5, true],
        [-0.9, -1.5, false],
        [0.9, -1.5, false],
      ].map(([x, z, front], i) => (
        <group key={i} name={front ? "steer" : undefined} position={[x as number, 0.37, z as number]}>
          <group name="spin">
            <mesh geometry={wheelGeo} material={tyre} castShadow />
            <mesh geometry={rimGeo} material={rim} />
          </group>
        </group>
      ))}
      {children}
    </group>
  );
});
