import { AVATARS } from "../data/avatars";
import { clipRate, walkRate, type Agent } from "./CrowdRenderer";
import { COMPOUND, GATE_OPENING, MAIN_DOOR, PED_GATE, PLOT, TENTS, boothFront, boothPoint, toWorld, type Booth } from "../world/compound";
import { segDist, type LagosWorld, type Pt } from "../world/lagosData";
import { resample, streamAt, type Group, type Stream } from "../world/processionData";
import { waitAtCrossing } from "../world/parkingLot";
import { Q } from "../quality";

// People walking in orderly flows: along a path, in loose rows and lanes, all at the flow's pace
// so nobody walks through anybody. When someone reaches the end they start again at the back.

export type Walker = Agent & { st: Stream; s: number; lat: number; speed: number; from: number; to: number; push: number };

const hash = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const FLOW_GROUP: Group = { id: "flow", name: "", sign: "", to: "", km: 0, bearing: 0 };

/** A path from compound-local points, with a walkable half-width per point. */
export function localPath(points: [number, number, number][]): Stream {
  const pts: Pt[] = points.map(([x, z]) => {
    const w = toWorld(x, z);
    return [w.x, w.z];
  });
  return resample(pts, points.map((p) => p[2]), FLOW_GROUP);
}

/**
 * The street outside a gate: from `length` metres up the road the gate faces, along the road,
 * across to the gate and just inside it. Probe/mouth/inside are compound-local points.
 */
