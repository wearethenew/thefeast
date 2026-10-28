"use client";

import { RoundedBox } from "@react-three/drei";
import type { ThreeElements } from "@react-three/fiber";
import { forwardRef, useMemo } from "react";
import * as THREE from "three";

// A Lagos yellow cab: yellow body with the black side stripe, dark glass, chrome trim.
// About 4.6 m long, nose toward +Z, wheels on the ground at y = 0.

const paint = new THREE.MeshPhysicalMaterial({ color: "#f2b705", roughness: 0.32, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.12 });
const stripe = new THREE.MeshStandardMaterial({ color: "#121212", roughness: 0.5 });
const glass = new THREE.MeshPhysicalMaterial({ color: "#0d1218", roughness: 0.05, metalness: 0.4, transmission: 0, transparent: true, opacity: 0.82 });
const chrome = new THREE.MeshStandardMaterial({ color: "#d6d9de", metalness: 1, roughness: 0.18 });
const tyre = new THREE.MeshStandardMaterial({ color: "#151515", roughness: 0.9 });
const rim = new THREE.MeshStandardMaterial({ color: "#9aa0a8", metalness: 0.9, roughness: 0.3 });
const headMat = new THREE.MeshStandardMaterial({ color: "#fffbe8", emissive: "#fff3cc", emissiveIntensity: 4, toneMapped: false });
const tailMat = new THREE.MeshStandardMaterial({ color: "#ff2020", emissive: "#ff1a1a", emissiveIntensity: 2.5, toneMapped: false });

export type CabProps = Omit<ThreeElements["group"], "ref"> & { headlights?: boolean };

/** Wheels are named "steer" (front pivots) and "spin" (all) so a controller can animate them without re-rendering. */
export const Cab = forwardRef<THREE.Group, CabProps>(function Cab({ headlights = true, children, ...props }, ref) {
  const spot = useMemo(() => {
    const l = new THREE.SpotLight("#fff3d6", 45, 45, 0.55, 0.6, 1.5);
    l.target.position.set(0, 0, 14);
    return l;
  }, []);
  const wheelGeo = useMemo(() => new THREE.CylinderGeometry(0.34, 0.34, 0.24, 20).rotateZ(Math.PI / 2), []);
  const rimGeo = useMemo(() => new THREE.CylinderGeometry(0.2, 0.2, 0.26, 10).rotateZ(Math.PI / 2), []);
  return (
    <group ref={ref} {...props}>
      {/* lower body */}
      <RoundedBox args={[1.82, 0.62, 4.5]} radius={0.16} smoothness={4} position-y={0.62} material={paint} castShadow receiveShadow />
      {/* cabin */}
      <RoundedBox args={[1.66, 0.6, 2.35]} radius={0.2} smoothness={4} position={[0, 1.18, -0.2]} material={paint} castShadow />
      {/* glass band */}
      <mesh position={[0, 1.2, -0.2]} material={glass}>
        <boxGeometry args={[1.68, 0.4, 2.2]} />
      </mesh>
      <mesh position={[0, 1.16, 0.98]} rotation-x={-0.55} material={glass}>
        <boxGeometry args={[1.5, 0.52, 0.05]} />
      </mesh>
      <mesh position={[0, 1.16, -1.38]} rotation-x={0.6} material={glass}>
        <boxGeometry args={[1.5, 0.48, 0.05]} />
      </mesh>
      {/* black side stripe */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.915, 0.7, 0]} material={stripe}>
          <boxGeometry args={[0.02, 0.12, 4.1]} />
        </mesh>
      ))}
      {/* taxi roof sign */}
      <mesh position={[0, 1.56, -0.2]}>
        <boxGeometry args={[0.7, 0.16, 0.3]} />
        <meshStandardMaterial color="#111" emissive="#ffcc33" emissiveIntensity={1.2} />
      </mesh>
      {/* bumpers + grille */}
      <mesh position={[0, 0.42, 2.27]} material={chrome}>
        <boxGeometry args={[1.7, 0.14, 0.08]} />
      </mesh>
      <mesh position={[0, 0.42, -2.27]} material={chrome}>
        <boxGeometry args={[1.7, 0.14, 0.08]} />
      </mesh>
      <mesh position={[0, 0.66, 2.26]} material={stripe}>
        <boxGeometry args={[0.9, 0.2, 0.04]} />
      </mesh>
      {/* lights */}
      {[-0.65, 0.65].map((x) => (
        <mesh key={"h" + x} position={[x, 0.7, 2.25]} material={headMat}>
          <boxGeometry args={[0.32, 0.14, 0.04]} />
        </mesh>
      ))}
      {[-0.68, 0.68].map((x) => (
        <mesh key={"t" + x} position={[x, 0.72, -2.25]} material={tailMat}>
          <boxGeometry args={[0.3, 0.12, 0.04]} />
        </mesh>
      ))}
      {headlights && (
        <>
          <primitive object={spot} position={[0, 0.75, 2.3]} />
          <primitive object={spot.target} />
        </>
      )}
      {/* wheels */}
      {[
        [-0.82, 1.42, true],
        [0.82, 1.42, true],
        [-0.82, -1.4, false],
        [0.82, -1.4, false],
      ].map(([x, z, front], i) => (
        <group key={i} name={front ? "steer" : undefined} position={[x as number, 0.34, z as number]}>
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
