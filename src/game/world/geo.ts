import * as THREE from "three";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import land110 from "world-atlas/land-110m.json";

export const GLOBE_R = 100;

/** lat/lon (degrees) → point on a sphere of radius r (+Y north, lon 0 facing +Z). */
export function latLonToVec(lat: number, lon: number, r = GLOBE_R, out = new THREE.Vector3()) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon);
  return out.set(r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.cos(theta));
}

type Ring = [number, number][];

function inRing(lon: number, lat: number, ring: Ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

let landDots: Float32Array | null = null;

/** Positions of dots on land, sampled on an even lat/lon grid (cached). */
export function getLandDots(step = 1.25) {
  if (landDots) return landDots;
  const topo = land110 as unknown as Topology;
  const geo = feature(topo, topo.objects.land as GeometryCollection) as unknown as GeoJSON.FeatureCollection;
  const polys: { rings: Ring[]; box: [number, number, number, number] }[] = [];
  for (const f of geo.features) {
    const g = f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon;
    const list = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    for (const p of list) {
      const rings = p as Ring[];
      const xs = rings[0].map((c) => c[0]);
      const ys = rings[0].map((c) => c[1]);
      polys.push({ rings, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] });
    }
  }
  const pts: number[] = [];
  const v = new THREE.Vector3();
  for (let lat = -80; lat <= 82; lat += step) {
    // keep dot spacing roughly even toward the poles
    const lonStep = step / Math.max(0.2, Math.cos(THREE.MathUtils.degToRad(lat)));
    for (let lon = -180; lon < 180; lon += lonStep) {
      const hit = polys.some(
        (p) => lon >= p.box[0] && lon <= p.box[2] && lat >= p.box[1] && lat <= p.box[3] && inRing(lon, lat, p.rings[0]) && !p.rings.slice(1).some((h) => inRing(lon, lat, h)),
      );
      if (hit) {
        latLonToVec(lat, lon, GLOBE_R, v);
        pts.push(v.x, v.y, v.z);
      }
    }
  }
  landDots = new Float32Array(pts);
  return landDots;
}

/** Great-circle arc between two lat/lons, lifted off the surface; returns a curve. */
export function flightArc(a: { lat: number; lon: number }, b: { lat: number; lon: number }, samples = 120) {
  const va = latLonToVec(a.lat, a.lon, 1);
  const vb = latLonToVec(b.lat, b.lon, 1);
  const angle = va.angleTo(vb);
  const lift = 0.05 + 0.22 * Math.min(1, angle / 1.2);
  const axis = new THREE.Vector3().crossVectors(va, vb);
  if (axis.lengthSq() < 1e-9) axis.set(0, 1, 0);
  axis.normalize();
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    // rotate along the great circle; altitude is a smooth hump
    const p = va.clone().applyAxisAngle(axis, angle * t);
    p.multiplyScalar(GLOBE_R * (1 + lift * Math.sin(Math.PI * t)));
    pts.push(p);
  }
  return new THREE.CatmullRomCurve3(pts);
}
