"use client";

import type { ThreeElements } from "@react-three/fiber";
import { forwardRef, useMemo } from "react";
import * as THREE from "three";

// A twin-engine airliner in "TORCH Air" livery: white body, royal-blue tail and belly line,
// gold flame stripe. Built from primitives; ~38 m long, nose toward +Z.

const white = new THREE.MeshPhysicalMaterial({ color: "#f4f5f8", roughness: 0.35, metalness: 0.1, clearcoat: 0.8, clearcoatRoughness: 0.2 });
const royal = new THREE.MeshPhysicalMaterial({ color: "#1233b8", roughness: 0.35, metalness: 0.2, clearcoat: 0.8 });
const gold = new THREE.MeshStandardMaterial({ color: "#e8b44a", roughness: 0.3, metalness: 0.9 });
const glass = new THREE.MeshStandardMaterial({ color: "#1b2030", roughness: 0.15, metalness: 0.6 });
const engineMat = new THREE.MeshStandardMaterial({ color: "#c9ccd3", roughness: 0.3, metalness: 0.7 });
const navRed = new THREE.MeshBasicMaterial({ color: "#ff2a2a", toneMapped: false });
const navGreen = new THREE.MeshBasicMaterial({ color: "#2aff6a", toneMapped: false });
const strobe = new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false });

function wingShape(span: number, root: number, tip: number, sweep: number) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(span, -sweep);
  s.lineTo(span, -sweep - tip);
  s.lineTo(0, -root);
  s.closePath();
  return s;
}

export const Airliner = forwardRef<THREE.Group, Omit<ThreeElements["group"], "ref"> & { gearDown?: boolean; livery?: string; quad?: boolean }>(function Airliner(
  { gearDown = false, livery, quad = false, ...props },
  ref,
) {
  // the tail, belly line and engine lips take the livery colour (TORCH Air royal blue by default)
  const tail = useMemo(() => (livery ? new THREE.MeshPhysicalMaterial({ color: livery, roughness: 0.35, metalness: 0.2, clearcoat: 0.8 }) : royal), [livery]);
  const geos = useMemo(() => {
    const body = new THREE.CapsuleGeometry(1.95, 30, 8, 24);
    body.rotateX(Math.PI / 2);
    const wing = new THREE.ExtrudeGeometry(wingShape(16.5, 7, 1.6, 7.5), { depth: 0.35, bevelEnabled: false });
    wing.rotateX(Math.PI / 2);
    const tailWing = new THREE.ExtrudeGeometry(wingShape(6, 3.4, 1.1, 2.6), { depth: 0.2, bevelEnabled: false });
    tailWing.rotateX(Math.PI / 2);
    const fin = new THREE.ExtrudeGeometry(wingShape(7.5, 6, 2, 5), { depth: 0.25, bevelEnabled: false });
    fin.rotateZ(Math.PI / 2);
    fin.rotateY(Math.PI / 2);
    return { body, wing, tailWing, fin };
  }, []);
  return (
    <group ref={ref} {...props}>
      <mesh geometry={geos.body} material={white} castShadow />
      {/* belly line + gold stripe */}
      <mesh position={[0, -0.9, 0]} scale={[1.01, 0.55, 1]} rotation-x={Math.PI / 2}>
        <capsuleGeometry args={[1.95, 29, 6, 24]} />
        <meshPhysicalMaterial color={livery ?? "#1233b8"} roughness={0.35} clearcoat={0.8} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 1.9, -0.3, -1]} material={gold}>
          <boxGeometry args={[0.06, 0.16, 26]} />
        </mesh>
      ))}
      {/* cockpit glass */}
      <mesh position={[0, 0.75, 16.4]} rotation-x={-0.5} material={glass}>
        <boxGeometry args={[1.9, 0.5, 1.4]} />
      </mesh>
      {/* cabin windows */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 1.93, 0.5, 0]} material={glass}>
          <boxGeometry args={[0.05, 0.32, 24]} />
        </mesh>
      ))}
      {/* wings */}
      <mesh geometry={geos.wing} material={white} position={[1.2, -0.6, 3]} castShadow />
      <mesh geometry={geos.wing} material={white} position={[-1.2, -0.6, 3]} scale={[-1, 1, 1]} castShadow />
      <mesh geometry={geos.tailWing} material={white} position={[0.8, 0.6, -13]} />
      <mesh geometry={geos.tailWing} material={white} position={[-0.8, 0.6, -13]} scale={[-1, 1, 1]} />
      <mesh geometry={geos.fin} material={tail} position={[0.12, 1.4, -11]} castShadow />
      <mesh position={[0, 6.2, -14.2]} material={gold}>
        <boxGeometry args={[0.3, 1.8, 0.9]} />
      </mesh>
      {/* engines */}
      {(quad ? [-11, -5.6, 5.6, 11] : [-6.2, 6.2]).map((x) => (
        <group key={x} position={[x, -1.9 + Math.abs(x) * 0.02, 3.4 - Math.abs(x) * 0.18]}>
          <mesh rotation-x={Math.PI / 2} material={engineMat} castShadow>
            <cylinderGeometry args={[1.1, 0.9, 4.2, 20]} />
          </mesh>
          <mesh rotation-x={Math.PI / 2} position-z={2.1} material={tail}>
            <torusGeometry args={[1.05, 0.12, 8, 24]} />
          </mesh>
        </group>
      ))}
      {/* nav lights */}
      <mesh position={[-17.6, -0.45, -5.3]} material={navRed}>
        <sphereGeometry args={[0.25, 8, 8]} />
      </mesh>
      <mesh position={[17.6, -0.45, -5.3]} material={navGreen}>
        <sphereGeometry args={[0.25, 8, 8]} />
      </mesh>
      <mesh position={[0, 8.6, -16]} material={strobe}>
        <sphereGeometry args={[0.2, 8, 8]} />
      </mesh>
      {gearDown &&
        [
          [0, -3, 13],
          [-3, -3, 1],
          [3, -3, 1],
        ].map((p, i) => (
          <group key={i} position={p as [number, number, number]}>
            <mesh material={engineMat} position-y={0.9}>
              <cylinderGeometry args={[0.15, 0.15, 1.8, 8]} />
            </mesh>
            <mesh rotation-z={Math.PI / 2} position-y={-0.1}>
              <cylinderGeometry args={[0.55, 0.55, 0.5, 16]} />
              <meshStandardMaterial color="#111" roughness={0.9} />
            </mesh>
          </group>
        ))}
    </group>
  );
});
