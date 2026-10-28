"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { inTheWay, trafficNow } from "./trafficLive";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { MAJOR, type LagosWorld, type Road } from "./lagosData";
import { resample, type Stream } from "./processionData";
import { SetTraffic, columnCars, footprintsMeet, tint, type Footprint, type LaneExit } from "./SetTraffic";
import { Turners, useTurnOff, type Junction } from "./Turners";
import { CarPark, parkingExit } from "./CarPark";
import { COMPOUND } from "./compound";
import type { CarState } from "./Driving";
import { brtBus, danfo, keke, molue, okada, sedan, suv, truck } from "./vehicleModels";

// Busy Lagos traffic around the player: danfos, BRT buses on their lanes, molues, cars, SUVs,
// kekes, okadas and trucks. Vehicles keep to their lanes (one-way carriageways run one way),
// queue behind each other, carry on through junctions, and are recycled around the player so
// the streets you can see are always full.

const KINDS = [
  { name: "sedan", len: 4.4, w: 1.8, speed: [11, 17], share: 0.36 },
  { name: "suv", len: 4.7, w: 1.9, speed: [11, 17], share: 0.13 },
  { name: "danfo", len: 4.7, w: 2.0, speed: [10, 16], share: 0.22 },
  { name: "brt", len: 12, w: 2.6, speed: [9, 13], share: 0 }, // only on BRT lanes
  { name: "molue", len: 10, w: 2.5, speed: [6, 9], share: 0.04 },
  { name: "keke", len: 2.5, w: 1.4, speed: [5, 8], share: 0.1 },
  { name: "okada", len: 1.8, w: 0.8, speed: [8, 13], share: 0.1 },
  { name: "truck", len: 8.6, w: 2.5, speed: [6, 9], share: 0.05 },
] as const;

/** A grid cell's key: its two indices packed into one number. */
const cellKey = (gx: number, gz: number) => (gx + 32768) * 65536 + (gz + 32768);
const NONE: never[] = [];
const TRUCK_COLORS = ["#e6e6e6", "#2d5aa8", "#c2410c"];
const CAR_COLORS = ["#e9ecf0", "#1c1f26", "#8c1d1d", "#2c4a7a", "#b9bcc2", "#5a5f66", "#e8e3d5", "#20472e", "#c9b28a", "#7a2f6b"];

type Lane = { road: Road; offset: number; dir: 1 | -1; brt: boolean };

/** Live traffic positions, read by the player's autopilot to weave through gaps. */
export { trafficNow };
type Vehicle = { kind: number; lane: Lane; seg: number; t: number; speed: number; want: number; x: number; z: number; h: number; color: number; touch?: number; stuck?: number; idx: number; off?: number; wait?: number; backing?: number };

const RADIUS = 520; // vehicles live within this distance of the player
/** Comfortable braking (m/s²): how far ahead a driver needs to look to stop in time. */
const BRAKE = 7;

/** Do two vehicles' footprints (rectangles at x, z turned to heading h) overlap? Half sizes padded a little. */
function overlaps(ax: number, az: number, ah: number, al: number, aw: number, bx: number, bz: number, bh: number, bl: number, bw: number) {
  const axes = [
    [Math.sin(ah), Math.cos(ah)],
    [Math.cos(ah), -Math.sin(ah)],
    [Math.sin(bh), Math.cos(bh)],
    [Math.cos(bh), -Math.sin(bh)],
  ];
  const dx = bx - ax, dz = bz - az;
  for (const [ux, uz] of axes) {
    const ra = al * Math.abs(Math.sin(ah) * ux + Math.cos(ah) * uz) + aw * Math.abs(Math.cos(ah) * ux - Math.sin(ah) * uz);
    const rb = bl * Math.abs(Math.sin(bh) * ux + Math.cos(bh) * uz) + bw * Math.abs(Math.cos(bh) * ux - Math.sin(bh) * uz);
    if (Math.abs(dx * ux + dz * uz) > ra + rb) return false;
  }
  return true;
}
const halfLen = (k: number) => KINDS[k].len / 2 + 0.35;
const halfW = (k: number) => KINDS[k].w / 2 + 0.15;
const LANE_W = 3.4;

function lanesOf(r: Road): Lane[] {
  const out: Lane[] = [];
  if (r.oneway) {
    for (let i = 0; i < Math.max(1, r.lanes); i++) out.push({ road: r, offset: r.width / 2 - 0.6 - LANE_W / 2 - LANE_W * i, dir: 1, brt: false });
    if (r.brt) out.push({ road: r, offset: -(r.width / 2 - 0.6 - 1.8), dir: 1, brt: true });
  } else {
    const per = Math.max(1, Math.floor(r.lanes / 2));
    for (const dir of [1, -1] as const)
      for (let i = 0; i < per; i++) out.push({ road: r, offset: Math.max(1.5, r.width / 2 - 0.6 - LANE_W / 2 - LANE_W * i), dir, brt: false });
  }
  return out;
}

/**
 * The roads the Feast crowd walks along (by the Fusion Centre's fence): which side of each is the
 * fence, as +1/−1 across its own direction (right of travel along its points). The crowd walks
 * the outer lane along the fence and traffic keeps moving in the other three.
 */
