"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { streamAt, type Stream } from "./processionData";
import { KINDS, registerCars, shared, tint, type Footprint, type LaneExit } from "./SetTraffic";

// The cars that turn off the through road at the T-junction into the side street: each swings
// round the corner on a curve, then drives away down the side street's lane (away from the
// junction: nothing comes up it into the T) until it's far off, or turns into the car park on the
// way. They leave the through road at least a few seconds apart and all drive at the same pace,
// so they never close up on one another.

type Turner = { kind: number; color: string; curve: THREE.QuadraticBezierCurve3; len: number; at: number; s: number; parked?: boolean };

/** Where the side street's lane runs: its path, the lane's offset, and the way away from the T. */
export type SideLane = { st: Stream; off: number; dir: 1 | -1; from: number; to: number };

const SPEED = 6.5;
const GAP_MS = 2200;

/** A turning off the through road into `side`, and the cars it has sent down it. */
export function useTurnOff(side: SideLane | null, s: number, park?: LaneExit | null) {
  return useMemo(() => {
    const cars: Turner[] = [];
    let last = -1e9;
    const P = { x: 0, z: 0, dx: 0, dz: 1, half: 4 };
    const exit: LaneExit | null = side
      ? {
          s,
          lead: 3,
          want: () => {
            // most of that lane's cars, a couple of seconds apart (so the avenue has a steady line)
            if (performance.now() - last < GAP_MS || Math.random() > 0.8) return false;
            last = performance.now();
            return true;
          },
          take: (kind, color, x, z, h) => {
            // round the corner: from where it leaves the through road to a point a little way
            // down the side street's lane, the corner itself as the curve's pull
            const start = side.from + side.dir * 12;
            streamAt(side.st, start, P);
            const end = new THREE.Vector3(P.x - P.dz * side.off, 0, P.z + P.dx * side.off);
            const a = new THREE.Vector3(x, 0, z);
            const ahead = new THREE.Vector3(x + Math.sin(h) * 8, 0, z + Math.cos(h) * 8);
            const curve = new THREE.QuadraticBezierCurve3(a, ahead, end);
            cars.push({ kind, color, curve, len: curve.getLength(), at: 0, s: start });
          },
        }
      : null;
    return { cars, exit, side, park: park ?? null };
  }, [side, s, park]);
}

