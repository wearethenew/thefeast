// Loads public/world/lagos.json (built by scripts/build-world.mjs) and exposes it in metres,
// plus spatial lookups used by the driving and walking code. +x east, +z south, origin = Fusion Centre.

export type Pt = [number, number];
export type Road = { type: string; name: string; pts: Pt[]; width: number; oneway: boolean; lanes: number; brt: boolean };
export type Building = { h: number; pts: Pt[] };
export type Area = { kind: string; width: number; pts: Pt[] };
export type Route = { pts: Pt[]; cum: number[]; length: number };

export type LagosWorld = {
  roads: Road[];
  buildings: Building[];
  areas: Area[];
  routes: Record<"airport" | "city", Route>;
  fusionPlot: Pt[];
  gate: Pt;
  roadGrid: Map<string, number[]>; // cell → road indices
  buildingGrid: Map<string, number[]>;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Far-city filler blocks [x, z, w, d, h, colour] (metres), pre-placed off every road. */
  filler: [number, number, number, number, number, number][];
};

export const ROAD_WIDTH: Record<string, number> = {
  motorway: 22,
  trunk: 18,
  primary: 14,
  secondary: 11,
  tertiary: 9,
  unclassified: 7,
  residential: 6.5,
  service: 4.5,
  link: 8,
  living_street: 5,
};
/** Carriageway width: 3.4 m lanes + shoulders, plus the BRT lane where there is one. */
export function roadWidth(type: string, lanes: number, brt: boolean) {
  if (type === "service" || type === "living_street") return 4.5;
  if (type === "residential" || type === "unclassified") return 6.5;
  return lanes * 3.4 + 1.2 + (brt ? 3.6 : 0);
}

/** The Fusion Centre compound's centre (world x, z). */
const FUSION_CENTRE_XZ = [-2.05, 22.77];

export const MAJOR = new Set(["motorway", "trunk", "primary", "secondary", "tertiary", "link"]);

const CELL = 40;
const cellKey = (cx: number, cz: number) => cx + "," + cz;

function decode(flat: number[], from: number): Pt[] {
  const out: Pt[] = [];
  for (let i = from; i < flat.length; i += 2) out.push([flat[i] / 10, flat[i + 1] / 10]);
  return out;
}

function addToGrid(grid: Map<string, number[]>, pts: Pt[], idx: number, pad: number) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of pts) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  for (let cx = Math.floor((minX - pad) / CELL); cx <= Math.floor((maxX + pad) / CELL); cx++)
    for (let cz = Math.floor((minZ - pad) / CELL); cz <= Math.floor((maxZ + pad) / CELL); cz++) {
      const k = cellKey(cx, cz);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k)!.push(idx);
    }
}

function makeRoute(flat: number[]): Route {
  const pts = decode(flat, 0);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, length: cum[cum.length - 1] };
}

let promise: Promise<LagosWorld> | null = null;
let cached: LagosWorld | null = null;

export function loadLagos(): Promise<LagosWorld> {
  if (promise) return promise;
  promise = fetch("/world/lagos.json")
    .then((r) => r.json())
    .then((raw) => {
      const types: string[] = raw.roadTypes;
      const roads: Road[] = raw.roads.map((r: (number | string)[]) => {
        const type = types[r[0] as number];
        const flags = r[2] as number;
        const oneway = (flags & 1) === 1;
        const lanes = (flags >> 1) & 7;
        const brt = (flags & 16) === 16;
        return { type, name: r[1] as string, pts: decode(r as number[], 3), width: roadWidth(type, lanes, brt), oneway, lanes, brt };
      });
      // Adeniyi Jones Avenue is mapped as a dual carriageway (two one-way ways side by side), but
      // along the Fusion Centre it's one two-lane street like Acme Road: keep the carriageway by
      // the fence as a two-way road and drop the other
      const aj = roads.filter((r) => r.name === "Adeniyi Jones Avenue" && r.oneway);
      if (aj.length === 2) {
        const [cx, cz] = FUSION_CENTRE_XZ;
        const near = (r: Road) => Math.min(...r.pts.map(([x, z]) => Math.hypot(x - cx, z - cz)));
        const [keep, drop] = near(aj[0]) <= near(aj[1]) ? aj : [aj[1], aj[0]];
        keep.oneway = false;
        roads.splice(roads.indexOf(drop), 1);
      }
      // the two streets along the fence are four lanes (two each way): widened outwards, away
      // from the compound, so the edge by the fence stays where it was
      const widened: { r: Road; off: Pt[]; orig: Pt[] }[] = [];
      for (const r of roads) {
        if (r.name !== "Adeniyi Jones Avenue" && r.name !== "Acme Road") continue;
        if (r.oneway || r.lanes >= 4) continue;
        const [cx, cz] = FUSION_CENTRE_XZ;
        const near = r.pts.reduce((b, p, i) => (Math.hypot(p[0] - cx, p[1] - cz) < Math.hypot(r.pts[b][0] - cx, r.pts[b][1] - cz) ? i : b), 0);
        if (Math.hypot(r.pts[near][0] - cx, r.pts[near][1] - cz) > 80) continue;
        const width = roadWidth(r.type, 4, r.brt);
        const shift = (width - r.width) / 2;
        // right of travel at the closest point: towards the compound or away from it
        const a = r.pts[Math.max(0, near - 1)], b = r.pts[Math.min(r.pts.length - 1, near + 1)];
        const away = -(b[1] - a[1]) * (r.pts[near][0] - cx) + (b[0] - a[0]) * (r.pts[near][1] - cz) > 0 ? 1 : -1;
        const off = r.pts.map((_, i) => {
          const p0 = r.pts[Math.max(0, i - 1)], p1 = r.pts[Math.min(r.pts.length - 1, i + 1)];
          const l = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1;
          return [-((p1[1] - p0[1]) / l) * shift * away, ((p1[0] - p0[0]) / l) * shift * away] as Pt;
        });
        widened.push({ r, off, orig: r.pts });
        r.pts = r.pts.map((p, i) => [p[0] + off[i][0], p[1] + off[i][1]] as Pt);
        r.lanes = 4;
        r.width = width;
      }
      // where the two meet at the compound's corner, they still meet: the junction point moves by
      // both streets' shifts (to where their new centrelines cross), on each of them
      for (const A of widened)
        for (const B of widened) {
          if (A === B) continue;
          A.orig.forEach((p, i) => {
            const j = B.orig.findIndex((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 3);
            if (j < 0) return;
            A.r.pts[i] = [p[0] + A.off[i][0] + B.off[j][0], p[1] + A.off[i][1] + B.off[j][1]];
          });
        }
      const buildings: Building[] = raw.buildings.map((b: number[]) => ({ h: b[0] / 10, pts: decode(b, 1) }));
      const areas: Area[] = raw.areas.map((a: (number | string)[]) => ({ kind: a[0] as string, width: a[1] as number, pts: decode(a as number[], 2) }));
      const roadGrid = new Map<string, number[]>();
      roads.forEach((r, i) => addToGrid(roadGrid, r.pts, i, r.width));
      const buildingGrid = new Map<string, number[]>();
      buildings.forEach((b, i) => addToGrid(buildingGrid, b.pts, i, 1));
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const r of roads)
        for (const [x, z] of r.pts) {
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
        }
      cached = {
        roads,
        buildings,
        areas,
        routes: { airport: makeRoute(raw.routes.airport.pts), city: makeRoute(raw.routes.city.pts) },
        fusionPlot: raw.fusionPlot,
        gate: raw.gate,
        roadGrid,
        buildingGrid,
        bounds: { minX, maxX, minZ, maxZ },
        filler: (raw.filler ?? []).map((f: number[]) => [f[0] / 10, f[1] / 10, f[2] / 10, f[3] / 10, f[4] / 10, f[5]]),
      };
      return cached;
    });
  return promise;
}

