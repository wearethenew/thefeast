// Turns the raw OpenStreetMap extracts (assets-src/osm/{roads,areas}.json, fetched from Overpass)
// into public/world/lagos.json: roads, building footprints, airport/land areas and the driving
// routes to the Fusion Centre. Coordinates are metres around the Fusion Centre: +x east, +z south.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname;
const LAT0 = 6.6247679;
const LON0 = 3.3440103;
const KX = Math.cos((LAT0 * Math.PI) / 180) * 111320;
const KZ = 110574;
const xy = (p) => [(p.lon - LON0) * KX, -(p.lat - LAT0) * KZ];
const dm = (v) => Math.round(v * 10); // store decimetres as ints

const ROAD_TYPES = ["motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential", "service", "link", "living_street"];
const roadType = (h) => (h.endsWith("_link") ? "link" : ROAD_TYPES.includes(h) ? h : "residential");
// preference when routing: big roads first, like a taxi driver would
const COST = { motorway: 0.8, trunk: 0.85, primary: 0.9, secondary: 1, tertiary: 1.15, link: 1, unclassified: 1.6, residential: 1.9, living_street: 2.5, service: 4 };

const roads = JSON.parse(readFileSync(ROOT + "assets-src/osm/roads.json", "utf8")).elements;
// areas.json holds buildings for the north-east tile plus airport/land use; the other tiles are buildings only
const seen = new Set();
const areas = ["areas.json", "areas_south.json", "areas_west.json"]
  .flatMap((f) => JSON.parse(readFileSync(ROOT + "assets-src/osm/" + f, "utf8")).elements)
  .filter((e) => !seen.has(e.id) && seen.add(e.id));

// ---- road graph ----
const nodePos = new Map();
const adj = new Map();
const link = (a, b, w) => {
  if (!adj.has(a)) adj.set(a, []);
  adj.get(a).push([b, w]);
};
const outRoads = [];
for (const w of roads) {
  const t = roadType(w.tags.highway);
  const pts = w.geometry.map(xy);
  w.nodes.forEach((id, i) => nodePos.set(id, pts[i]));
  // respect one-way carriageways so the cab drives on the correct side of dual roads
  const ow = w.tags.oneway;
  const fwd = ow !== "-1";
  const back = !(["yes", "1", "true"].includes(ow) || ow === "-1" || t === "motorway" || w.tags.junction === "roundabout") || ow === "-1";
  for (let i = 1; i < w.nodes.length; i++) {
    const len = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (fwd) link(w.nodes[i - 1], w.nodes[i], len * COST[t]);
    if (back) link(w.nodes[i], w.nodes[i - 1], len * COST[t]);
  }
  // lanes / one-way / BRT packed into one int: bit0 oneway, bits1-3 lanes, bit4 BRT corridor
  const oneway = ["yes", "1", "true"].includes(w.tags.oneway) || t === "motorway" || w.tags.junction === "roundabout";
  const defLanes = { motorway: 3, trunk: 2, primary: 2, secondary: oneway ? 2 : 2, tertiary: 2, link: 1, residential: 2, unclassified: 2, service: 1, living_street: 1 }[t] ?? 2;
  const lanes = Math.max(1, Math.min(4, Number.parseInt(w.tags.lanes) || defLanes));
  const brt = /Lagos-Abeokuta Expressway|Agege Motor Road|Ikorodu Road|Funsho Williams/.test(w.tags.name ?? "") && oneway ? 1 : 0;
  outRoads.push([ROAD_TYPES.indexOf(t), w.tags.name ?? "", (oneway ? 1 : 0) | (lanes << 1) | (brt << 4), ...pts.flatMap(([x, z]) => [dm(x), dm(z)])]);
}

function nearestNode([x, z], allowed) {
  let best = null;
  let bd = Infinity;
  for (const [id, [nx, nz]] of nodePos) {
    if (allowed && !allowed(id)) continue;
    const d = (nx - x) ** 2 + (nz - z) ** 2;
    if (d < bd) {
      bd = d;
      best = id;
    }
  }
  return best;
}