export function gateApproach(w: LagosWorld, probe: [number, number], mouth: [number, number], inside: [number, number], gateHalf: number, length = 230, from: -1 | 1 = 1): Stream | null {
  const pw = toWorld(probe[0], probe[1]);
  // the street itself, not the service driveway into the gate
  let r: LagosWorld["roads"][number] | null = null;
  let rd = 30;
  for (const cand of w.roads) {
    if (cand.type === "service" || cand.pts.length < 2) continue;
    for (let i = 1; i < cand.pts.length; i++) {
      const d = segDist(pw.x, pw.z, cand.pts[i - 1], cand.pts[i]);
      if (d < rd) {
        rd = d;
        r = cand;
      }
    }
  }
  if (!r) return null;
  // project the probe onto the road
  let best = Infinity, seg = 0, t = 0;
  for (let i = 1; i < r.pts.length; i++) {
    const [ax, az] = r.pts[i - 1], [bx, bz] = r.pts[i];
    const dx = bx - ax, dz = bz - az;
    const l2 = dx * dx + dz * dz || 1;
    const u = Math.max(0, Math.min(1, ((pw.x - ax) * dx + (pw.z - az) * dz) / l2));
    const d = Math.hypot(ax + dx * u - pw.x, az + dz * u - pw.z);
    if (d < best) {
      best = d;
      seg = i;
      t = u;
    }
  }
  const P: Pt = [r.pts[seg - 1][0] + (r.pts[seg][0] - r.pts[seg - 1][0]) * t, r.pts[seg - 1][1] + (r.pts[seg][1] - r.pts[seg - 1][1]) * t];
  // walk back along the road from P in one direction, carrying on into the connected road when
  // this OSM way ends (junction splits), but never into service lanes (driveways into compounds)
  const collect = (dir: -1 | 1) => {
    const out: Pt[] = [P];
    let acc = 0;
    let road = r;
    let i = dir < 0 ? seg - 1 : seg;
    let step: number = dir;
    let prev = P;
    for (let guard = 0; acc < length && guard < 400; guard++) {
      if (i < 0 || i >= road.pts.length) {
        const a = out[out.length - 2] ?? P;
        const hx = prev[0] - a[0], hz = prev[1] - a[1];
        const hl = Math.hypot(hx, hz) || 1;
        let best: { road: typeof r; start: number; dir: number; score: number } | null = null;
        for (const cand of w.roads) {
          if (cand === road || cand.type === "service" || cand.pts.length < 2) continue;
          for (const [start, d] of [[0, 1], [cand.pts.length - 1, -1]] as const) {
            const e = cand.pts[start];
            if (Math.hypot(e[0] - prev[0], e[1] - prev[1]) > 3) continue;
            const n = cand.pts[start + d];
            const nx = n[0] - e[0], nz = n[1] - e[1];
            const score = (nx * hx + nz * hz) / ((Math.hypot(nx, nz) || 1) * hl);
            if (score > 0.4 && (!best || score > best.score)) best = { road: cand, start, dir: d, score };
          }
        }
        if (!best) break;
        road = best.road;
        step = best.dir;
        i = best.start + best.dir;
        continue;
      }
      const q = road.pts[i];
      acc += Math.hypot(q[0] - prev[0], q[1] - prev[1]);
      const hx = q[0] - prev[0], hz = q[1] - prev[1];
      out.push(q);
      prev = q;
      i += step;
      // at the corner of the compound, turn with the fence instead of crossing the other street's
      // mouth, so nobody walks across the lane its traffic drives out of
      const [cx, cz] = COMPOUND.center;
      const vx = cx - q[0], vz = cz - q[1];
      if (Math.hypot(vx, vz) > 90 || Math.hypot(hx, hz) < 0.1) continue;
      const side = Math.sign(hx * vz - hz * vx);
      const ahead = (p: Pt, n: Pt) => {
        const l = Math.hypot(n[0] - p[0], n[1] - p[1]) || 1;
        const u = Math.min(20, l) / l;
        return Math.hypot(p[0] + (n[0] - p[0]) * u - cx, p[1] + (n[1] - p[1]) * u - cz);
      };
      let best = i >= 0 && i < road.pts.length ? ahead(q, road.pts[i]) : Infinity;
      let turn: { road: typeof r; at: number; dir: number } | null = null;
      for (const cand of w.roads) {
        if (cand === road || cand.type === "service" || cand.pts.length < 2) continue;
        for (let k = 0; k < cand.pts.length; k++) {
          const e = cand.pts[k];
          if (Math.hypot(e[0] - q[0], e[1] - q[1]) > 3) continue;
          for (const d of [1, -1]) {
            const n = cand.pts[k + d];
            if (!n) continue;
            const nx = n[0] - e[0], nz = n[1] - e[1];
            if (Math.sign(nx * vz - nz * vx) !== side) continue;
            const a = ahead(e, n);
            if (a < best) {
              best = a;
              turn = { road: cand, at: k, dir: d };
            }
          }
        }
      }
      if (turn) {
        road = turn.road;
        step = turn.dir;
        i = turn.at + turn.dir;
      }
    }
    return { out, acc };
  };
  // up the road one way or the other; skip a direction with hardly any road
  const way = collect(from);
  if (way.acc < 60) return null;
  const tail = way.out.reverse();
  const m = toWorld(mouth[0], mouth[1]);
  const n = toWorld(inside[0], inside[1]);
  const half = r.width / 2 + 0.6;
  const pts: Pt[] = [...tail, [m.x, m.z], [n.x, n.z]];
  const halves = [...tail.map(() => half), gateHalf + 0.6, gateHalf];
  return resample(pts, halves, FLOW_GROUP);
}

/** Fill a stretch [from, to] of a path with walkers in loose rows. */
/** How full every crowd is, everywhere (1 = as first laid out): set by the device (see quality.ts). */
export const CROWD_DENSITY = Q.crowd;

