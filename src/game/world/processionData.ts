import type { LagosWorld, Pt } from "./lagosData";

// The procession: thousands of torch-bearers walking the real roads of Ikeja into the Fusion
// Centre, one stream per people group. Streams are shortest walks over the OSM road graph (big
// roads preferred) from a start out toward each group's homeland, ending at the pedestrian gate.
// World frame: +x east, +z south, metres, the Fusion Centre at the origin.

export type Group = {
  id: string;
  /** Campus name. */
  name: string;
  /** The green road sign over this crowd: a road everyone knows, and the places on it. */
  road?: string;
  places?: string;
  /** Kept for the stream routing (old sign fields). */
  sign: string;
  to: string;
  km: number;
  /** Compass bearing (degrees) from the Fusion Centre toward where the stream starts. */
  bearing: number;
  /** Came in through Murtala Muhammed (walks up the airport road). */
  airport?: boolean;
};

// Every The New campus walking in. Bearings point from Ogba toward each campus (or the road that
// leads there); the overseas campuses fly in and walk up the airport road.
export const GROUPS: Group[] = [
  { id: "london", name: "The New London", sign: "AIRPORT", to: "OGBA", km: 7, bearing: 190, airport: true },
  { id: "birmingham", name: "The New Birmingham", sign: "AIRPORT", to: "OGBA", km: 7, bearing: 190, airport: true },
  { id: "island", name: "The New Island", road: "LEKKI–EPE EXPRESSWAY", places: "Victoria Island · Lekki · Ikoyi", sign: "VICTORIA ISLAND", to: "OGBA", km: 24, bearing: 130 },
  { id: "yaba", name: "The New Yaba", road: "HERBERT MACAULAY WAY", places: "Yaba · Sabo · Unilag", sign: "YABA", to: "OGBA", km: 13, bearing: 166 },
  { id: "ibadan", name: "The New Ibadan", road: "LAGOS–IBADAN EXPRESSWAY", places: "Ibadan · Ojoo · Iwo Road", sign: "IBADAN", to: "IKEJA", km: 128, bearing: 20 },
  { id: "ife", name: "The New Ife", road: "IFE–IBADAN ROAD", places: "Ile-Ife · OAU Campus", sign: "ILE-IFE", to: "IKEJA", km: 215, bearing: 52 },
  { id: "akure", name: "The New Akure", road: "AKURE–OWO ROAD", places: "Akure · Oba Adesida Road", sign: "AKURE", to: "IKEJA", km: 310, bearing: 78 },
  { id: "ikeja", name: "The New Ikeja", sign: "IKEJA", to: "OGBA", km: 3, bearing: 290 },
];

export type Stream = {
  group: Group;
  /** Path resampled every metre: x, z, unit direction and half the walkable width. */
  x: Float32Array;
  z: Float32Array;
  dx: Float32Array;
  dz: Float32Array;
  half: Float32Array;
  length: number;
};

const MAX_LEN = 2400;
const WEIGHT: Record<string, number> = { motorway: 4, trunk: 1, primary: 1, secondary: 1.1, tertiary: 1.2, link: 1.3, unclassified: 1.6, residential: 1.9, living_street: 2.2, service: 3 };
const BIG = new Set(["trunk", "primary", "secondary", "tertiary"]);

type Edge = { to: number; w: number; len: number; half: number };

/** Undirected road graph keyed on rounded node positions (OSM ways share their junction nodes). */
function buildGraph(w: LagosWorld) {
  const id = new Map<string, number>();
  const pos: Pt[] = [];
  const big: boolean[] = [];
  const adj: Edge[][] = [];
  const node = (p: Pt, isBig: boolean) => {
    const k = Math.round(p[0]) + "," + Math.round(p[1]);
    let n = id.get(k);
    if (n === undefined) {
      n = pos.length;
      id.set(k, n);
      pos.push(p);
      big.push(false);
      adj.push([]);
    }
    if (isBig) big[n] = true;
    return n;
  };
  for (const r of w.roads) {
    const f = WEIGHT[r.type] ?? 2;
    if (r.type === "motorway") continue;
    const isBig = BIG.has(r.type);
    // the carriageway and its kerb: buildings start a few metres further out
    const half = r.width / 2 + 1;
    for (let i = 1; i < r.pts.length; i++) {
      const a = node(r.pts[i - 1], isBig);
      const b = node(r.pts[i], isBig);
      if (a === b) continue;
      const len = Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]);
      adj[a].push({ to: b, w: len * f, len, half });
      adj[b].push({ to: a, w: len * f, len, half });
    }
  }
  return { pos, big, adj };
}