function sharedRoads(roads: Road[], walks: Stream[], fence: [number, number]) {
  const out = new Map<Road, 1 | -1>();
  if (!walks.length) return { out, cones: [] as [number, number][], walked: () => false };
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const st of walks)
    for (let i = 0; i < st.length; i++) {
      minX = Math.min(minX, st.x[i]); maxX = Math.max(maxX, st.x[i]);
      minZ = Math.min(minZ, st.z[i]); maxZ = Math.max(maxZ, st.z[i]);
    }
  /** Is a crowd walking along here, in line with direction (dx, dz)? */
  const walked = (x: number, z: number, dx: number, dz: number) => {
    if (x < minX - 10 || x > maxX + 10 || z < minZ - 10 || z > maxZ + 10) return false;
    for (const st of walks)
      for (let i = 0; i < st.length; i += 2)
        if (Math.hypot(st.x[i] - x, st.z[i] - z) < st.half[i] + 1.5 && Math.abs(st.dx[i] * dx + st.dz[i] * dz) > 0.8) return true;
    return false;
  };
  const cones: [number, number][] = [];
  for (const r of roads) {
    let hits = 0, side = 0;
    const here: [number, number, number, number][] = [];
    for (let i = 1; i < r.pts.length; i++) {
      const [ax, az] = r.pts[i - 1], [bx, bz] = r.pts[i];
      const len = Math.hypot(bx - ax, bz - az) || 1;
      const dx = (bx - ax) / len, dz = (bz - az) / len;
      for (let d = 0; d < len; d += 4) {
        const x = ax + dx * d, z = az + dz * d;
        if (!walked(x, z, dx, dz)) continue;
        hits++;
        // right of travel is (−dz, dx): which way is the fence from here
        side += -dz * (fence[0] - x) + dx * (fence[1] - z) > 0 ? 1 : -1;
        here.push([x, z, dx, dz]);
      }
    }
    if (hits < 4) continue;
    const c: 1 | -1 = side > 0 ? 1 : -1;
    out.set(r, c);
    // a line of cones along the crowd's lane, between it and the traffic's three
    for (const [x, z, dx, dz] of here) cones.push([x - dz * c * (LANE_W - 0.1), z + dx * c * (LANE_W - 0.1)]);
  }
  return { out, cones, walked };
}

/**
 * Two paths meeting at a corner (the end of `a` is the start of `b`), joined with a smooth curve
 * that starts `r` metres before the corner and ends `r` after it: lanes offset a few metres from
 * it then stay apart round the bend, rather than pinching together at a sharp angle.
 */
function roundCorner(a: [number, number][], b: [number, number][], r: number): [number, number][] {
  const C = a[a.length - 1];
  // walk back along a, forward along b, r metres
  const along = (pts: [number, number][], from: number, step: 1 | -1) => {
    let left = r;
    for (let i = from; i + step >= 0 && i + step < pts.length; i += step) {
      const p = pts[i], q = pts[i + step];
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (d >= left) return { i: i + step, pt: [p[0] + ((q[0] - p[0]) * left) / d, p[1] + ((q[1] - p[1]) * left) / d] as [number, number] };
      left -= d;
    }
    return { i: step > 0 ? pts.length - 1 : 0, pt: pts[step > 0 ? pts.length - 1 : 0] };
  };
  const A = along(a, a.length - 1, -1);
  const B = along(b, 0, 1);
  const curve: [number, number][] = [];
  for (let k = 0; k <= 16; k++) {
    const t = k / 16, u = 1 - t;
    curve.push([u * u * A.pt[0] + 2 * u * t * C[0] + t * t * B.pt[0], u * u * A.pt[1] + 2 * u * t * C[1] + t * t * B.pt[1]]);
  }
  return [...a.slice(0, A.i + 1), ...curve, ...b.slice(B.i)];
}

/**
 * The shared streets as continuous paths (an OSM street comes in pieces): each piece joined to
 * the next end to end, with the car lane's side and direction. The crowd has the lane along the
 * fence; the cars the other one, running the way that lane normally runs.
 */
function sharedStreets(shared: Map<Road, 1 | -1>, walked: (x: number, z: number, dx: number, dz: number) => boolean) {
  const left = [...shared.keys()];
  const out: { st: Stream; side: 1 | -1; dir: 1 | -1; lane: number; name: string; turned?: boolean }[] = [];
  const close = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 3;
  while (left.length) {
    const first = left.shift()!;
    let pts = [...first.pts];
    // fence side relative to the chain's own direction
    const c = shared.get(first)!;
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < left.length; i++) {
        const r = left[i];
        if (r.name !== first.name) continue;
        const p = r.pts, s0 = p[0], s1 = p[p.length - 1];
        const flip = shared.get(r)! !== c; // a piece drawn the other way round
        if (close(pts[pts.length - 1], s0) && !flip) pts = [...pts, ...p.slice(1)];
        else if (close(pts[pts.length - 1], s1) && flip) pts = [...pts, ...[...p].reverse().slice(1)];
        else if (close(pts[0], s1) && !flip) pts = [...p.slice(0, -1), ...pts];
        else if (close(pts[0], s0) && flip) pts = [...[...p].reverse().slice(0, -1), ...pts];
        else continue;
        left.splice(i, 1);
        grew = true;
        break;
      }
    }
    const lane = LANE_W / 2;
    // right of travel is +lat; the car lane is on the side away from the fence
    const side = -c as 1 | -1, dir: 1 | -1 = c < 0 ? 1 : -1;
    // the cars' lane in their own direction of travel (driving on the right)
    const car = dir > 0 ? pts : [...pts].reverse();
    const on = turnOnto(car, first, shared, walked);
    if (on) {
      const all = roundCorner(car, on.pts, 22);
      out.push({ st: resample(all, all.map(() => first.width / 2), STREET), side: 1, dir: 1, lane, name: first.name, turned: true });
    } else out.push({ st: resample(pts, pts.map(() => first.width / 2), STREET), side, dir, lane, name: first.name });
  }
  return out;
}

