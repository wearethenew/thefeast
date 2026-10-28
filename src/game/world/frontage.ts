import { PED_GATE, PLOT, plotPolygonWorld, toWorld } from "./compound";
import { MAJOR, insideBuilding, nearestRoad, pointInPoly, type LagosWorld } from "./lagosData";
import { getStreams, litTimeAt } from "./processionData";

// Shop-houses and blocks shoulder to shoulder along the streets, right behind the footpath, so
// Ikeja reads as a packed city. Each block is checked against every road (never on a carriageway),
// the real buildings, the airfield, the green belt round the Fusion Centre and blocks already
// placed. Pure data, so it can run in a worker (see cityWorker.ts) without holding up the page.

const FRONTAGE_TYPES = new Set(["trunk", "primary", "secondary", "tertiary", "unclassified", "residential"]);
/** Floats per block in the packed result: x, z, width, height, depth, heading, colour index, lit time. */
export const FRONTAGE_STRIDE = 8;
export const FRONTAGE_PALETTE = ["#e8dcc4", "#d7c3a3", "#c9a27e", "#efe8dc", "#b9a58b", "#9a8f86", "#c26b4a", "#7d8186", "#e3d27a", "#9fb8c9"];

function hash(n: number) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

export function buildFrontage(world: LagosWorld): Float32Array {
  const belt = plotPolygonWorld(20);
  const gate = toWorld(PLOT.x0 - 2, (PED_GATE.z0 + PED_GATE.z1) / 2);
  const streams = getStreams(world, [gate.x, gate.z]);
  const aero = world.areas
    .filter((a) => a.kind.startsWith("aero"))
    .map((a) => {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const [x, z] of a.pts) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        z0 = Math.min(z0, z);
        z1 = Math.max(z1, z);
      }
      const pad = 30 + a.width;
      return [x0 - pad, z0 - pad, x1 + pad, z1 + pad];
    });
  const taken = new Set<string>();
  const cellKey = (x: number, z: number) => Math.floor(x / 2) + "," + Math.floor(z / 2);
  const out: number[] = [];
  let n = 0;
  for (const r of world.roads) {
    if (!FRONTAGE_TYPES.has(r.type)) continue;
    const major = MAJOR.has(r.type);
    for (let i = 1; i < r.pts.length; i++) {
      const [ax, az] = r.pts[i - 1];
      const [bx, bz] = r.pts[i];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 8) continue;
      const dx = (bx - ax) / len, dz = (bz - az) / len;
      for (const side of [-1, 1]) {
        let t = 3;
        while (t < len - 3) {
          n++;
          const w = Math.min(len - 3 - t, 6 + hash(n) * 10);
          if (w < 5) break;
          const d = 9 + hash(n + 0.3) * (major ? 12 : 7);
          const h = major ? 7 + Math.pow(hash(n + 0.6), 1.6) * 30 : 4.5 + hash(n + 0.6) * 9;
          const off = r.width / 2 + 3.2 + d / 2;
          const cx = ax + dx * (t + w / 2) - dz * off * side;
          const cz = az + dz * (t + w / 2) + dx * off * side;
          t += w + 0.4 + hash(n + 0.8) * 1.6;
          // sample the footprint every couple of metres; cheapest tests first
          const pts: [number, number][] = [];
          for (let u = -w / 2; u <= w / 2 + 0.01; u += Math.max(1.5, w / 4))
            for (let v = -d / 2; v <= d / 2 + 0.01; v += Math.max(1.5, d / 5)) pts.push([cx + dx * u - dz * v * side, cz + dz * u + dx * v * side]);
          const clear = pts.every(([x, z]) => {
            if (taken.has(cellKey(x, z))) return false;
            if (aero.some(([x0, z0, x1, z1]) => x > x0 && x < x1 && z > z0 && z < z1)) return false;
            if (pointInPoly(x, z, belt)) return false;
            const near = nearestRoad(world, x, z);
            if (near.road && near.dist < near.road.width / 2 + 2.6) return false;
            return !insideBuilding(world, x, z);
          });
          if (!clear) continue;
          for (const [x, z] of pts) taken.add(cellKey(x, z));
          out.push(cx, cz, w, h, d, Math.atan2(dx, dz), Math.floor(hash(n + 0.9) * FRONTAGE_PALETTE.length), litTimeAt(streams, cx, cz));
        }
      }
    }
  }
  return new Float32Array(out);
}