function dijkstra(adj: Edge[][], src: number) {
  const n = adj.length;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const prevHalf = new Float32Array(n);
  const real = new Float64Array(n);
  // binary heap of [dist, node]
  const heap: [number, number][] = [[0, src]];
  dist[src] = 0;
  const push = (item: [number, number]) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  while (heap.length) {
    const [d, u] = pop();
    if (d > dist[u]) continue;
    for (const e of adj[u]) {
      const nd = d + e.w;
      if (nd < dist[e.to]) {
        dist[e.to] = nd;
        real[e.to] = real[u] + e.len;
        prev[e.to] = u;
        prevHalf[e.to] = e.half;
        push([nd, e.to]);
      }
    }
  }
  return { dist, prev, prevHalf, real };
}

export function resample(pts: Pt[], halves: number[], group: Group): Stream {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[cum.length - 1];
  const n = Math.max(2, Math.floor(total));
  const x = new Float32Array(n), z = new Float32Array(n), dx = new Float32Array(n), dz = new Float32Array(n), half = new Float32Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const s = (i / (n - 1)) * total;
    while (j < pts.length - 2 && cum[j + 1] < s) j++;
    const segLen = cum[j + 1] - cum[j] || 1;
    const t = Math.min(1, Math.max(0, (s - cum[j]) / segLen));
    x[i] = pts[j][0] + (pts[j + 1][0] - pts[j][0]) * t;
    z[i] = pts[j][1] + (pts[j + 1][1] - pts[j][1]) * t;
    half[i] = halves[j + 1] ?? halves[j];
  }
  // smoothed heading so people turn corners instead of snapping
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 6), b = Math.min(n - 1, i + 6);
    const ex = x[b] - x[a], ez = z[b] - z[a];
    const l = Math.hypot(ex, ez) || 1;
    dx[i] = ex / l;
    dz[i] = ez / l;
  }
  return { group, x, z, dx, dz, half, length: n - 1 };
}

let cache: { world: LagosWorld; streams: Stream[] } | null = null;

/** The procession streams, each ending at `target` (the pedestrian gate, world coordinates). */
export function getStreams(w: LagosWorld, target: Pt): Stream[] {
  if (cache?.world === w) return cache.streams;
  const { pos, big, adj } = buildGraph(w);
  let tgt = 0;
  let best = Infinity;
  pos.forEach((p, i) => {
    const d = Math.hypot(p[0] - target[0], p[1] - target[1]);
    if (d < best && adj[i].length) {
      best = d;
      tgt = i;
    }
  });
  const { prev, prevHalf, real } = dijkstra(adj, tgt);
  const streams: Stream[] = [];
  for (const g of GROUPS) {
    let start = -1;
    if (g.airport) {
      // the airport road, from the terminal end of the prepared airport route
      const a = w.routes.airport.pts[0];
      let bd = Infinity;
      pos.forEach((p, i) => {
        const d = Math.hypot(p[0] - a[0], p[1] - a[1]);
        if (d < bd && prev[i] >= 0) {
          bd = d;
          start = i;
        }
      });
    } else {
      const br = (g.bearing * Math.PI) / 180;
      const ux = Math.sin(br), uz = -Math.cos(br);
      let bs = -Infinity;
      pos.forEach((p, i) => {
        if (!big[i] || prev[i] < 0) return;
        const d = Math.hypot(p[0], p[1]);
        if (d < 700 || real[i] > MAX_LEN * 1.6) return;
        const along = (p[0] * ux + p[1] * uz) / d;
        if (along < Math.cos((32 * Math.PI) / 180)) return;
        // as far out along the bearing as a walk of reasonable length reaches
        const score = d * along * along;
        if (score > bs) {
          bs = score;
          start = i;
        }
      });
    }
    if (start < 0) continue;
    const pts: Pt[] = [];
    const halves: number[] = [];
    for (let n = start; n >= 0; n = prev[n]) {
      pts.push(pos[n]);
      halves.push(n === tgt ? 4 : prevHalf[n]);
      if (n === tgt) break;
    }
    // keep the last stretch into the gate (the airport road in full)
    const keep = g.airport ? 5000 : MAX_LEN;
    let acc = 0;
    let cut = 0;
    for (let i = pts.length - 1; i > 0; i--) {
      acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (acc > keep) {
        cut = i - 1;
        break;
      }
    }
    pts.push(target);
    halves.push(3);
    streams.push(resample(pts.slice(cut), halves.slice(cut), g));
  }
  cache = { world: w, streams };
  return streams;
}