export function fill(st: Stream, from: number, to: number, opts: { seed: number; keep?: number; row?: number; lane?: number; speed?: number; maxHalf?: number; band?: [number, number] }) {
  const out: Walker[] = [];
  const row = opts.row ?? 1.25;
  const lane = opts.lane ?? 0.95;
  const keep = (opts.keep ?? 0.62) * CROWD_DENSITY;
  const speed = opts.speed ?? 1.2;
  let k = opts.seed;
  for (let s = from; s < to; s += row) {
    const half = Math.min(opts.maxHalf ?? 99, streamAt(st, s).half) - 0.35;
    const lanes = Math.max(1, Math.floor((half * 2) / lane));
    for (let j = 0; j < lanes; j++, k++) {
      if (hash(k) > keep) continue;
      const [b0, b1] = opts.band ?? [-1, 1];
      const lat = lanes === 1 ? (b0 + b1) / 2 : b0 + ((b1 - b0) * (j + 0.5)) / lanes + (hash(k + 0.3) - 0.5) * (0.18 * (b1 - b0) / lanes);
      const avatar = Math.floor(hash(k + 0.7) * AVATARS.length);
      out.push({
        st,
        s: s + (hash(k + 0.5) - 0.5) * row * 0.5,
        lat,
        speed,
        from,
        to,
        push: 0,
        x: 0,
        z: 0,
        h: 0,
        avatar,
        robe: hash(k + 0.9) < 0.5 ? 0 : 1,
        anim: "walk",
        phase: hash(k + 0.1),
        rate: 0.9,
      });
    }
  }
  return out;
}

const _p = { x: 0, z: 0, dx: 0, dz: 1, half: 4 };

/** Move everyone along; anyone near `avoid` (x, z, radius) steps aside. */
export function advance(people: Walker[], dt: number, avoid?: { x: number; z: number; r: number }, onEnd?: (p: Walker) => void) {
  for (const p of people) {
    // a car turning into the car park: wait for it, the marshal's holding the line
    const wait = waitAtCrossing(p.st, p.s);
    if (!wait) p.s += p.speed * dt;
    if (p.s > p.to) {
      onEnd?.(p);
      p.s -= p.to - p.from;
    }
    streamAt(p.st, p.s, _p);
    const half = Math.max(0.4, _p.half - 0.35);
    let x = _p.x - _p.dz * p.lat * half;
    let z = _p.z + _p.dx * p.lat * half;
    if (avoid) {
      const ax = x - avoid.x, az = z - avoid.z;
      const d = Math.hypot(ax, az);
      const want = d < avoid.r + 1.2 ? (avoid.r + 1.2 - d) * Math.sign(-_p.dz * ax + _p.dx * az || 1) : 0;
      p.push += (want - p.push) * Math.min(1, dt * 6);
    } else p.push *= Math.max(0, 1 - dt * 3);
    x += -_p.dz * p.push;
    z += _p.dx * p.push;
    p.x = x;
    p.z = z;
    p.h = Math.atan2(_p.dx, _p.dz);
    p.rate = wait ? 0 : walkRate(p.avatar, p.speed);
  }
}

/** The vehicle-gate crowd walks straight up the forecourt to the main doors (compound-local). */
export function yardPaths() {
  return [
    // vehicle gate → straight up the forecourt walk → the right half of the main doors
    localPath([
      [(GATE_OPENING.x0 + GATE_OPENING.x1) / 2, PLOT.z1 - 2, 4.6],
      [MAIN_DOOR.x + 0.9, 43, 2.2],
      [MAIN_DOOR.x + 0.9, MAIN_DOOR.z + 5, 0.85],
      [MAIN_DOOR.x + 0.9, MAIN_DOOR.z - 0.6, 0.75],
    ]),
  ];
}

/**
 * Which side of a street path (+1: lat > 0) is the Fusion Centre's fence. Taken on the road just
 * before the path turns in at the gate; walking along the fence (and round its corner) keeps
 * the compound on that same side.
 */