/**
 * Where a street's car lane runs into another shared street (a T-junction at the compound's
 * corner), the cars turn onto that street's free half, the way no crowd walks, instead of
 * stopping dead at the junction. Returns the road ahead after the turn (up to 300 m).
 */
function turnOnto(car: [number, number][], from: Road, shared: Map<Road, 1 | -1>, walked: (x: number, z: number, dx: number, dz: number) => boolean) {
  const end = car[car.length - 1];
  for (const r of shared.keys()) {
    if (r === from || r.name === from.name) continue;
    for (let k = 0; k < r.pts.length; k++) {
      if (Math.hypot(r.pts[k][0] - end[0], r.pts[k][1] - end[1]) > 3) continue;
      for (const d of [1, -1]) {
        const pts: [number, number][] = [];
        let acc = 0;
        for (let j = k + d; j >= 0 && j < r.pts.length && acc < 300; j += d) {
          const [ax, az] = r.pts[j - d], [bx, bz] = r.pts[j];
          acc += Math.hypot(bx - ax, bz - az);
          pts.push(r.pts[j]);
        }
        if (acc < 60) continue;
        // nobody walking along it for the first stretch
        let clear = true;
        let p = end;
        for (const q of pts) {
          const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
          const dx = (q[0] - p[0]) / l, dz = (q[1] - p[1]) / l;
          for (let s = 0; s < l && clear; s += 4) if (Math.hypot(p[0] + dx * s - end[0], p[1] + dz * s - end[1]) > 8 && walked(p[0] + dx * s, p[1] + dz * s, dx, dz)) clear = false;
          if (!clear || Math.hypot(q[0] - end[0], q[1] - end[1]) > 80) break;
          p = q;
        }
        if (clear) return { pts };
      }
    }
  }
  return null;
}
const STREET = { id: "street", name: "", sign: "", to: "", km: 0, bearing: 0 };

/**
 * Every other road is cut short where it would cross the crowd (a side street meeting the
 * crowd's lane, a crossroads), so no car ever drives through people. Cars reaching the cut
 * leave the street there.
 */
function cutAtCrowd(roads: Road[], shared: Map<Road, 1 | -1>, walks: Stream[]) {
  if (!walks.length) return roads;
  const near = (x: number, z: number) => {
    for (const st of walks) for (let i = 0; i < st.length; i += 2) if (Math.hypot(st.x[i] - x, st.z[i] - z) < st.half[i] + 2.5) return true;
    return false;
  };
  const out: Road[] = [];
  for (const r of roads) {
    if (shared.has(r)) {
      out.push(r);
      continue;
    }
    let run: Road["pts"] = [r.pts[0]];
    for (let i = 1; i < r.pts.length; i++) {
      const [ax, az] = r.pts[i - 1], [bx, bz] = r.pts[i];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 4));
      let hit = false;
      for (let j = 0; j <= n && !hit; j++) hit = near(ax + ((bx - ax) * j) / n, az + ((bz - az) * j) / n);
      if (!hit) {
        run.push(r.pts[i]);
        continue;
      }
      if (run.length > 1) out.push({ ...r, pts: run });
      run = [r.pts[i]];
    }
    if (run.length > 1) out.push({ ...r, pts: run });
  }
  return out;
}

/** Side streets: only for the busy streets around the Fusion Centre, not the long drive. */
const MINOR = new Set(["unclassified", "residential"]);