export const getLagos = () => cached;

/** Distance from (x,z) to the nearest road centre line, and that road. */
export function nearestRoad(w: LagosWorld, x: number, z: number) {
  const ids = w.roadGrid.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL))) ?? [];
  let best = Infinity;
  let road: Road | null = null;
  for (const i of ids) {
    const r = w.roads[i];
    for (let k = 1; k < r.pts.length; k++) {
      const d = segDist(x, z, r.pts[k - 1], r.pts[k]);
      if (d < best) {
        best = d;
        road = r;
      }
    }
  }
  return { dist: best, road };
}

export function segDist(x: number, z: number, a: Pt, b: Pt) {
  const vx = b[0] - a[0], vz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (z - a[1]) * vz) / (vx * vx + vz * vz || 1)));
  return Math.hypot(a[0] + vx * t - x, a[1] + vz * t - z);
}

export function pointInPoly(x: number, z: number, pts: Pt[]) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i];
    const [xj, zj] = pts[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function insideBuilding(w: LagosWorld, x: number, z: number) {
  const ids = w.buildingGrid.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL))) ?? [];
  return ids.some((i) => pointInPoly(x, z, w.buildings[i].pts));
}

/** Projects (x,z) onto a route: distance along it and lateral offset. */
export function projectOnRoute(route: Route, x: number, z: number, hint = 0) {
  let best = Infinity;
  let bestS = 0;
  const from = Math.max(1, hint - 30);
  const to = Math.min(route.pts.length, hint + 60);
  let bestI = hint;
  for (let i = from; i < to; i++) {
    const a = route.pts[i - 1], b = route.pts[i];
    const vx = b[0] - a[0], vz = b[1] - a[1];
    const len2 = vx * vx + vz * vz || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (z - a[1]) * vz) / len2));
    const d = Math.hypot(a[0] + vx * t - x, a[1] + vz * t - z);
    if (d < best) {
      best = d;
      bestS = route.cum[i - 1] + t * Math.sqrt(len2);
      bestI = i;
    }
  }
  return { s: bestS, dist: best, index: bestI };
}

/** Point and direction at distance s along a route. */
export function routeAt(route: Route, s: number): { x: number; z: number; dx: number; dz: number } {
  s = Math.max(0, Math.min(route.length, s));
  let i = 1;
  while (i < route.cum.length - 1 && route.cum[i] < s) i++;
  const a = route.pts[i - 1], b = route.pts[i];
  const seg = route.cum[i] - route.cum[i - 1] || 1;
  const t = (s - route.cum[i - 1]) / seg;
  return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, dx: (b[0] - a[0]) / seg, dz: (b[1] - a[1]) / seg };
}

/** Distances along a route where bus stops stand (shared by the signage and the danfo). */
export function busStops(route: Route) {
  const out: number[] = [];
  for (let s = 300; s < route.length - 250; s += 620) out.push(s);
  return out;
}

/** Right-hand lane offsets (metres right of the centre line) for a road, kerb-side first. */
export function laneOffsets(r: Road | null) {
  if (!r) return [1.7];
  if (!MAJOR.has(r.type)) return [Math.max(1.1, r.width / 4)];
  if (r.oneway) return Array.from({ length: Math.max(1, r.lanes) }, (_, i) => r.width / 2 - 0.6 - 1.7 - 3.4 * i);
  const per = Math.max(1, Math.floor(r.lanes / 2));
  return Array.from({ length: per }, (_, i) => Math.max(1.5, r.width / 2 - 0.6 - 1.7 - 3.4 * i));
}
