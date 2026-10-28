"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { streamAt, type Stream } from "./processionData";
import { danfo, keke, okada, sedan, suv, truck } from "./vehicleModels";
import { inTheWay, trafficNow } from "./trafficLive";

// Traffic on a campus road in the opening film: the walkers keep to one half of the carriageway
// and the cars, danfos, kekes and okadas crawl both ways along the other half, behind a line of
// cones. Each lane moves as one stop-start column; where columns meet (the T-junction at the
// compound's corner) a column holds, like a queue, while someone else is in its way: so nothing
// ever drives into anything.

export const KINDS = [
  { make: sedan, len: 4.4, w: 1.8, share: 0.34, tint: true },
  { make: suv, len: 4.7, w: 1.9, share: 0.12, tint: true },
  { make: danfo, len: 4.7, w: 2.0, share: 0.3, tint: false },
  { make: keke, len: 2.5, w: 1.4, share: 0.1, tint: false },
  { make: okada, len: 1.8, w: 0.8, share: 0.08, tint: false },
  { make: truck, len: 8.6, w: 2.5, share: 0.06, tint: false },
];

/** Where a vehicle is: centre, heading, length and width. */
export type Footprint = { x: number; z: number; h: number; l: number; w: number };
/** Every column's cars this frame, by lane: what the other columns and the city traffic give way to. */
const columns = new Map<object, Footprint[]>();
/** Other cars the columns give way to (the ones turning off at the T), under their own key. */
export function registerCars(key: object, cars: Footprint[]) {
  columns.set(key, cars);
}
/** Every column car (for the city traffic to give way to). */
export function columnCars() {
  const out: Footprint[] = [];
  for (const cars of columns.values()) out.push(...cars);
  return out;
}

/** Do two footprints overlap, each grown by `pad` metres front and back (`side` to the sides)? */
export function footprintsMeet(a: Footprint, b: Footprint, pad = 0, side = 0.15) {
  // (separating axes: each car's length and width directions; worked in plain numbers, as this
  // runs for every pair of nearby cars every frame)
  const as = Math.sin(a.h), ac = Math.cos(a.h), bs = Math.sin(b.h), bc = Math.cos(b.h);
  const dx = b.x - a.x, dz = b.z - a.z;
  const al = a.l / 2 + pad, aw = a.w / 2 + side, bl = b.l / 2 + 0.2, bw = b.w / 2 + side;
  for (let k = 0; k < 4; k++) {
    const ux = k === 0 ? as : k === 1 ? ac : k === 2 ? bs : bc;
    const uz = k === 0 ? ac : k === 1 ? -as : k === 2 ? bc : -bs;
    const ra = al * Math.abs(as * ux + ac * uz) + aw * Math.abs(ac * ux - as * uz);
    const rb = bl * Math.abs(bs * ux + bc * uz) + bw * Math.abs(bc * ux - bs * uz);
    if (Math.abs(dx * ux + dz * uz) > ra + rb) return false;
  }
  return true;
}
export const CAR_COLORS = ["#e9ecf0", "#1c1f26", "#8c1d1d", "#2c4a7a", "#b9bcc2", "#5a5f66", "#e8e3d5", "#20472e", "#c9b28a", "#7a2f6b"];

const rnd = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

type Car = { kind: number; s: number; color: number; turning?: boolean; gone?: boolean };
/**
 * A turning off the lane (into the car park): `want` is asked `lead` seconds ahead whether this car
 * may turn in; at `s` it leaves the column and `take` carries it on from there.
 */
export type LaneExit = { s: number; lead: number; want: (kind: number) => boolean; take: (kind: number, color: string, x: number, z: number, h: number, speed: number) => void };

/** Vehicle models and their material, built once for every road that uses them. */
let built: { geos: THREE.BufferGeometry[]; mat: THREE.MeshStandardMaterial } | null = null;
const tints = new Map<string, THREE.Color>();
/** A paint colour as a THREE.Color, parsed once (setColorAt every frame without re-reading the hex). */
export const tint = (hex: string) => {
  let c = tints.get(hex);
  if (!c) tints.set(hex, (c = new THREE.Color(hex)));
  return c;
};

export const shared = () => (built ??= { geos: KINDS.map((k) => k.make()), mat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.25 }) });
type Lane = { off: number; dir: 1 | -1; speed: number; phase: number; cars: Car[]; vel?: number };