export function Traffic({
  world,
  count = 230,
  player,
  walks,
  radius = RADIUS,
  active = true,
}: {
  world: LagosWorld;
  count?: number;
  player?: React.RefObject<CarState | null>;
  walks?: Stream[];
  radius?: number;
  /** Mounted ahead of time (so building it never stalls a cut) but idle and hidden until needed. */
  active?: boolean;
}) {
  const camera = useThree((s) => s.camera);
  const RADIUS = radius;
  const { lanes, segs, ends, cones, streets, side, turnLane, park, onColumns } = useMemo(() => {
    const roads = world.roads.filter((r) => (MAJOR.has(r.type) || (walks && MINOR.has(r.type))) && r.pts.length > 1);
    const { out: shared, cones, walked } = sharedRoads(roads, walks ?? [], COMPOUND.center);
    // the streets by the fence have their own steady columns of cars (see SetTraffic)
    const lanes = cutAtCrowd(roads, shared, walks ?? []).filter((r) => !shared.has(r)).flatMap(lanesOf);
    // the streets by the fence. The through road (Acme) runs straight, both ways; the avenue ends
    // at it in a T, and nothing drives up the avenue into the T: instead some of the through road's
    // cars turn off there and drive away down the avenue (some of them into the car park)
    const all = sharedStreets(shared, walked);
    const through = all.filter((t) => !t.turned);
    const stem = all.find((t) => t.turned) ?? null;
    let side: Junction | null = null;
    let turnLane = -1;
    let park: LaneExit | null = null;
    const streets = through.map((t) => ({
      ...t,
      // four lanes: the crowd walks the one along the fence, cars have the other three (the
      // inner lane on the fence's side first)
      lanes: [
        { off: -t.side * t.lane, dir: -t.dir as 1 | -1, speed: 6.5 },
        { off: t.side * t.lane, dir: t.dir, speed: 8 },
        { off: t.side * t.lane * 3, dir: t.dir, speed: 6.5 },
      ],
      exit: null as LaneExit | null,
      exits: [] as (LaneExit & { lane: number })[],
    }));
    if (stem && streets.length) {
      const main = streets[0];
      // the T: where the avenue's path first meets the through road's
      const near = (x: number, z: number) => {
        let best = Infinity, at = 0;
        for (let j = 0; j < main.st.length; j++) {
          const d = Math.hypot(main.st.x[j] - x, main.st.z[j] - z);
          if (d < best) [best, at] = [d, j];
        }
        return { d: best, at };
      };
      let iT = -1;
      for (let i = 0; i < stem.st.length; i++)
        if (near(stem.st.x[i], stem.st.z[i]).d < 4) {
          iT = i;
          break;
        }
      if (iT > 40) {
        const sT = near(stem.st.x[iT], stem.st.z[iT]).at;
        // away from the T, down the avenue
        const ux = stem.st.x[iT - 30] - stem.st.x[iT], uz = stem.st.z[iT - 30] - stem.st.z[iT];
        // the through road's lane nearest the avenue (its curb lane on that side) turns off
        const P = { x: main.st.x[sT], z: main.st.z[sT], dx: main.st.dx[sT], dz: main.st.dz[sT] };
        let best = -Infinity;
        main.lanes.forEach((l, i) => {
          const lx = -P.dz * l.off, lz = P.dx * l.off;
          const toward = lx * ux + lz * uz;
          if (toward > best) [best, turnLane] = [toward, i];
        });
        // the avenue's free part: the crowd keeps to the fence side of its cones (which side, from
        // the cones themselves), the cars have the rest, three lanes across. Turning in, cars take
        // the second of them; coming out to join the through road, the far one.
        const i0 = iT - 28;
        let fence = -1;
        let closest = Infinity;
        for (const [x, z] of cones) {
          const ddx = x - stem.st.x[i0], ddz = z - stem.st.z[i0];
          const d = Math.hypot(ddx, ddz);
          if (d < closest) [closest, fence] = [d, -stem.st.dz[i0] * ddx + stem.st.dx[i0] * ddz > 0 ? 1 : -1];
        }
        const half = stem.st.half[i0];
        const from = -(LANE_W - 0.1) + 0.3, w = (half - 0.3 - from) / 3;
        const across = (k: number) => -fence * (from + w * (k + 0.5));
        side = {
          st: stem.st,
          i0,
          to: Math.max(0, iT - 420),
          out: across(1),
          in: across(2),
          main: { st: main.st, s: sT, off: main.lanes[turnLane].off, dir: main.lanes[turnLane].dir },
        };
        park = parkingExit(stem.st, stem.dir);
      }
    }
    // the side streets: cars only drive away from the streets by the fence, never out into them
    const columnPath = streets.map((t) => t.st);
    if (stem) columnPath.push(stem.st);
    const onColumns = (x: number, z: number) => columnPath.some((st) => {
      for (let j = 0; j < st.length; j += 2) if (Math.hypot(st.x[j] - x, st.z[j] - z) < 12) return true;
      return false;
    });
    const [ccx, ccz] = COMPOUND.center;
    for (let i = lanes.length - 1; i >= 0; i--) {
      const l = lanes[i], p = l.road.pts;
      const end = l.dir > 0 ? p[p.length - 1] : p[0];
      if (Math.hypot(end[0] - ccx, end[1] - ccz) < 260 && onColumns(end[0], end[1])) lanes.splice(i, 1);
    }
    // every lane segment, for spawning near the player
    const segs: { lane: Lane; seg: number; x: number; z: number }[] = [];
    for (const lane of lanes)
      for (let i = 1; i < lane.road.pts.length; i++) {
        const [ax, az] = lane.road.pts[i - 1];
        const [bx, bz] = lane.road.pts[i];
        // around the Fusion Centre most of the traffic is on the main roads, less in side streets
        const weight = walks && MAJOR.has(lane.road.type) ? 3 : 1;
        for (let w = 0; w < weight; w++) segs.push({ lane, seg: i - 1, x: (ax + bx) / 2, z: (az + bz) / 2 });
      }
    // around the Fusion Centre: only the streets near it are candidates for spawning (picking
    // from the whole city would almost never land within the radius)
    if (walks?.length) {
      const [cx, cz] = COMPOUND.center;
      for (let i = segs.length - 1; i >= 0; i--) if (Math.hypot(segs[i].x - cx, segs[i].z - cz) > radius * 1.1) segs.splice(i, 1);
    }
    // road endpoints, to continue through junctions
    const key = (p: [number, number]) => Math.round(p[0] / 3) + "," + Math.round(p[1] / 3);
    const ends = new Map<string, { lane: Lane; atStart: boolean }[]>();
    for (const lane of lanes) {
      const pts = lane.road.pts;
      for (const atStart of [true, false]) {
        const k = key(atStart ? pts[0] : pts[pts.length - 1]);
        if (!ends.has(k)) ends.set(k, []);
        ends.get(k)!.push({ lane, atStart });
      }
    }
    return { lanes, segs, ends, key, cones, streets, side, turnLane, park, onColumns };
  }, [world, walks, radius]);
  // the T-junction's turning: the through road's cars that take it, and what they give way to
  const turn = useTurnOff(side, park);
  const turnerObstacles = useMemo(
    // (the columns' cars, the other turners, the city traffic)
    // (not the through road's lane they turn off: they never stop while still in it; nor the
    // ones coming out, which keep to their own lane and corner)
    () => () => [...columnCars(turn.exit?.live, turn.owner), ...trafficNow.map((t) => ({ x: t.x, z: t.z, h: t.h, l: t.len, w: 2 }))],
    [turn],
  );

  const geos = useMemo(() => [sedan(), suv(), danfo(), brtBus(), molue(), keke(), okada(), truck()], []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.25 }), []);
  const meshes = useRef<(THREE.InstancedMesh | null)[]>([]);
  const rnd = useRef(17);
  const rand = () => ((rnd.current = (rnd.current * 16807) % 2147483647) / 2147483647);
  const focus = useRef(new THREE.Vector3());

  const pickKind = (brtLane: boolean) => {
    if (brtLane) return 3;
    let x = rand();
    for (let k = 0; k < KINDS.length; k++) {
      x -= KINDS[k].share;
      if (x <= 0) return k;
    }
    return 0;
  };

  const spawn = (v: Vehicle, near: THREE.Vector3, minDist: number, hidden = true, others: { x: number; z: number }[] = trafficNow) => {
    for (let tries = 0; tries < 40 && segs.length; tries++) {
      const s = segs[Math.floor(rand() * segs.length)];
      const d = Math.hypot(s.x - near.x, s.z - near.z);
      if (d > RADIUS * 0.95 || d < minDist) continue;
      // never appear on top of someone else
      const t = rand();
      const a = s.lane.road.pts[s.seg], b = s.lane.road.pts[s.seg + 1];
      const px = a[0] + (b[0] - a[0]) * t, pz = a[1] + (b[1] - a[1]) * t;
      if (others.some((o) => o !== v && Math.hypot(o.x - px, o.z - pz) < 14)) continue;
      // nor on (or at the mouth of) the streets with their own columns: it would stand in their way
      if (onColumns(px, pz)) continue;
      // never pop into view
      if (hidden && seen(px, pz)) continue;
      v.lane = s.lane;
      v.seg = s.seg;
      v.t = t;
      v.kind = pickKind(s.lane.brt);
      const sp = KINDS[v.kind].speed;
      v.want = sp[0] + rand() * (sp[1] - sp[0]);
      v.speed = v.want * 0.8;
      v.color = Math.floor(rand() * CAR_COLORS.length);
      v.x = px;
      v.z = pz;
      v.off = undefined;
      return true;
    }
    return false;
  };

  const vehicles = useMemo<Vehicle[]>(() => {
    let nextIdx = 0;
    const start = player?.current ? new THREE.Vector3(player.current.x, 0, player.current.z) : new THREE.Vector3();
    // (each placed clear of the ones already placed)
    const made: Vehicle[] = [];
    for (let i = 0; i < count; i++) {
      const v: Vehicle = { kind: 0, lane: lanes[0], seg: 0, t: 0, speed: 0, want: 10, x: 1e9, z: 1e9, h: 0, color: 0, idx: nextIdx++ };
      spawn(v, start, 0, false, made);
      made.push(v);
    }
    return made;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lanes, count]);

  /** At the end of a road, pick a connected lane going on in a sensible direction. */
  const continueOn = (v: Vehicle) => {
    const pts = v.lane.road.pts;
    const end = v.lane.dir > 0 ? pts[pts.length - 1] : pts[0];
    const before = v.lane.dir > 0 ? pts[pts.length - 2] : pts[1];
    const hx = end[0] - before[0], hz = end[1] - before[1];
    const k = Math.round(end[0] / 3) + "," + Math.round(end[1] / 3);
    const options = (ends.get(k) ?? []).filter(({ lane, atStart }) => {
      if (lane.road === v.lane.road || lane.brt !== v.lane.brt) return false;
      // leave from this end: one-way lanes only from their start
      const goesOut = lane.dir > 0 ? atStart : !atStart;
      if (!goesOut) return false;
      const p = lane.road.pts;
      const a = lane.dir > 0 ? p[0] : p[p.length - 1];
      const b = lane.dir > 0 ? p[1] : p[p.length - 2];
      const dot = (b[0] - a[0]) * hx + (b[1] - a[1]) * hz;
      return dot > -0.2 * Math.hypot(b[0] - a[0], b[1] - a[1]) * Math.hypot(hx, hz); // no U-turns
    });
    if (!options.length) return false;
    const o = options[Math.floor(rand() * options.length)];
    v.lane = o.lane;
    v.seg = o.lane.dir > 0 ? 0 : o.lane.road.pts.length - 2;
    v.t = o.lane.dir > 0 ? 0 : 1;
    return true;
  };

  /** A dead end (a street cut short before the crowd): turn round into the other lane, never vanish. */
  const uTurn = (v: Vehicle) => {
    const back = lanes.find((l) => l.road === v.lane.road && l.dir === -v.lane.dir && l.brt === v.lane.brt);
    if (!back) return false;
    // wait at the end until the other lane is clear there, so it never turns into another car
    if (vehicles.some((o) => o !== v && o.lane === back && Math.hypot(o.x - v.x, o.z - v.z) < KINDS[v.kind].len + 6)) {
      v.t = THREE.MathUtils.clamp(v.t, 0, 1);
      v.speed = 0;
      return true;
    }
    v.lane = back;
    v.seg = back.dir > 0 ? 0 : back.road.pts.length - 2;
    v.t = back.dir > 0 ? 0 : 1;
    v.speed *= 0.3;
    // same spot, now measured from the other way round: it drifts across into its new lane
    if (v.off !== undefined) v.off = -v.off;
    return true;
  };
  /** Is this spot on screen? (vehicles are only ever recycled out of sight) */
  const frustum = useMemo(() => new THREE.Frustum(), []);
  const pv = useMemo(() => new THREE.Matrix4(), []);
  const seen = (x: number, z: number) => frustum.containsPoint(pos.set(x, 1, z));

  const m = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const one = useMemo(() => new THREE.Vector3(1, 1, 1), []);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const col = useMemo(() => new THREE.Color(), []);
  const grid = useMemo(() => new Map<number, Vehicle[]>(), []);

  useFrame((_, rawDt) => {
    if (!active) return;
    const dt = Math.min(rawDt, 0.05);
    const pc = player?.current;
    frustum.setFromProjectionMatrix(pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    if (pc) focus.current.set(pc.x, 0, pc.z);
    else {
      camera.getWorldDirection(pos);
      focus.current.copy(camera.position).addScaledVector(pos, 60).setY(0);
    }

    // spatial grid for following distances
    // (number keys and kept arrays: nothing built from scratch every frame)
    for (const cell of grid.values()) cell.length = 0;
    for (const v of vehicles) {
      const k = cellKey(Math.floor(v.x / 20), Math.floor(v.z / 20));
      let cell = grid.get(k);
      if (!cell) grid.set(k, (cell = []));
      cell.push(v);
    }

    // the street columns' cars (by the fence): given way to like anyone else
    const cols = columnCars();
    const counters = new Array(KINDS.length).fill(0);
    for (const v of vehicles) {
      // recycle vehicles that fell far behind
      if (Math.hypot(v.x - focus.current.x, v.z - focus.current.z) > RADIUS && !seen(v.x, v.z)) spawn(v, focus.current, 160);

      // slow for whatever is ahead in the same lane (including the player's cab)
      const fx = Math.sin(v.h), fz = Math.cos(v.h);
      const need = KINDS[v.kind].len / 2 + 2.5 + v.speed * 0.9;
      let target = v.want;
      const gx = Math.floor(v.x / 20), gz = Math.floor(v.z / 20);
      for (let ix = -1; ix <= 1; ix++)
        for (let iz = -1; iz <= 1; iz++)
          for (const o of grid.get(cellKey(gx + ix, gz + iz)) ?? NONE) {
            if (o === v) continue;
            const dx = o.x - v.x, dz = o.z - v.z;
            const ahead = dx * fx + dz * fz;
            const side = Math.abs(dx * fz - dz * fx);
            const reach = KINDS[v.kind].len / 2 + KINDS[o.kind].len / 2;
            // personal space, any lane, any angle: never drive into another vehicle. At crossings
            // the one that is ahead in the other's path waits; ties go to the lower index.
            // (oncoming traffic in its own lane alongside just passes)
            const oncoming = Math.sin(o.h) * fx + Math.cos(o.h) * fz < -0.5;
            // far enough ahead to stop in time at this speed, and wide enough for the two of them
            const stopIn = reach + 2.5 + (v.speed * v.speed) / (2 * BRAKE);
            const clear = oncoming ? 1.6 : (KINDS[v.kind].w + KINDS[o.kind].w) / 2 + 0.9;
            if (ahead > 0 && ahead < stopIn && side < clear) {
              const oAhead = -(dx * Math.sin(o.h) + dz * Math.cos(o.h));
              if (!(oAhead > 0 && oAhead < reach + 2.5 && v.idx < o.idx)) target = Math.min(target, ahead < reach + 2.5 ? 0 : Math.max(0, Math.sqrt(2 * BRAKE * (ahead - reach - 2.5))));
              continue;
            }
            if (ahead <= 0 || ahead > need + KINDS[o.kind].len / 2) continue;
            if (side > 1.6) continue;
            if (Math.sin(o.h) * fx + Math.cos(o.h) * fz < 0.5) continue;
            target = Math.min(target, ahead < reach + 1.5 ? 0 : o.speed);
          }
      // a street column's car in the way ahead: ease to a stop and wait for it
      {
        const me: Footprint = { x: v.x, z: v.z, h: v.h, l: KINDS[v.kind].len, w: KINDS[v.kind].w };
        const look = 1.5 + (v.speed * v.speed) / (2 * BRAKE);
        for (const o of cols) {
          const dx = o.x - v.x, dz = o.z - v.z;
          const d = Math.hypot(dx, dz);
          if (d > 25 || dx * fx + dz * fz < 0.3 * d) continue;
          // (waiting a while for a gap: it edges out into the next one, never into a car)
          if (footprintsMeet(me, o, (v.stuck ?? 0) > 4 ? 0.6 : look)) target = 0;
        }
      }
      // coming up to the end of the road (a junction): wait while someone else is in it, or nearer it
      {
        const pts = v.lane.road.pts;
        const last = v.lane.dir > 0 ? v.seg === pts.length - 2 : v.seg === 0;
        if (last) {
          const a = pts[v.seg], b = pts[v.seg + 1];
          const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
          const left = (v.lane.dir > 0 ? 1 - v.t : v.t) * segLen;
          const J = v.lane.dir > 0 ? pts[pts.length - 1] : pts[0];
          const mine = Math.hypot(v.x - J[0], v.z - J[1]);
          // the stop line is at the edge of the road being joined (10 m short of its middle: the
          // four-lane streets by the fence are 14 m across), so a car waiting there never sits in
          // anyone's lane; past it, it's committed and carries on through
          // the street by the fence has right of way: wait at the line while its traffic is near the
          // junction; with no gap for a long while, turn round and go back (never sit there for good)
          if (left < 26 && left > 10 && cols.some((o) => Math.hypot(o.x - J[0], o.z - J[1]) < 16)) {
            target = Math.min(target, Math.max(0, Math.sqrt(2 * BRAKE * Math.max(0, left - 10))));
            v.wait = (v.wait ?? 0) + dt;
            if (v.wait > 6 && v.speed < 0.3) {
              v.wait = 0;
              // (turned round right where it stands)
              const back = lanes.find((l) => l.road === v.lane.road && l.dir === -v.lane.dir && l.brt === v.lane.brt);
              if (back && !vehicles.some((o) => o !== v && o.lane === back && Math.hypot(o.x - v.x, o.z - v.z) < KINDS[v.kind].len + 6)) {
                // (same road, same spot along it: t runs the same way for both lanes)
                v.lane = back;
                if (v.off !== undefined) v.off = -v.off;
              }
            }
          } else v.wait = 0;
          if (left < 26 && left > 10)
            for (let ix = -1; ix <= 1; ix++)
              for (let iz = -1; iz <= 1; iz++)
                for (const o of grid.get(cellKey(Math.floor(J[0] / 20) + ix, Math.floor(J[1] / 20) + iz)) ?? NONE) {
                  if (o === v) continue;
                  const ox = J[0] - o.x, oz = J[1] - o.z;
                  const theirs = Math.hypot(ox, oz);
                  if (theirs > 12) continue;
                  // following me in my own lane: not in my way
                  const behindMe = (o.x - v.x) * fx + (o.z - v.z) * fz < 0 && Math.sin(o.h) * fx + Math.cos(o.h) * fz > 0.7;
                  if (behindMe) continue;
                  // already through and driving off: no matter
                  const leaving = ox * Math.sin(o.h) + oz * Math.cos(o.h) < 0 && theirs > 5;
                  if (leaving) continue;
                  if (theirs < 5 || theirs < mine - 0.5 || (Math.abs(theirs - mine) <= 0.5 && o.idx < v.idx)) target = Math.min(target, Math.max(0, Math.sqrt(2 * BRAKE * Math.max(0, left - 10))));
                }
        }
      }
      if (pc) {
        const dx = pc.x - v.x, dz = pc.z - v.z;
        const ahead = dx * fx + dz * fz;
        const sameWay = Math.sin(pc.heading) * fx + Math.cos(pc.heading) * fz > 0.5;
        if (sameWay && ahead > 0 && ahead < need + 3 && Math.abs(dx * fz - dz * fx) < 2) target = Math.min(target, Math.max(0, pc.speed * 0.9));
        // a knock: one jolt for the player, the other driver stops; anything still wedged
        // against the player after a moment is cleared off the road so nobody gets stuck
        if (Math.hypot(dx, dz) < 2.6) {
          if (!v.touch) {
            if (Math.abs(pc.speed) > 2) pc.bump = Math.max(pc.bump ?? 0, Math.min(1, Math.abs(pc.speed) / 15));
            pc.speed *= 0.7;
            v.speed = 0;
          }
          v.touch = (v.touch ?? 0) + dt;
          if (v.touch > 0.6) {
            spawn(v, focus.current, 160);
            v.touch = 0;
          }
        } else v.touch = 0;
      }
      // standing in a street column's way (it can't get past): back out, slowly, along its own road
      if (inTheWay.some((p) => Math.abs(p.x - v.x) < 0.01 && Math.abs(p.z - v.z) < 0.01)) v.backing = 1.5;
      if (v.backing) {
        v.backing = Math.max(0, v.backing - dt);
        target = -2;
      }
      v.speed += THREE.MathUtils.clamp(target - v.speed, -9 * dt, 3 * dt);
      // gridlock breaker: anything stationary for long is quietly taken off the road
      v.stuck = v.speed < 0.5 ? (v.stuck ?? 0) + dt : 0;
      if ((v.stuck > 8 && !seen(v.x, v.z)) || v.stuck > 25) {
        spawn(v, focus.current, 200);
        v.stuck = 0;
      }

      // where it was, in case this step would take it into someone (then it waits instead)
      const was = { lane: v.lane, seg: v.seg, t: v.t, x: v.x, z: v.z, h: v.h, off: v.off };
      // advance along the lane
      const pts = v.lane.road.pts;
      const a = pts[v.seg];
      const b = pts[v.seg + 1];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      v.t += ((v.speed * dt) / len) * v.lane.dir;
      if (v.speed < 0) v.t = THREE.MathUtils.clamp(v.t, 0, 1);
      if (v.t > 1 || v.t < 0) {
        const next = v.seg + v.lane.dir;
        if (next < 0 || next >= pts.length - 1) {
          if (!continueOn(v) && !uTurn(v)) spawn(v, focus.current, 160);
        } else {
          v.seg = next;
          v.t = v.lane.dir > 0 ? 0 : 1;
        }
        // (still drawn this frame, where it was: skipping it would make it blink)
      } else {
        const dx = ((b[0] - a[0]) / len) * v.lane.dir;
        const dz = ((b[1] - a[1]) / len) * v.lane.dir;
        // lane offset to the right of travel, eased so a lane change at a junction is a drift
        v.off = v.off === undefined ? v.lane.offset : v.off + (v.lane.offset - v.off) * Math.min(1, dt * 1.5);
        v.x = a[0] + (b[0] - a[0]) * v.t - dz * v.off;
        v.z = a[1] + (b[1] - a[1]) * v.t + dx * v.off;
        const h = Math.atan2(dx, dz);
        let dh = h - v.h;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        v.h += dh * Math.min(1, dt * 6);
      }
      // never into another vehicle: if this step makes it overlap someone it wasn't already
      // overlapping, it stays put and waits
      if (v.speed > 0.01) {
        const gx2 = Math.floor(v.x / 20), gz2 = Math.floor(v.z / 20);
        let hit = false;
        for (let ix = -1; ix <= 1 && !hit; ix++)
          for (let iz = -1; iz <= 1 && !hit; iz++)
            for (const o of grid.get(cellKey(gx2 + ix, gz2 + iz)) ?? NONE) {
              if (o === v) continue;
              const L = halfLen(v.kind), W = halfW(v.kind), oL = halfLen(o.kind), oW = halfW(o.kind);
              // (already overlapping someone: it may only move apart from them, never closer)
              if (overlaps(v.x, v.z, v.h, L, W, o.x, o.z, o.h, oL, oW) && (!overlaps(was.x, was.z, was.h, L, W, o.x, o.z, o.h, oL, oW) || Math.hypot(v.x - o.x, v.z - o.z) < Math.hypot(was.x - o.x, was.z - o.z))) {
                hit = true;
                break;
              }
            }
        // and the street columns' cars
        if (!hit)
          for (const o of cols) {
            if (Math.hypot(o.x - v.x, o.z - v.z) > 12) continue;
            const meNow: Footprint = { x: v.x, z: v.z, h: v.h, l: KINDS[v.kind].len, w: KINDS[v.kind].w };
            const meWas: Footprint = { ...meNow, x: was.x, z: was.z, h: was.h };
            if (footprintsMeet(meNow, o) && !footprintsMeet(meWas, o)) {
              hit = true;
              break;
            }
          }
        if (hit) {
          Object.assign(v, was);
          v.speed = 0;
        }
      }

      const im = meshes.current[v.kind];
      if (!im) continue;
      // anything right on top of the chase camera would fill the screen: leave it out of this frame
      if ((v.x - camera.position.x) ** 2 + (v.z - camera.position.z) ** 2 < 36 && camera.position.y < 6) continue;
      const i = counters[v.kind]++;
      q.setFromAxisAngle(up, v.h);
      m.compose(pos.set(v.x, 0, v.z), q, one);
      im.setMatrixAt(i, m);
      if (v.kind <= 1) im.setColorAt(i, tint(CAR_COLORS[v.color]));
      else if (v.kind === 7) im.setColorAt(i, tint(TRUCK_COLORS[v.color % 3]));
    }
    inTheWay.length = 0;
    trafficNow.length = 0;
    for (const v of vehicles) trafficNow.push({ x: v.x, z: v.z, h: v.h, speed: v.speed, len: KINDS[v.kind].len });
    meshes.current.forEach((im, k) => {
      if (!im) return;
      im.count = counters[k];
      im.visible = counters[k] > 0;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    });
  });

  return (
    <group visible={active}>
      {cones.length > 0 && <Cones at={cones} />}
      {walks?.length ? <CarPark active={active} /> : null}
      {streets.map((t, i) => (
        <SetTraffic
          key={i}
          st={t.st}
          side={t.side}
          seed={i + 7}
          lanes={t.lanes}
          cones={false}
          steady
          active={active}
          exits={i === 0 && turn.exit && turnLane >= 0 ? [Object.assign(turn.exit, { lane: turnLane })] : []}
        />
      ))}
      {/* the cars turning off at the T and driving away down the avenue */}
      <Turners t={turn} others={turnerObstacles} active={active} />
      {geos.map((g, k) => (
        <instancedMesh
          key={k}
          ref={(im) => {
            meshes.current[k] = im;
            if (im && !im.instanceColor) {
              for (let i = 0; i < count; i++) im.setColorAt(i, col.set("#ffffff"));
            }
          }}
          args={[g, mat, count]}
          castShadow
          receiveShadow
          frustumCulled={false}
        />
      ))}
    </group>
  );
}

/** The cones between the walking crowd and the traffic. */
function Cones({ at }: { at: [number, number][] }) {
  return (
    <instancedMesh
      args={[undefined, undefined, at.length]}
      ref={(im) => {
        if (!im) return;
        const m = new THREE.Matrix4();
        at.forEach(([x, z], i) => im.setMatrixAt(i, m.makeTranslation(x, 0.35, z)));
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
      }}
    >
      <coneGeometry args={[0.2, 0.7, 10]} />
      <meshStandardMaterial color="#ff6a1a" roughness={0.6} />
    </instancedMesh>
  );
}