function dijkstra(src, dst) {
  const dist = new Map([[src, 0]]);
  const prev = new Map();
  const open = new Set([src]);
  while (open.size) {
    let u = null;
    let ud = Infinity;
    for (const n of open) if (dist.get(n) < ud) ((ud = dist.get(n)), (u = n));
    open.delete(u);
    if (u === dst) break;
    for (const [v, w] of adj.get(u) ?? []) {
      const nd = ud + w;
      if (nd < (dist.get(v) ?? Infinity)) {
        dist.set(v, nd);
        prev.set(v, u);
        open.add(v);
      }
    }
  }
  const path = [];
  for (let n = dst; n !== undefined; n = prev.get(n)) path.unshift(n);
  return path[0] === src ? path : [];
}

const toLL = (lat, lon) => xy({ lat, lon });
// Gate of the Fusion Centre: on the street along the compound's east edge.
const GATE = [32, 18];
const dstNode = nearestNode(GATE);
const STARTS = {
  airport: toLL(6.5848, 3.3329), // MMIA domestic terminal (Terminal 2) forecourt
  city: toLL(6.6005, 3.3505), // Obafemi Awolowo Way, coming up from the mainland/Island
};
const routes = {};
for (const [k, p] of Object.entries(STARTS)) {
  const path = dijkstra(nearestNode(p), dstNode);
  const pts = path.map((id) => nodePos.get(id));
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  routes[k] = { length: Math.round(len), pts: pts.flatMap(([x, z]) => [dm(x), dm(z)]) };
  console.log("route", k, Math.round(len) + "m", pts.length, "nodes");
}

// ---- buildings and areas ----
function pointIn(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
// the whole Fusion Centre plot (walls) — kept free of OSM/infill buildings; matches src/game/world/compound.ts
const FUSION_PLOT = [[39.2, 34.2], [-17, 56.8], [-46.4, -16.5], [9.8, -39.1]];
const outBuildings = [];
const outAreas = [];
let rnd = 1;
const rand = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
for (const a of areas) {
  const t = a.tags;
  const pts = a.geometry.map(xy);
  if (pts.length > 1 && pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1]) pts.pop();
  if (pts.length < 3) continue;
  const flat = pts.flatMap(([x, z]) => [dm(x), dm(z)]);
  if (t.building) {
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    if (pointIn(cx, cz, FUSION_PLOT) || pts.some(([x, z]) => pointIn(x, z, FUSION_PLOT))) continue; // the Fusion Centre is modelled by hand
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x1, z1] = pts[i];
      const [x2, z2] = pts[(i + 1) % pts.length];
      area += x1 * z2 - x2 * z1;
    }
    area = Math.abs(area / 2);
    if (area < 12) continue;
    const levels = Number(t["building:levels"]) || (area > 1500 ? 2 + rand() * 2 : area > 300 ? 1 + Math.floor(rand() * 4) : 1 + Math.floor(rand() * 2.6));
    const h = Number.parseFloat(t.height) || levels * 3.3 + (t.building === "roof" ? 0 : 0.6);
    outBuildings.push([dm(h), ...flat]);
  } else {
    const kind = t.aeroway ? "aero_" + t.aeroway : t.landuse ? "land_" + t.landuse : "leisure_" + t.leisure;
    // runways/taxiways come as centre lines with a width
    const width = t.aeroway === "runway" ? 45 : t.aeroway === "taxiway" ? 18 : 0;
    outAreas.push([kind, width, ...a.geometry.map(xy).flatMap(([x, z]) => [dm(x), dm(z)])]);
  }
}

// Keep the city around the routes only: everything else is never seen from the road.
const routePts = Object.values(routes).flatMap((r) => {
  const out = [];
  for (let i = 0; i < r.pts.length; i += 2) out.push([r.pts[i] / 10, r.pts[i + 1] / 10]);
  return out;
});
const routeSegs = Object.values(routes).flatMap((r) => {
  const segs = [];
  for (let i = 2; i < r.pts.length; i += 2) segs.push([r.pts[i - 2] / 10, r.pts[i - 1] / 10, r.pts[i] / 10, r.pts[i + 1] / 10]);
  return segs;
});
const nearRoute = (flat, radius) => {
  let cx = 0, cz = 0;
  const n = (flat.length - 1) / 2;
  for (let i = 1; i < flat.length; i += 2) ((cx += flat[i] / 10), (cz += flat[i + 1] / 10));
  cx /= n; cz /= n;
  if (Math.hypot(cx, cz) < radius * 1.3) return true;
  return routeSegs.some(([ax, az, bx, bz]) => {
    const vx = bx - ax, vz = bz - az;
    const t = Math.max(0, Math.min(1, ((cx - ax) * vx + (cz - az) * vz) / (vx * vx + vz * vz || 1)));
    return (ax + vx * t - cx) ** 2 + (az + vz * t - cz) ** 2 < radius * radius;
  });
};
// every road in the extract (before the corridor filter): nothing may be built on any of them
const allRoadsRaw = outRoads.slice();
const before = outBuildings.length;
const kept = outBuildings.filter((b) => nearRoute(b, 420));
outBuildings.length = 0;
outBuildings.push(...kept);
const keptRoads = outRoads.filter((r) => nearRoute([0, ...r.slice(3)], 700));
console.log("buildings near routes", kept.length, "of", before, "roads", keptRoads.length, "of", outRoads.length);
outRoads.length = 0;
outRoads.push(...keptRoads);