export function fenceSide(st: Stream): 1 | -1 {
  const i = Math.max(0, st.length - 25);
  const [cx, cz] = COMPOUND.center;
  return -st.dz[i] * (cx - st.x[i]) + st.dx[i] * (cz - st.z[i]) > 0 ? 1 : -1;
}
/**
 * The walkers' band across a street: the outer lane along the fence (of four; the traffic has the
 * other three). Where two paths share a stretch walking opposite ways, `strip` keeps them apart:
 * 0 hugs the fence, 1 is the lane's inner half.
 */
export function fenceBand(st: Stream, strip: number): [number, number] {
  const [a, b] = strip % 2 ? [0.48, 0.7] : [0.73, 0.97];
  return fenceSide(st) > 0 ? [a, b] : [-b, -a];
}

/**
 * The two streets outside, walked from both directions: the main road to the back gate, Acme
 * Road to the sliding gate. Everyone keeps to the lane along the fence (fill with fenceBand),
 * leaving the other three to Lagos traffic.
 */
export function streetPaths(w: LagosWorld) {
  const pg = (PED_GATE.z0 + PED_GATE.z1) / 2;
  const vg = (GATE_OPENING.x0 + GATE_OPENING.x1) / 2;
  const out: (Stream | null)[] = [];
  for (const dir of [-1, 1] as const) {
    out.push(gateApproach(w, [PLOT.x0 - 12, pg], [PLOT.x0 - 1.5, pg], [PLOT.x0 + 2.5, pg], 2.2, 230, dir));
    out.push(gateApproach(w, [vg, PLOT.z1 + 12], [vg, PLOT.z1 + 1.5], [vg, PLOT.z1 - 2], 4.6, 230, dir));
  }
  if (process.env.NODE_ENV !== "production") console.info("[flows] street paths", out.map((p) => (p ? Math.round(p.length) : "none")).join(","));
  return out.filter(Boolean) as Stream[];
}

// ---------- people who come in by the back gate and wander the yard ----------

/** Walkable spots in the yard (compound-local) and the open-ground links between them. */
const NODES: Record<string, [number, number]> = {
  gate: [PED_GATE.x + 2.4, (PED_GATE.z0 + PED_GATE.z1) / 2],
  l0: [-25.8, -13],
  l1: [-25.8, -4],
  l2: [-25.8, 6],
  l3: [-25.8, 16],
  l4: [-25.6, 27.5],
  cafe: [-25.2, 41.5],
  f1: [-12, 29],
  f2: [-2, 30.5],
  f3: [3.4, 31],
  door: [MAIN_DOOR.x - 0.9, MAIN_DOOR.z + 1.6],
  c0: [9.5, 33.5],
  court: [17, 37],
  court2: [21, 41],
};
const LINKS: [string, string][] = [
  ["gate", "l0"], ["l0", "l1"], ["l1", "l2"], ["l2", "l3"], ["l3", "l4"],
  ["l4", "cafe"], ["l4", "f1"], ["cafe", "f1"], ["f1", "f2"], ["f2", "f3"], ["f3", "door"],
  ["f3", "c0"], ["f2", "c0"], ["c0", "court"], ["court", "court2"],
];
// every booth's counter front is a spot people wander to, linked to the nearest walk node
const BASE = Object.keys(NODES);
for (const t of TENTS) {
  const [x, z] = boothFront(t, 1.8);
  const id = "booth-" + t.id;
  NODES[id] = [x, z];
  let best = BASE[0];
  for (const n of BASE) if (Math.hypot(NODES[n][0] - x, NODES[n][1] - z) < Math.hypot(NODES[best][0] - x, NODES[best][1] - z)) best = n;
  LINKS.push([best, id]);
}
const ADJ = new Map<string, string[]>();
for (const [a, b] of LINKS) {
  ADJ.set(a, [...(ADJ.get(a) ?? []), b]);
  ADJ.set(b, [...(ADJ.get(b) ?? []), a]);
}
/** Next step from `from` on the shortest hop path to `to`. */
function stepToward(from: string, to: string) {
  const prev = new Map<string, string>([[from, from]]);
  const q = [from];
  while (q.length) {
    const n = q.shift()!;
    if (n === to) break;
    for (const m of ADJ.get(n) ?? [])
      if (!prev.has(m)) {
        prev.set(m, n);
        q.push(m);
      }
  }
  let n = to;
  while (prev.get(n) !== from && prev.get(n) !== undefined && n !== from) n = prev.get(n)!;
  return n;
}

