"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { streamAt, type Stream } from "./processionData";
import { CAR_COLORS, KINDS, registerCars, shared, tint, type ColumnCar, type Footprint, type LaneExit } from "./SetTraffic";

// The T-junction at the compound's corner, both ways. Some of the through road's cars (a random
// few, more of them when the road is slow) turn straight off it, round the corner into the avenue's
// second free lane (the crowd and its cones keep the fence side) and drive away; and cars come up
// the avenue's far lane, wait at the mouth, and pull out into the through road's line, each into a
// place a turner left. The two never cross: the turners swing in before the joiners come out.

/** `clear`: how far round it has to go before all of it is out of the lane it left (until then it never stops) */
type Turner = { kind: number; color: string; path: THREE.Curve<THREE.Vector3>; len: number; clear: number; at: number; s: number; v: number; parked?: boolean };
type Joiner = {
  kind: number;
  color: number;
  /** up the avenue (on its path), then along the lead-in to the mouth (`at`), then pulling out */
  s: number;
  at: number;
  /** the place in the line it's pulling into, where that place was when it set off, and how far it had to go */
  slot?: ColumnCar;
  s0?: number;
  dist?: number;
};

/**
 * The avenue and the turning lane of the through road at the T. `st` runs up the avenue towards
 * the T; `i0` is where it's still straight, `to` far down it out of sight; `out` and `in` are the
 * avenue lanes' offsets (turning in, coming out); `main` is the through road's lane at the T.
 */
export type Junction = {
  st: Stream;
  i0: number;
  to: number;
  out: number;
  in: number;
  main: { st: Stream; s: number; off: number; dir: 1 | -1 };
};

const SPEED = 6.5;
/** How tight the corners are turned (metres from where the two lanes cross). */
const R = 7;
const MAX_JOINERS = 6;

const v3 = (x: number, z: number) => new THREE.Vector3(x, 0, z);
/** Where two lines (point + direction, on the ground) cross: how far along the first. */
function cross(p: THREE.Vector3, d: THREE.Vector3, q: THREE.Vector3, e: THREE.Vector3) {
  const den = d.x * e.z - d.z * e.x;
  if (Math.abs(den) < 1e-6) return null;
  return ((q.x - p.x) * e.z - (q.z - p.z) * e.x) / den;
}

/** The turning and the joining at the T, and the cars on them. */
export function useTurnOff(j: Junction | null, park?: LaneExit | null) {
  return useMemo(() => {
    const turners: Turner[] = [];
    const joiners: Joiner[] = [];
    // their registry keys: the joiners (the line never waits for them: they move in step with
    // their place in it) and the turners (the line never queues behind them, but never drives into one)
    const owner = {}, leaving = {};
    const none = { turners, joiners, exit: null, j, park: park ?? null, owner, leaving, geo: null };
    if (!j) return none;
    const P = { x: 0, z: 0, dx: 0, dz: 1, half: 4 };
    // the avenue, straight: towards the T along u, its lanes at their offsets
    streamAt(j.st, j.i0, P);
    const u = v3(P.dx, P.dz);
    const lane = (off: number) => v3(P.x - P.dz * off, P.z + P.dx * off);
    const outEnd = lane(j.out), inStart = lane(j.in);
    // the through road's lane at the T, the way its cars drive
    const Q = { x: 0, z: 0, dx: 0, dz: 1, half: 4 };
    streamAt(j.main.st, j.main.s, Q);
    const d = v3(Q.dx * j.main.dir, Q.dz * j.main.dir);
    const q0 = v3(Q.x - Q.dz * j.main.off, Q.z + Q.dx * j.main.off);
    // turning in: where the lane crosses the avenue's "out" lane is the corner
    const tOut = cross(q0, d, outEnd, u);
    const tIn = cross(q0, d, inStart, u);
    if (tOut === null || tIn === null) return none;
    const cOut = q0.clone().addScaledVector(d, tOut);
    const afterOut = cOut.clone().addScaledVector(u, -R);
    // coming out: up the "in" lane to the mouth, round the corner into the line
    const cIn = q0.clone().addScaledVector(d, tIn);
    // (waiting a little back from the corner, well clear of anything swinging in past it)
    const mouth = cIn.clone().addScaledVector(u, -R - 3);
    const into = cIn.clone().addScaledVector(d, R);
    const leadIn = new THREE.LineCurve3(inStart, mouth);
    const pullOut = new THREE.QuadraticBezierCurve3(mouth, cIn, into);
    const geo = {
      leadIn,
      leadLen: leadIn.getLength(),
      pullOut,
      pullLen: pullOut.getLength(),
      /** where in the line a joiner ends up (through road's own measure) */
      sJoin: j.main.s + (tIn + R) * j.main.dir,
      u,
    };
    // a few already on their way up the avenue, so cars come out from the start
    for (let k = 3; k >= 1; k--) {
      const s = j.to + ((j.i0 - j.to) * k) / 4;
      joiners.push({ kind: [0, 2, 3][k - 1], color: Math.floor(Math.random() * CAR_COLORS.length), s, at: 0 });
    }
    let last = -1e9;
    const exit: LaneExit = {
      // the turn starts R before the corner
      s: j.main.s + (tOut - R) * j.main.dir,
      lead: 3,
      owner,
      leaving,
      want: (_kind, speed) => {
        // a random few, never two on top of each other; more of them when the road is slow
        const now = performance.now();
        if (now - last < 1100) return false;
        // and only with room round the corner: the last one in well on its way down the avenue
        if (turners.some((c) => !c.parked && c.at < c.clear + 10)) return false;
        if (Math.random() > (speed < 3 ? 0.7 : 0.4)) return false;
        last = now;
        return true;
      },
      take: (kind, color, x, z, h, speed) => {
        // from where it is, round the corner and on down the "out" lane to where the avenue's straight
        const start = v3(x, z);
        const corner = new THREE.QuadraticBezierCurve3(start, cOut, afterOut);
        const path = new THREE.CurvePath<THREE.Vector3>();
        path.add(corner);
        path.add(new THREE.LineCurve3(afterOut, outEnd));
        const clear = corner.getLength() + KINDS[kind].len / 2 + 1.5;
        turners.push({ kind, color, path, len: path.getLength(), clear, at: 0, s: j.i0, v: Math.max(speed, 1.5) });
      },
    };
    return { turners, joiners, exit, j, park: park ?? null, owner, leaving, geo };
  }, [j, park]);
}