// ---- infill: OSM is sparse around Ogba/Ikeja, so line the real streets with plausible buildings ----
const CELL = 8;
const occ = new Set();
const key = (x, z) => Math.floor(x / CELL) + "," + Math.floor(z / CELL);
const markPoly = (pts, pad) => {
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  for (let x = Math.min(...xs) - pad; x <= Math.max(...xs) + pad; x += CELL / 2)
    for (let z = Math.min(...zs) - pad; z <= Math.max(...zs) + pad; z += CELL / 2) occ.add(key(x, z));
};
/** Carriageway width from lanes (3.4 m each) + shoulders, plus a dedicated BRT lane. */
const roadWidth = (r) => {
  const flags = r[2];
  const lanes = (flags >> 1) & 7;
  const type = ROAD_TYPES[r[0]];
  if (type === "service" || type === "living_street") return 4.5;
  if (type === "residential" || type === "unclassified") return 6.5;
  return lanes * 3.4 + 1.2 + (flags & 16 ? 3.6 : 0) + (flags & 1 ? 0 : lanes * 0);
};
const ROAD_W = { motorway: 22, trunk: 18, primary: 14, secondary: 11, tertiary: 9, unclassified: 7, residential: 6.5, service: 4.5, link: 8, living_street: 5 };
const polyOf = (flat, from) => {
  const pts = [];
  for (let i = from; i < flat.length; i += 2) pts.push([flat[i] / 10, flat[i + 1] / 10]);
  return pts;
};
const allRoadPolys = allRoadsRaw.map((r) => ({ w: roadWidth(r), pts: polyOf(r, 3) }));
const occRoad = new Set();
for (const p of allRoadPolys) {
  const half = p.w / 2 + 2;
  for (let i = 1; i < p.pts.length; i++) {
    const [ax, az] = p.pts[i - 1], [bx, bz] = p.pts[i];
    const len = Math.hypot(bx - ax, bz - az) || 1;
    for (let t = 0; t <= len; t += CELL / 2) {
      const x = ax + ((bx - ax) * t) / len, z = az + ((bz - az) * t) / len;
      for (let o = -half; o <= half; o += CELL / 2) occRoad.add(key(x + (-(bz - az) / len) * o, z + ((bx - ax) / len) * o));
    }
  }
}
for (const b of outBuildings) markPoly(polyOf(b, 1), 1);
markPoly(FUSION_PLOT, 6);
for (const r of allRoadPolys.map((p) => [0, "", 0, ...p.pts.flatMap(([x, z]) => [dm(x), dm(z)])]).map((r, i) => Object.assign(r, { _w: allRoadPolys[i].w }))) {
  const pts = polyOf(r, 3);
  const half = r._w / 2 + 1.5;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const len = Math.hypot(bx - ax, bz - az);
    for (let t = 0; t <= len; t += CELL / 2) {
      const x = ax + ((bx - ax) * t) / len, z = az + ((bz - az) * t) / len;
      for (let o = -half; o <= half; o += CELL / 2) occ.add(key(x + (-(bz - az) / len) * o, z + ((bx - ax) / len) * o));
    }
  }
}
const free = (corners) => corners.every(([x, z]) => !occ.has(key(x, z)));
let infill = 0;
const FILL_ON = new Set(["primary", "secondary", "tertiary", "unclassified", "residential", "trunk"]);
for (const r of outRoads) {
  const type = ROAD_TYPES[r[0]];
  if (!FILL_ON.has(type)) continue;
  const pts = polyOf(r, 3);
  const half = roadWidth(r) / 2;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 12) continue;
    const dx = (bx - ax) / len, dz = (bz - az) / len;
    const nx = -dz, nz = dx;
    for (const side of [-1, 1]) {
      for (let t = 6 + rand() * 6; t < len - 6; ) {
        const w = 9 + rand() * 12;
        const depth = 10 + rand() * 14;
        const setback = half + 3 + rand() * 4;
        const cx = ax + dx * (t + w / 2) + nx * side * (setback + depth / 2);
        const cz = az + dz * (t + w / 2) + nz * side * (setback + depth / 2);
        const corners = [];
        for (const [u, v] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) corners.push([cx + dx * u * w + nx * v * depth, cz + dz * u * w + nz * v * depth]);
        const probe = [...corners, [cx, cz], [(corners[0][0] + corners[1][0]) / 2, (corners[0][1] + corners[1][1]) / 2]];
        if (free(probe) && nearRoute([0, dm(cx), dm(cz)], 420)) {
          const levels = 1 + Math.floor(rand() * rand() * 5);
          outBuildings.push([dm(levels * 3.3 + 0.6), ...corners.flatMap(([x, z]) => [dm(x), dm(z)])]);
          markPoly(corners, 2);
          infill++;
        }
        t += w + 2 + rand() * 6;
      }
    }
  }
}
console.log("infill buildings", infill);