export type Wanderer = Agent & { lx: number; lz: number; at: string; prevNode: string; next: string; speed: number; jitter: number; visits: number; heading: "roam" | "door"; push: number };

function nodeWorld(n: string, jitter: number, dirX: number, dirZ: number) {
  const [x, z] = NODES[n];
  // walk a little to one side of the line, so people spread out instead of following in file
  return [x - dirZ * jitter, z + dirX * jitter] as const;
}

export function makeWanderers(all: number, seed = 777): Wanderer[] {
  const count = Math.round(all * CROWD_DENSITY);
  const out: Wanderer[] = [];
  const keys = Object.keys(NODES).filter((k) => k !== "door");
  for (let i = 0; i < count; i++) {
    const k = seed + i * 13;
    const at = keys[Math.floor(hash(k) * keys.length)];
    const [x, z] = NODES[at];
    const nbrs = ADJ.get(at)!;
    out.push({
      lx: x + (hash(k + 0.2) - 0.5) * 1.5,
      lz: z + (hash(k + 0.4) - 0.5) * 1.5,
      at,
      prevNode: at,
      next: nbrs[Math.floor(hash(k + 0.6) * nbrs.length)],
      speed: 0.9 + hash(k + 0.8) * 0.5,
      jitter: (hash(k + 0.9) - 0.5) * 1.6,
      visits: Math.floor(hash(k + 0.3) * 8),
      heading: "roam",
      push: 0,
      x: 0,
      z: 0,
      h: 0,
      avatar: Math.floor(hash(k + 0.7) * AVATARS.length),
      robe: hash(k + 0.5) < 0.5 ? 0 : 1,
      anim: "walk",
      phase: hash(k + 0.1),
      rate: 0.9,
    });
  }
  return out;
}

/** Wander node to node; after a while head for the main doors, go in, and come round again. */
export function advanceWanderers(people: Wanderer[], dt: number, avoid?: { x: number; z: number; r: number }, onDoor?: (p: Wanderer) => void) {
  for (const p of people) {
    const [ax, az] = NODES[p.at];
    const [bx, bz] = NODES[p.next];
    const ex = bx - ax, ez = bz - az;
    const el = Math.hypot(ex, ez) || 1;
    const [tx, tz] = nodeWorld(p.next, p.jitter, ex / el, ez / el);
    const dx = tx - p.lx, dz = tz - p.lz;
    const d = Math.hypot(dx, dz);
    if (d < 0.5) {
      p.prevNode = p.at;
      p.at = p.next;
      p.visits++;
      if (p.at === "door") {
        onDoor?.(p);
        // in through the main doors; someone new comes in at the back gate
        p.at = p.prevNode = "gate";
        [p.lx, p.lz] = NODES.gate;
        p.visits = 0;
        p.heading = "roam";
        p.next = "l0";
        continue;
      }
      if (p.visits > 7 + (p.phase * 10) % 6) p.heading = "door";
      if (p.heading === "door") p.next = stepToward(p.at, "door");
      else {
        const nbrs = (ADJ.get(p.at) ?? []).filter((n) => n !== "door" && (n !== p.prevNode || ADJ.get(p.at)!.length === 1));
        p.next = nbrs[Math.floor(((p.phase * 97 + p.visits * 0.37) % 1) * nbrs.length)] ?? p.prevNode;
      }
      continue;
    }
    const step = Math.min(d, p.speed * dt);
    p.lx += (dx / d) * step;
    p.lz += (dz / d) * step;
    const w = toWorld(p.lx, p.lz);
    let x = w.x, z = w.z;
    const hx = toWorld(p.lx + dx / d, p.lz + dz / d);
    const fx = hx.x - w.x, fz = hx.z - w.z;
    if (avoid) {
      const ox = x - avoid.x, oz = z - avoid.z;
      const od = Math.hypot(ox, oz);
      const want = od < avoid.r + 1.2 ? (avoid.r + 1.2 - od) * Math.sign(-fz * ox + fx * oz || 1) : 0;
      p.push += (want - p.push) * Math.min(1, dt * 6);
    } else p.push *= Math.max(0, 1 - dt * 3);
    x += -fz * p.push;
    z += fx * p.push;
    p.x = x;
    p.z = z;
    p.h = Math.atan2(fx, fz);
    p.rate = walkRate(p.avatar, p.speed);
  }
}