/** Draws and drives the cars at the T; `others` are footprints they must never drive into. */
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
  const nextJoiner = useRef(0);
  const clock = useRef(0);
  useFrame((_, rawDt) => {
    if (!active) return;
    const dt = Math.min(rawDt, 0.1);
    clock.current += dt;
    const { j, geo } = t;
    const n = KINDS.map(() => 0);
    const draw = (kind: number, x: number, z: number, h: number, color: THREE.Color) => {
      const im = meshes.current[kind];
      if (!im || n[kind] >= 40) return;
      q.setFromAxisAngle(up, h);
      m.compose(pos.set(x, 0, z), q, one);
      const i = n[kind]++;
      im.setMatrixAt(i, m);
      im.setColorAt(i, color);
    };
    const seen: Footprint[] = [], gone: Footprint[] = [];
    if (j && geo) {
      const obstacles = others();
      const away = Math.PI;

      // ---- turning in ----
      for (const c of t.turners) {
        if (c.parked) continue;
        const place = (at: number, s: number): [number, number, number] => {
          if (at < c.len) {
            const u = Math.min(1, at / c.len);
            c.path.getPointAt(u, pos);
            c.path.getTangentAt(u, tan);
            return [pos.x, pos.z, Math.atan2(tan.x, tan.z)];
          }
          streamAt(j.st, s, P);
          return [P.x - P.dz * j.out, P.z + P.dx * j.out, Math.atan2(P.dx, P.dz) + away];
        };
        // off the line at the pace the line was going, then up to speed
        c.v = Math.min(SPEED, c.v + 1.5 * dt);
        const go = c.v * dt;
        const nextAt = c.at + go;
        const nextS = c.at >= c.len ? c.s - go : c.s;
        const [nx, nz, nh] = place(nextAt, nextS);
        const [px, pz, ph] = place(c.at, c.s);
        const me: Footprint = { x: nx, z: nz, h: nh, l: KINDS[c.kind].len, w: 2 };
        const was: Footprint = { ...me, x: px, z: pz, h: ph };
        // never into anyone ahead; but never stopping while any of it is still in the lane it
        // left (the cars behind would be held up there): until it's clear, it just keeps going
        const inWay = (o: Footprint) => {
          const dx = o.x - px, dz = o.z - pz, dd = Math.hypot(dx, dz);
          return dd < 10 && dd > 0.01 && dx * Math.sin(ph) + dz * Math.cos(ph) > 0.2 * dd && overlap(me, o) && !overlap(was, o);
        };
        if (c.at < c.clear || !obstacles.some(inWay)) {
          c.at = nextAt;
          c.s = nextS;
        } else c.v = 0;
        const [x, z, h] = place(c.at, c.s);
        // the car park on the way: in it goes, if there's a bay
        const pk = t.park;
        if (pk && c.at >= c.len && Math.abs(c.s - pk.s) < go + 0.01 && pk.want(c.kind, c.v)) {
          pk.take(c.kind, c.color, x, z, h, SPEED);
          c.parked = true;
          continue;
        }
        draw(c.kind, x, z, h, tint(c.color));
        gone.push({ x, z, h, l: KINDS[c.kind].len, w: KINDS[c.kind].w });
      }
      for (let i = t.turners.length - 1; i >= 0; i--) {
        const c = t.turners[i];
        if (c.parked || (c.at >= c.len && c.s <= j.to)) t.turners.splice(i, 1);
      }

      // ---- coming out ----
      // now and then a car starts up the avenue from far off (only so many queue at once)
      if (clock.current > nextJoiner.current && t.joiners.length < MAX_JOINERS) {
        const lastOne = t.joiners[t.joiners.length - 1];
        if (!lastOne || lastOne.s > j.to + 14 || lastOne.at > 0) {
          let kind = 0;
          for (let x = Math.random() * 0.94; kind < 4 && (x -= KINDS[kind].share) > 0; ) kind++;
          t.joiners.push({ kind, color: Math.floor(Math.random() * CAR_COLORS.length), s: j.to, at: 0 });
          nextJoiner.current = clock.current + 3 + Math.random() * 6;
        }
      }
      const live = t.exit?.live;
      // how far each has come (for keeping their distance in the queue)
      const progress = (c: Joiner) => (c.at > 0 || c.s >= j.i0 ? j.i0 + c.at : c.s);
      let ahead: Joiner | null = null;
      for (const c of t.joiners) {
        let x: number, z: number, h: number;
        if (c.slot && live) {
          // pulling out: in step with its place in the line, which carries it the rest of the way
          const done = Math.min(1, Math.max(0, ((c.slot.s - c.s0!) * live.dir) / c.dist!));
          geo.pullOut.getPointAt(done, pos);
          geo.pullOut.getTangentAt(done, tan);
          [x, z, h] = [pos.x, pos.z, Math.atan2(tan.x, tan.z)];
          if (done >= 1) {
            // in its place: from now on it's one of the line
            c.slot.kind = c.kind;
            c.slot.color = c.color;
            c.slot.gone = c.slot.claimed = false;
            c.at = -1;
          }
        } else {
          // up the avenue, keeping its distance to the one in front, to the mouth
          const room = ahead ? progress(ahead) - progress(c) - (KINDS[ahead.kind].len + KINDS[c.kind].len) / 2 - 3 : Infinity;
          const go = Math.max(0, Math.min(SPEED * dt, room));
          if (c.s < j.i0) c.s = Math.min(j.i0, c.s + go);
          else c.at = Math.min(geo.leadLen, c.at + go);
          if (c.s < j.i0) {
            streamAt(j.st, c.s, P);
            [x, z, h] = [P.x - P.dz * j.in, P.z + P.dx * j.in, Math.atan2(P.dx, P.dz)];
          } else {
            geo.leadIn.getPointAt(c.at / geo.leadLen, pos);
            [x, z, h] = [pos.x, pos.z, Math.atan2(geo.u.x, geo.u.z)];
          }
          // at the mouth: out it goes into the next place a turner left that will reach it in step
          if (c.at >= geo.leadLen && live && (live.vel ?? 0) > 0.5) {
            for (const s of live.cars) {
              if (!s.gone || s.claimed || KINDS[s.kind].len < KINDS[c.kind].len) continue;
              const dist = (geo.sJoin - s.s) * live.dir;
              if (dist < geo.pullLen * 0.8 || dist > geo.pullLen * 2.2) continue;
              s.claimed = true;
              c.slot = s;
              c.s0 = s.s;
              c.dist = dist;
              break;
            }
          }
        }
        draw(c.kind, x, z, h, tint(KINDS[c.kind].tint ? CAR_COLORS[c.color] : "#ffffff"));
        seen.push({ x, z, h, l: KINDS[c.kind].len, w: 2 });
        ahead = c;
      }
      for (let i = t.joiners.length - 1; i >= 0; i--) if (t.joiners[i].at < 0) t.joiners.splice(i, 1);
    }
    // seen by everyone else (the through road's own lane knows to leave them be)
    registerCars(t.owner, seen);
    registerCars(t.leaving, gone);
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