// final pass: remove any building whose footprint touches a carriageway (OSM has a few mis-mapped ones)
// exact test against a segment hash of every road: is (x,z) on a carriageway (+margin)?
const SEG = 25;
const segHash = new Map();
for (const p of allRoadPolys)
  for (let i = 1; i < p.pts.length; i++) {
    const [ax, az] = p.pts[i - 1], [bx, bz] = p.pts[i];
    const r = p.w / 2 + 3;
    for (let cx = Math.floor((Math.min(ax, bx) - r) / SEG); cx <= Math.floor((Math.max(ax, bx) + r) / SEG); cx++)
      for (let cz = Math.floor((Math.min(az, bz) - r) / SEG); cz <= Math.floor((Math.max(az, bz) + r) / SEG); cz++) {
        const k = cx + "," + cz;
        if (!segHash.has(k)) segHash.set(k, []);
        segHash.get(k).push([ax, az, bx, bz, p.w / 2]);
      }
  }
const onCarriageway = (x, z, margin) =>
  (segHash.get(Math.floor(x / SEG) + "," + Math.floor(z / SEG)) ?? []).some(([ax, az, bx, bz, hw]) => {
    const vx = bx - ax, vz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1)));
    return Math.hypot(ax + vx * t - x, az + vz * t - z) < hw + margin;
  });
const onRoad = (pts) => {
  const c = [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
  return [...pts, c].some(([x, z]) => onCarriageway(x, z, -0.5));
};
const keptB = outBuildings.filter((b) => !onRoad(polyOf(b, 1)));
console.log("buildings removed from roads", outBuildings.length - keptB.length);
outBuildings.length = 0;
outBuildings.push(...keptB);

// ---- filler blocks for the far city (seen from the plane and down long streets) ----
let seedF = 4242;
const rndF = () => ((seedF = (seedF * 16807) % 2147483647) / 2147483647);
const filler = [];
for (let i = 0; i < 12000 && filler.length < 9000; i++) {
  const x = -4200 + rndF() * 7200;
  const z = -3200 + rndF() * 10500;
  if (x < -900 && x > -3900 && z > 2700 && z < 8400) continue; // the airfield
  if (pointIn(x, z, FUSION_PLOT)) continue;
  const w = 7 + rndF() * 14, d = 7 + rndF() * 14;
  const corners = [[x - w / 2, z - d / 2], [x + w / 2, z - d / 2], [x + w / 2, z + d / 2], [x - w / 2, z + d / 2], [x, z]];
  if (corners.some(([cx, cz]) => onCarriageway(cx, cz, 2) || occ.has(key(cx, cz)))) continue;
  const h = 3 + rndF() * rndF() * 14;
  filler.push([dm(x), dm(z), dm(w), dm(d), dm(h), Math.floor(rndF() * 8)]);
}
console.log("filler blocks", filler.length);

mkdirSync(ROOT + "public/world", { recursive: true });
const out = { origin: { lat: LAT0, lon: LON0 }, roadTypes: ROAD_TYPES, roads: outRoads, buildings: outBuildings, areas: outAreas, routes, fusionPlot: FUSION_PLOT, gate: GATE, filler };
writeFileSync(ROOT + "public/world/lagos.json", JSON.stringify(out));
console.log("roads", outRoads.length, "buildings", outBuildings.length, "areas", outAreas.length);