// ---------- the booths: staff behind the counters, queues and shoppers in front ----------

const STANDING = [1, 4, 7, 11];
/** Sideways offsets of the four registration counters. */
const REGISTER_COUNTERS = [-4.6, -1.55, 1.55, 4.6];

/**
 * Everyone standing at the booths (compound-local positions turned into world agents): staff
 * greeting people behind every counter, short queues at the help desks, long queues at the four
 * registration counters, and shoppers browsing the merch racks.
 */
export function boothCrowd(): Agent[] {
  const out: Agent[] = [];
  let k = 7000;
  const person = (p: [number, number], localHeading: number, anim: "idle" | "wave") => {
    const w = toWorld(p[0], p[1]);
    out.push({ x: w.x, z: w.z, h: localHeading + COMPOUND.rotation, avatar: STANDING[Math.floor(hash(k + 0.7) * STANDING.length)], anim, phase: hash(k + 0.1), rate: 0.25 });
    k++;
  };
  const queue = (t: Booth, side: number, n: number) => {
    for (let i = 0; i < n; i++) person(boothFront(t, 0.7 + i * 0.85, side + (hash(k + 0.4) - 0.5) * 0.35), t.face + Math.PI + (hash(k + 0.5) - 0.5) * 0.4, "idle");
  };
  for (const t of TENTS) {
    if (t.id === "register") {
      // four counters, a member of staff behind each (their queues move: see BoothQueues)
      for (const side of REGISTER_COUNTERS) person(boothPoint(t, t.d / 2 - 1.1, side), t.face, "wave");
    } else if (t.id === "merch") {
      // staff at the till and on the floor, shoppers at the racks (the till queue moves)
      person(boothPoint(t, t.d / 2 - 1.1, 0), t.face, "wave");
      person(boothPoint(t, -0.4, -4.2), t.face + 0.6, "wave");
      // window-shoppers along the front
      for (const side of [-4.8, -3.6, 3.4, 4.6]) person(boothFront(t, 0.9 + hash(k) * 0.8, side), t.face + Math.PI + (hash(k + 0.3) - 0.5) * 0.6, "idle");
      for (const [d, side, turn] of [[-0.6, -4.6, -Math.PI / 2], [-0.2, -3.2, -Math.PI / 2], [0.2, 3.4, Math.PI / 2], [-0.6, 4.6, Math.PI / 2], [0.9, -2.4, Math.PI], [0.9, 2.6, Math.PI]] as const)
        person(boothPoint(t, d, side), t.face + turn, "idle");
    } else {
      person(boothPoint(t, -0.3, (hash(k) - 0.5) * 0.8), t.face, "wave");
      queue(t, (hash(k + 0.2) - 0.5) * 0.6, 2 + Math.floor(hash(k + 0.3) * 2));
    }
  }
  return out;
}

// ---------- moving queues: walk up, shuffle forward, get served, leave for the hall ----------