/** `side`: the half of the road the traffic uses (+1: the side walkers' lat > 0 would take). */
export function SetTraffic({
  st,
  side,
  seed = 1,
  lanes: given,
  cones: withCones = true,
  steady = false,
  exit,
  exits = [],
  active = true,
}: {
  st: Stream;
  side: 1 | -1;
  seed?: number;
  /** Lanes to use instead of the default two (offset to the right of the path, direction, speed). */
  lanes?: { off: number; dir: 1 | -1; speed: number }[];
  cones?: boolean;
  /** Always rolling (never comes to a stop). */
  steady?: boolean;
  /** A turning off the first lane. */
  exit?: LaneExit;
  /** More turnings off, each on its own lane (index into `lanes`). */
  exits?: (LaneExit & { lane: number })[];
  /** Off screen (hidden set): hold still instead of driving unseen. */
  active?: boolean;
}) {
  const lanes = useMemo<Lane[]>(() => {
    const h = st.half[Math.floor(st.length / 2)];
    const w = (h - 0.6) / 2;
    let k = seed * 1000;
    // drive on the right: the outer lane runs the way that keeps it on its own right
    return (
      given?.map((l, i) => ({ ...l, phase: i * 2.1 })) ?? [
        { off: side * (0.6 + w * 1.5), dir: side, speed: 7.5, phase: 0 },
        { off: side * (0.6 + w * 0.5), dir: -side as 1 | -1, speed: 6, phase: 2.1 },
      ]
    ).map((l) => {
      const cars: Car[] = [];
      const pick = (k: number) => {
        let x = rnd(k);
        let kind = 0;
        while (kind < KINDS.length - 1 && (x -= KINDS[kind].share) > 0) kind++;
        return kind;
      };
      // centre to centre: half of each vehicle plus a gap, so no two ever overlap (the whole lane
      // moves as one, so the spacing set here holds for good, across the wrap-round too)
      let kind = pick(k);
      const first = kind;
      for (let s = KINDS[kind].len / 2; ; ) {
        cars.push({ kind, s, color: Math.floor(rnd(k + 0.5) * CAR_COLORS.length) });
        k++;
        const next = pick(k);
        const ns = s + KINDS[kind].len / 2 + 2.5 + rnd(k + 0.3) * 7 + KINDS[next].len / 2;
        if (ns + KINDS[next].len / 2 + 2.5 + KINDS[first].len / 2 > st.length) break;
        s = ns;
        kind = next;
      }
      return { ...l, cars };
    });
  }, [st, side, seed, given]);
  // (gone with this road: nobody gives way to its cars any more)
  useEffect(() => () => void lanes.forEach((l) => columns.delete(l)), [lanes]);
  const geos = shared().geos;
  const mat = shared().mat;
  const counts = useMemo(() => KINDS.map((_, i) => lanes.reduce((n, l) => n + l.cars.filter((c) => c.kind === i).length, 0)), [lanes]);
  const meshes = useRef<(THREE.InstancedMesh | null)[]>([]);
  const clock = useRef(0);
  const P = useMemo(() => ({ x: 0, z: 0, dx: 0, dz: 1, half: 4 }), []);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const one = useMemo(() => new THREE.Vector3(1, 1, 1), []);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const col = useMemo(() => new THREE.Color(), []);
  const scratch = useMemo(() => ({ others: [] as Footprint[], waiting: [] as Footprint[] }), []);

  // the cones between the walkers and the traffic
  const cones = useMemo(() => {
    const out: THREE.Matrix4[] = [];
    if (!withCones) return out;
    for (let s = 20; s < st.length - 20; s += 4) {
      streamAt(st, s, P);
      const o = side * 0.3;
      out.push(new THREE.Matrix4().makeTranslation(P.x - P.dz * o, 0.35, P.z + P.dx * o));
    }
    return out;
  }, [st, side, P, withCones]);

  /** A car of this lane at s, as a footprint. */
  const at = (l: Lane, c: Car, s: number): Footprint => {
    streamAt(st, s, P);
    return { x: P.x - P.dz * l.off, z: P.z + P.dx * l.off, h: Math.atan2(P.dx, P.dz) + (l.dir < 0 ? Math.PI : 0), l: KINDS[c.kind].len, w: KINDS[c.kind].w };
  };
  useFrame((_, rawDt) => {
    if (!active) return;
    const dt = Math.min(rawDt, 0.1);
    clock.current += dt;
    const n = KINDS.map(() => 0);
    // give way: if any of a column's cars has someone else in its way ahead (another column's
    // car, or the city traffic) the whole column eases to a stop and waits, like a queue
    // (this street's own lanes are laid out never to touch: only other streets' columns count)
    const others = scratch.others;
    others.length = 0;
    for (const [k, cars] of columns) if (!lanes.includes(k as Lane)) for (const c of cars) others.push(c);
    // the city traffic: the street has right of way (side-street cars wait for a gap in it), so
    // it never queues for them; none is ever driven into, though
    const waiting = scratch.waiting;
    waiting.length = trafficNow.length;
    trafficNow.forEach((t, i) => {
      const w = (waiting[i] ??= { x: 0, z: 0, h: 0, l: 0, w: 2 });
      w.x = t.x;
      w.z = t.z;
      w.h = t.h;
      w.l = t.len;
    });
    for (const l of lanes) {
      // stop-start Lagos traffic: the whole column eases between a crawl and a steady roll
      const wave = Math.sin(clock.current * 0.35 + l.phase);
      const want = l.speed * (steady ? 0.75 + 0.3 * wave : Math.max(0, 0.55 + 0.6 * wave));
      const vel = l.vel ?? want;
      const look = 1.5 + (vel * vel) / 16;
      let blocked = false;
      for (const c of l.cars) {
        if (blocked) break;
        if (c.gone || c.s < 8 || c.s > st.length - 8) continue;
        const me = at(l, c, c.s);
        const fx = Math.sin(me.h), fz = Math.cos(me.h);
        for (const o of others) {
          const dx = o.x - me.x, dz = o.z - me.z;
          const d = Math.hypot(dx, dz);
          if (d > 16) continue;
          // only what's ahead of it (never what's beside or behind)
          if (dx * fx + dz * fz < 0.3 * d) continue;
          if (footprintsMeet(me, o, look)) {
            blocked = true;
            break;
          }
        }
      }
      const held = (l as Lane & { held?: number }).held ?? 0;
      (l as Lane & { held?: number }).held = blocked ? held + dt : 0;
      // the traffic always keeps moving: held more than a few seconds, it edges on at a crawl
      if (blocked && held > 3) blocked = false;
      l.vel = blocked ? Math.max(0, vel - 8 * dt) : Math.min(held > 3 ? Math.max(1.5, want * 0.3) : want, vel + 3 * dt);
      const v = l.vel;
      // and never into anyone: a step that would make a car overlap someone is not taken
      if (v > 0)
        for (const c of l.cars) {
          if (c.gone || c.s < 8 || c.s > st.length - 8) continue;
          const now = at(l, c, c.s);
          const next = at(l, c, (c.s + v * dt * l.dir + st.length) % st.length);
          const hits = (o: Footprint) => Math.hypot(o.x - next.x, o.z - next.z) < 12 && footprintsMeet(next, o) && !footprintsMeet(now, o);
          const hitBy = others.find(hits) ?? waiting.find(hits);
          if (hitBy) {
            // a city car standing in the street's way: it's asked to back out (the street has right of way)
            if (waiting.includes(hitBy) && inTheWay.length < 20) inTheWay.push({ x: hitBy.x, z: hitBy.z });
            l.vel = 0;
            break;
          }
        }
      const step = l.vel;
      for (const c of l.cars) {
        const was = c.s;
        c.s = (c.s + step * dt * l.dir + st.length) % st.length;
        // round again (far off at the start): back in the column
        if ((c.s - was) * l.dir < 0) c.gone = c.turning = false;
        // a turning off this lane (the car park on the first; the T-junction's side road)
        const ex = l === lanes[0] && exit ? exit : exits.find((e) => lanes[e.lane] === l);
        if (ex && !c.gone) {
          const exit = ex;
          const ahead = (exit.s - c.s) * l.dir;
          if (!c.turning && ahead > 0 && ahead < exit.lead * Math.max(step, 1) && exit.want(c.kind)) c.turning = true;
          if (c.turning && ahead <= 0) {
            streamAt(st, c.s, P);
            const h = Math.atan2(P.dx, P.dz) + (l.dir < 0 ? Math.PI : 0);
            exit.take(c.kind, KINDS[c.kind].tint ? CAR_COLORS[c.color] : "#ffffff", P.x - P.dz * l.off, P.z + P.dx * l.off, h, step);
            c.gone = true;
            c.turning = false;
          }
        }
        if (c.gone) continue;
        // not at the very ends of the set, where the column wraps round
        if (c.s < 8 || c.s > st.length - 8) continue;
        streamAt(st, c.s, P);
        const im = meshes.current[c.kind];
        if (!im) continue;
        const h = Math.atan2(P.dx, P.dz) + (l.dir < 0 ? Math.PI : 0);
        q.setFromAxisAngle(up, h);
        m.compose(pos.set(P.x - P.dz * l.off, 0, P.z + P.dx * l.off), q, one);
        const i = n[c.kind]++;
        im.setMatrixAt(i, m);
        im.setColorAt(i, tint(KINDS[c.kind].tint ? CAR_COLORS[c.color] : "#ffffff"));
      }
      // where this column's cars are now, for everyone else to give way to
      const mine: Footprint[] = [];
      for (const c of l.cars) if (!c.gone && c.s >= 8 && c.s <= st.length - 8) mine.push(at(l, c, c.s));
      columns.set(l, mine);
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
            if (im && !im.instanceColor) for (let i = 0; i < counts[k]; i++) im.setColorAt(i, col.set("#ffffff"));
          }}
          args={[g, mat, Math.max(1, counts[k])]}
          castShadow
          receiveShadow
          frustumCulled={false}
        />
      ))}
      {cones.length > 0 && <instancedMesh
        args={[undefined, undefined, cones.length]}
        ref={(im) => {
          if (!im) return;
          cones.forEach((c, i) => im.setMatrixAt(i, c));
          im.instanceMatrix.needsUpdate = true;
          im.computeBoundingSphere();
        }}
      >
        <coneGeometry args={[0.2, 0.7, 10]} />
        <meshStandardMaterial color="#ff6a1a" roughness={0.6} />
      </instancedMesh>}
    </group>
  );
}