/** Draws and drives the turned-off cars; `others` are footprints they must never drive into. */
export function Turners({ t, others, active = true }: { t: ReturnType<typeof useTurnOff>; others: () => Footprint[]; active?: boolean }) {
  const { geos, mat } = shared();
  const meshes = useRef<(THREE.InstancedMesh | null)[]>([]);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const one = useMemo(() => new THREE.Vector3(1, 1, 1), []);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const tan = useMemo(() => new THREE.Vector3(), []);
  const col = useMemo(() => new THREE.Color(), []);
  const P = useMemo(() => ({ x: 0, z: 0, dx: 0, dz: 1, half: 4 }), []);
  useFrame((_, rawDt) => {
    if (!active) return;
    const dt = Math.min(rawDt, 0.1);
    const side = t.side;
    const n = KINDS.map(() => 0);
    if (side) {
      const obstacles = others();
      for (const c of t.cars) {
        if (c.parked) continue;
        // where it would be after this step
        const go = SPEED * dt;
        let x: number, z: number, h: number;
        const place = (at: number, s: number) => {
          if (at < c.len) {
            const u = Math.min(1, at / c.len);
            c.curve.getPointAt(u, pos);
            c.curve.getTangentAt(u, tan);
            return [pos.x, pos.z, Math.atan2(tan.x, tan.z)];
          }
          streamAt(side.st, s, P);
          return [P.x - P.dz * side.off, P.z + P.dx * side.off, Math.atan2(P.dx, P.dz) + (side.dir < 0 ? Math.PI : 0)];
        };
        const nextAt = c.at + go;
        const nextS = c.at >= c.len ? c.s + go * side.dir : c.s;
        [x, z, h] = place(nextAt, nextS);
        const me: Footprint = { x, z, h, l: [4.4, 4.7, 4.7, 2.5, 1.8, 8.6][c.kind], w: 2 };
        // never into anyone: if this step would touch someone, it waits for them
        const [px, pz, ph] = place(c.at, c.s);
        const was: Footprint = { ...me, x: px, z: pz, h: ph };
        // (only what's ahead of it, and only if this step would newly touch it)
        const inWay = (o: Footprint) => {
          const dx = o.x - px, dz = o.z - pz, d = Math.hypot(dx, dz);
          return d < 10 && d > 0.01 && dx * Math.sin(ph) + dz * Math.cos(ph) > 0.2 * d && overlap(me, o) && !overlap(was, o);
        };
        if (!obstacles.some(inWay)) {
          c.at = nextAt;
          c.s = nextS;
        }
        [x, z, h] = place(c.at, c.s);
        // the car park on the way: in it goes, if there's a bay
        const pk = t.park;
        if (pk && c.at >= c.len && Math.abs(c.s - pk.s) < go + 0.01 && pk.want(c.kind)) {
          pk.take(c.kind, c.color, x, z, h, SPEED);
          c.parked = true;
          continue;
        }
        const im = meshes.current[c.kind];
        if (!im || n[c.kind] >= 40) continue;
        q.setFromAxisAngle(up, h);
        m.compose(pos.set(x, 0, z), q, one);
        const i = n[c.kind]++;
        im.setMatrixAt(i, m);
        im.setColorAt(i, tint(c.color));
      }
      // seen by the columns too: the car behind on the through road waits while one turns
      registerCars(t, t.cars.filter((c) => !c.parked).map((c) => {
        const [x, z, h] = c.at < c.len ? (c.curve.getPointAt(Math.min(1, c.at / c.len), pos), c.curve.getTangentAt(Math.min(1, c.at / c.len), tan), [pos.x, pos.z, Math.atan2(tan.x, tan.z)]) : (streamAt(side.st, c.s, P), [P.x - P.dz * side.off, P.z + P.dx * side.off, Math.atan2(P.dx, P.dz) + (side.dir < 0 ? Math.PI : 0)]);
        return { x, z, h, l: 4.6, w: 2 };
      }));
      // far down the side street (out of sight), or parked: done
      for (let i = t.cars.length - 1; i >= 0; i--) {
        const c = t.cars[i];
        if (c.parked || (c.at >= c.len && (c.s - side.to) * side.dir >= 0)) t.cars.splice(i, 1);
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
  return (
    <group>
      {geos.map((g, k) => (
        <instancedMesh
          key={k}
          ref={(im) => {
            meshes.current[k] = im;
            if (im && !im.instanceColor) for (let i = 0; i < 40; i++) im.setColorAt(i, col.set("#ffffff"));
          }}
          args={[g, mat, 40]}
          castShadow
          receiveShadow
          frustumCulled={false}
        />
      ))}
    </group>
  );
}

/** Do two footprints overlap (a little padding all round)? */
function overlap(a: Footprint, b: Footprint) {
  const axes = [
    [Math.sin(a.h), Math.cos(a.h)],
    [Math.cos(a.h), -Math.sin(a.h)],
    [Math.sin(b.h), Math.cos(b.h)],
    [Math.cos(b.h), -Math.sin(b.h)],
  ];
  const dx = b.x - a.x, dz = b.z - a.z;
  for (const [ux, uz] of axes) {
    const r = (f: Footprint) => (f.l / 2 + 0.6) * Math.abs(Math.sin(f.h) * ux + Math.cos(f.h) * uz) + (f.w / 2 + 0.2) * Math.abs(Math.cos(f.h) * ux - Math.sin(f.h) * uz);
    if (Math.abs(dx * ux + dz * uz) > r(a) + r(b)) return false;
  }
  return true;
}