type Lane = {
  /** Queue spots, compound-local: [0] at the counter, then back from it. */
  slot: (i: number) => [number, number];
  /** Facing the counter (compound-local heading). */
  face: number;
  /** From outside the gate to the back of the queue (the last leg goes to the free spot). */
  arrive: [number, number][];
  /** From the counter in through the main doors. */
  leave: [number, number][];
  /** Registration: you come empty-handed and leave carrying your torch. */
  handsTorch: boolean;
  service: [number, number];
  pool: number;
};
type Queuer = Agent & {
  lane: Lane;
  state: "arrive" | "line" | "served" | "leave";
  route: [number, number][];
  seg: number;
  lx: number;
  lz: number;
  wait: number;
  /** In the queue and walking up to its place (the gap ahead had opened up). */
  stepping?: boolean;
};

const DOOR_IN: [number, number][] = [
  [MAIN_DOOR.x - 0.4, MAIN_DOOR.z + 1.6],
  [MAIN_DOOR.x - 0.4, MAIN_DOOR.z - 1.8],
];

function queueLanes(): Lane[] {
  const reg = TENTS.find((t) => t.id === "register")!;
  const merch = TENTS.find((t) => t.id === "merch")!;
  const gx = (GATE_OPENING.x0 + GATE_OPENING.x1) / 2;
  const lanes: Lane[] = REGISTER_COUNTERS.map((side) => {
    const [cx, cz] = boothFront(reg, 0.7, side);
    // out between this queue and the next one toward the hall, then across to the doors
    const gap = cz - 1.5;
    return {
      slot: (i) => boothFront(reg, 0.7 + i * 0.85, side),
      face: reg.face + Math.PI,
      arrive: [
        [gx - 3, PLOT.z1 + 9],
        [gx - 3, PLOT.z1 - 3],
        [cx + 7.5, cz],
      ],
      leave: [
        [cx + 0.9, gap],
        [cx + 6.5, gap],
        [MAIN_DOOR.x - 1.2, MAIN_DOOR.z + 6],
        ...DOOR_IN,
      ],
      handsTorch: true,
      service: [3, 9],
      pool: 9,
    };
  });
  const [mx, mz] = boothFront(merch, 0.7, 0);
  lanes.push({
    slot: (i) => boothFront(merch, 0.7 + i * 0.85, 0),
    face: merch.face + Math.PI,
    arrive: [
      [gx + 2, PLOT.z1 + 9],
      [gx + 2, PLOT.z1 - 4],
      [mx - 3.5, mz - 6],
    ],
    leave: [
      [mx - 2.4, mz - 0.4],
      [gx - 1, mz - 8],
      [MAIN_DOOR.x - 1.2, MAIN_DOOR.z + 6],
      ...DOOR_IN,
    ],
    handsTorch: false,
    service: [4, 10],
    pool: 8,
  });
  return lanes;
}

/**
 * The registration counters (and the merch till) with people moving through: they walk in from
 * the street to the back of a queue, step up as it moves, wait at the counter while their
 * details are taken, are handed their torch (registration), and carry it in through the main
 * doors. Then someone new arrives at the gate.
 */
export class BoothQueues {
  agents: Queuer[] = [];
  private lines = new Map<Lane, Queuer[]>();
  private k = 31000;

  constructor() {
    for (const lane of queueLanes()) {
      const line: Queuer[] = [];
      this.lines.set(lane, line);
      for (let i = 0; i < lane.pool; i++) {
        const p = this.newcomer(lane);
        // most already queueing, the rest on their way in from the gate
        if (i < lane.pool - 3) {
          [p.lx, p.lz] = lane.slot(i);
          p.state = "line";
          line.push(p);
          p.wait = i === 0 ? this.rand() * lane.service[1] : 0;
        } else {
          const leg = 1 + ((i - lane.pool + 3) % (lane.arrive.length - 1));
          p.seg = leg;
          [p.lx, p.lz] = lane.arrive[leg - 1];
        }
        this.agents.push(p);
      }
    }
  }

