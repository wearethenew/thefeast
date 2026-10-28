"use client";

import { Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { BAYS, CROSSING, routeIn, taken } from "./parkingLot";
import { COMPOUND, PARKING, toWorld } from "./compound";
import type { Stream } from "./processionData";
import { CAR_COLORS, shared, tint, type LaneExit } from "./SetTraffic";

// The car park behind the Fusion Centre: tarmac, white bays, a sign at the entrance, the cars
// already parked, and now and then a car leaving the avenue's traffic to turn in and park.

const rnd = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

type Parked = { bay: number; kind: number; color: string };
type Arriving = Parked & { curve: THREE.CatmullRomCurve3; len: number; at: number; speed: number; crossAt: number };

const parked: Parked[] = [...taken].map((bay) => ({ bay, kind: rnd(bay) < 0.7 ? 0 : 1, color: CAR_COLORS[Math.floor(rnd(bay + 0.4) * CAR_COLORS.length)] }));
let arriving: Arriving | null = null;
let reserved = -1;
let lastIn = -1e9;

/**
 * The turning into the car park off the avenue's inner lane on the fence side (running against
 * `dir`, the street's own way), or null if it doesn't pass it.
 */
export function parkingExit(st: Stream, dir: 1 | -1): LaneExit | null {
  // where the car leaves the lane: a little before the entrance
  const p = toWorld(PARKING.road + 1.7, PARKING.aisle + 12 * dir);
  let s = -1;
  let best = 6;
  for (let i = 0; i < st.length; i++) {
    const d = Math.hypot(st.x[i] - p.x, st.z[i] - p.z);
    if (d < best) {
      best = d;
      s = i;
    }
  }
  if (s < 0) return null;
  return {
    s,
    lead: 5,
    want: (kind) => {
      // cars and SUVs, one at a time, with a gap between them, while there's a bay free
      if (kind > 1 || arriving || reserved >= 0 || performance.now() - lastIn < 7000) return false;
      const free = BAYS.map((_, i) => i).filter((i) => !taken.has(i));
      if (!free.length) return false;
      reserved = free[Math.floor(Math.random() * free.length)];
      taken.add(reserved);
      // the marshal holds the walkers before the entrance
      CROSSING.closed = true;
      return true;
    },
    take: (kind, color, x, z, _h, speed) => {
      const curve = routeIn(new THREE.Vector3(x, 0, z), reserved, dir);
      const len = curve.getLength();
      // how far along the route the crossing is
      let crossAt = 0;
      let bestD = Infinity;
      const q = new THREE.Vector3();
      for (let i = 0; i <= 60; i++) {
        curve.getPointAt(i / 60, q);
        const d = Math.hypot(q.x - CROSSING.x, q.z - CROSSING.z);
        if (d < bestD) {
          bestD = d;
          crossAt = (i / 60) * len;
        }
      }
      arriving = { bay: reserved, kind, color, curve, len, at: 0, speed, crossAt };
      reserved = -1;
    },
  };
}

export function CarPark({ active = true }: { active?: boolean }) {
  const { geos, mat } = shared();
  const meshes = useRef<(THREE.InstancedMesh | null)[]>([]);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const one = useMemo(() => new THREE.Vector3(1, 1, 1), []);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const tan = useMemo(() => new THREE.Vector3(), []);
  const col = useMemo(() => new THREE.Color(), []);
  const heading = useRef(0);

  useFrame((_, rawDt) => {
    if (!active) return;
    const dt = Math.min(rawDt, 0.1);
    const n = [0, 0];
    const put = (kind: number, x: number, z: number, h: number, c: string) => {
      const im = meshes.current[kind];
      if (!im) return;
      q.setFromAxisAngle(up, h);
      m.compose(pos.set(x, 0, z), q, one);
      im.setMatrixAt(n[kind], m);
      im.setColorAt(n[kind]++, tint(c));
    };
    for (const p of parked) {
      const b = BAYS[p.bay];
      const w = toWorld(b.x, b.z);
      put(p.kind, w.x, w.z, COMPOUND.rotation + (b.face > 0 ? 0 : Math.PI), p.color);
    }
    const a = arriving;
    if (a) {
      // slowing off the avenue, walking pace across the crossing and into the bay
      const left = a.len - a.at;
      const want = a.at < a.crossAt + 4 ? 3.2 : left < 5 ? 1.2 : 2.4;
      a.speed += THREE.MathUtils.clamp(want - a.speed, -4 * dt, 2 * dt);
      a.at = Math.min(a.len, a.at + a.speed * dt);
      const u = a.at / a.len;
      a.curve.getPointAt(u, pos);
      a.curve.getTangentAt(Math.min(u, 0.999), tan);
      const h = Math.atan2(tan.x, tan.z);
      if (a.at < 0.5) heading.current = h;
      let dh = h - heading.current;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      heading.current += dh * Math.min(1, dt * 8);
      put(a.kind, pos.x, pos.z, heading.current, a.color);
      // past the crossing: the walkers carry on
      if (a.at > a.crossAt + 5) CROSSING.closed = false;
      if (a.at >= a.len) {
        parked.push({ bay: a.bay, kind: a.kind, color: a.color });
        arriving = null;
        CROSSING.closed = false;
        lastIn = performance.now();
      }
    }
    meshes.current.forEach((im, k) => {
      if (!im) return;
      im.count = n[k];
      im.visible = n[k] > 0;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    });
  });

  const w = PARKING.x1 - PARKING.x0;
  const d = PARKING.z1 - PARKING.z0;
  const cx = (PARKING.x0 + PARKING.x1) / 2;
  const cz = (PARKING.z0 + PARKING.z1) / 2;
  const edge = PARKING.road + 7.4; // the avenue's kerb on the compound's side
  return (
    <group>
      {[0, 1].map((k) => (
        <instancedMesh
          key={k}
          ref={(im) => {
            meshes.current[k] = im;
            if (im && !im.instanceColor) for (let i = 0; i <= BAYS.length; i++) im.setColorAt(i, col.set("#ffffff"));
          }}
          args={[geos[k], mat, BAYS.length + 1]}
          castShadow
          receiveShadow
          frustumCulled={false}
        />
      ))}
      <group position={[COMPOUND.center[0], 0, COMPOUND.center[1]]} rotation-y={COMPOUND.rotation}>
        {/* tarmac, and the driveway in from the avenue */}
        <mesh position={[cx, 0.035, cz]} rotation-x={-Math.PI / 2} receiveShadow>
          <planeGeometry args={[w, d]} />
          <meshStandardMaterial color="#3b3d42" roughness={0.95} />
        </mesh>
        <mesh position={[(edge + PARKING.x0) / 2, 0.034, PARKING.aisle]} rotation-x={-Math.PI / 2} receiveShadow>
          <planeGeometry args={[PARKING.x0 - edge + 0.5, 7]} />
          <meshStandardMaterial color="#3b3d42" roughness={0.95} />
        </mesh>
        {/* kerb round it */}
        {[
          [cx, PARKING.z0, w, 0.25],
          [cx, PARKING.z1, w, 0.25],
          [PARKING.x1, cz, 0.25, d],
        ].map(([x, z, sx, sz], i) => (
          <mesh key={i} position={[x, 0.08, z]}>
            <boxGeometry args={[sx, 0.16, sz]} />
            <meshStandardMaterial color="#b8b4aa" roughness={0.9} />
          </mesh>
        ))}
        {/* bay lines */}
        {BAYS.map((b, i) => (
          <group key={i} position={[b.x, 0.045, b.z]}>
            {[-1.35, 1.35].map((dx) => (
              <mesh key={dx} position-x={dx} rotation-x={-Math.PI / 2}>
                <planeGeometry args={[0.12, 5]} />
                <meshBasicMaterial color="#e9e6dc" />
              </mesh>
            ))}
            <mesh position-z={b.face * 2.45} rotation-x={-Math.PI / 2}>
              <planeGeometry args={[2.82, 0.12]} />
              <meshBasicMaterial color="#e9e6dc" />
            </mesh>
          </group>
        ))}
        {/* the sign at the entrance */}
        <group position={[PARKING.x0 + 0.6, 0, PARKING.aisle - 4.2]} rotation-y={-Math.PI / 2}>
          <mesh position-y={1.4}>
            <cylinderGeometry args={[0.05, 0.05, 2.8, 8]} />
            <meshStandardMaterial color="#2a2d33" metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position-y={2.75}>
            <boxGeometry args={[1.6, 1.0, 0.08]} />
            <meshStandardMaterial color="#1b2f9e" roughness={0.5} />
          </mesh>
          {[1, -1].map((s) => (
            <group key={s} position={[0, 2.75, s * 0.05]} rotation-y={s > 0 ? 0 : Math.PI}>
              <Text position={[-0.45, 0, 0]} fontSize={0.7} anchorX="center" anchorY="middle" fontWeight={900}>
                P
                <meshBasicMaterial color="#ffffff" />
              </Text>
              <Text position={[0.28, 0.12, 0]} fontSize={0.17} anchorX="center" anchorY="middle">
                THE FEAST 2026
                <meshBasicMaterial color="#f2b81f" />
              </Text>
              <Text position={[0.28, -0.12, 0]} fontSize={0.17} anchorX="center" anchorY="middle">
                PARKING
                <meshBasicMaterial color="#ffffff" />
              </Text>
            </group>
          ))}
        </group>
      </group>
    </group>
  );
}