/** Seconds into the procession at which the torches reach this spot and its windows light up. */
export const LIGHT_WAVE = { start: 2, travel: 16, after: 20, spread: 900 };
/** Stream samples bucketed into a 140 m grid, so looking up nearby torches is a few cells, not every point. */
const LIT_CELL = 140;
const litGrids = new WeakMap<Stream[], Map<string, [number, number, number][]>>();
function litGrid(streams: Stream[]) {
  let g = litGrids.get(streams);
  if (g) return g;
  g = new Map();
  for (const s of streams)
    for (let i = 0; i <= s.length; i += 8) {
      const key = Math.floor(s.x[i] / LIT_CELL) + "," + Math.floor(s.z[i] / LIT_CELL);
      const t = LIGHT_WAVE.start + (i / s.length) * LIGHT_WAVE.travel;
      const list = g.get(key);
      if (list) list.push([s.x[i], s.z[i], t]);
      else g.set(key, [[s.x[i], s.z[i], t]]);
    }
  litGrids.set(streams, g);
  return g;
}

export function litTimeAt(streams: Stream[], x: number, z: number) {
  const g = litGrid(streams);
  const cx = Math.floor(x / LIT_CELL), cz = Math.floor(z / LIT_CELL);
  let best = Infinity;
  for (let dx = -1; dx <= 1; dx++)
    for (let dz = -1; dz <= 1; dz++) {
      const list = g.get(cx + dx + "," + (cz + dz));
      if (!list) continue;
      for (const [px, pz, t0] of list) {
        const d = Math.hypot(px - x, pz - z);
        if (d > 140) continue;
        const t = t0 + d / 60;
        if (t < best) best = t;
      }
    }
  if (best < Infinity) return best;
  // away from the streams: the whole city glows once everyone has arrived, rippling outward
  return LIGHT_WAVE.after + Math.hypot(x, z) / LIGHT_WAVE.spread + ((Math.abs(Math.sin(x * 12.99 + z * 78.23)) * 43758) % 1) * 3;
}

/** Position and direction at arc length s along a stream (wrapping). */
export function streamAt(st: Stream, s: number, out = { x: 0, z: 0, dx: 0, dz: 1, half: 4 }) {
  const L = st.length;
  s = ((s % L) + L) % L;
  const i = Math.floor(s);
  const j = Math.min(i + 1, L);
  const f = s - i;
  out.x = st.x[i] + (st.x[j] - st.x[i]) * f;
  out.z = st.z[i] + (st.z[j] - st.z[i]) * f;
  const dx = st.dx[i] + (st.dx[j] - st.dx[i]) * f;
  const dz = st.dz[i] + (st.dz[j] - st.dz[i]) * f;
  const l = Math.hypot(dx, dz) || 1;
  out.dx = dx / l;
  out.dz = dz / l;
  out.half = st.half[i] + (st.half[j] - st.half[i]) * f;
  return out;
}