  private rand() {
    return hash(this.k++);
  }

  private newcomer(lane: Lane): Queuer {
    const p: Queuer = { lane, state: "arrive", route: lane.arrive, seg: 1, lx: lane.arrive[0][0], lz: lane.arrive[0][1], wait: 0, x: 0, z: 0, h: 0, avatar: 0, anim: "walk", phase: 0, rate: 0.9 };
    this.restyle(p);
    return p;
  }

  /** A different person each time round (avatar, outfit and skin all follow phase). */
  private restyle(p: Queuer) {
    p.avatar = STANDING[Math.floor(this.rand() * STANDING.length)];
    p.robe = this.rand() < 0.5 ? 0 : 1;
    p.phase = this.rand();
    p.torch = !p.lane.handsTorch;
  }

  step(dt: number) {
    for (const [lane, line] of this.lines) {
      // whoever is at the front and standing at the counter is being served
      const front = line[0];
      if (front && front.state === "line" && this.at(front, lane.slot(0))) {
        if (front.wait <= 0) front.wait = lane.service[0] + this.rand() * (lane.service[1] - lane.service[0]);
        front.wait -= dt;
        if (front.wait <= 0) {
          front.state = "served";
          front.wait = 1.4;
          // the torch changes hands
          if (lane.handsTorch) front.torch = true;
        }
      }
      if (front && front.state === "served") {
        front.wait -= dt;
        if (front.wait <= 0) {
          line.shift();
          front.state = "leave";
          front.route = lane.leave;
          front.seg = 0;
        }
      }
    }
    for (const p of this.agents) {
      const line = this.lines.get(p.lane)!;
      let target: [number, number] | null = null;
      let speed = 1.15;
      if (p.state === "arrive" || p.state === "leave") {
        if (p.seg < p.route.length) target = p.route[p.seg];
        else if (p.state === "arrive") {
          // reached the queue: join the back of it
          p.state = "line";
          line.push(p);
        } else {
          // in through the doors: someone new comes in at the gate
          this.restyle(p);
          p.state = "arrive";
          p.route = p.lane.arrive;
          p.seg = 1;
          [p.lx, p.lz] = p.route[0];
          continue;
        }
      }
      if (p.state === "line") {
        // in the queue: stand still until there's a real gap ahead (two places, or the counter),
        // then walk it at an ordinary pace and stand again: never shuffling half a step at a time
        const i = line.indexOf(p);
        const slot = p.lane.slot(i);
        const gap = Math.hypot(slot[0] - p.lx, slot[1] - p.lz);
        if (p.stepping || gap > 1.6 || (i === 0 && gap > 0.06)) {
          target = slot;
          p.stepping = gap > 0.06;
        }
        speed = 1.1;
      }
      let moving = false;
      if (target) {
        const dx = target[0] - p.lx, dz = target[1] - p.lz;
        const d = Math.hypot(dx, dz);
        const go = speed * dt;
        if (d <= go) {
          [p.lx, p.lz] = target;
          if (p.state !== "line") p.seg++;
        } else {
          p.lx += (dx / d) * go;
          p.lz += (dz / d) * go;
          p.h = Math.atan2(dx, dz) + COMPOUND.rotation;
          moving = true;
        }
      }
      if (moving || p.state === "arrive" || p.state === "leave") {
        p.anim = "walk";
        p.rate = walkRate(p.avatar, speed);
      } else {
        // standing in line, facing the counter
        p.anim = "idle";
        p.h = p.lane.face + COMPOUND.rotation;
        p.rate = clipRate(p.avatar, "idle");
      }
      const w = toWorld(p.lx, p.lz);
      p.x = w.x;
      p.z = w.z;
    }
  }

  private at(p: Queuer, t: [number, number]) {
    return Math.hypot(t[0] - p.lx, t[1] - p.lz) < 0.06;
  }
}
