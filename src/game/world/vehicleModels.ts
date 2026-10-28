import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Lagos road vehicles as single merged meshes with vertex colours, for instancing.
// "Paint" parts are white so a per-instance colour can tint them; glass, tyres and trim keep
// their dark colours (a tint barely changes them). Nose toward +Z, wheels on y = 0.

type Part = { geo: THREE.BufferGeometry; color: string };

function box(w: number, h: number, d: number, x: number, y: number, z: number, color: string, round = 0): Part {
  const g = round > 0 ? roundedBox(w, h, d, round) : new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return { geo: g, color };
}

function roundedBox(w: number, h: number, d: number, r: number) {
  // cheap rounding: chamfer the box by scaling a sphere-ish box (subdivided box pushed outward)
  const g = new THREE.BoxGeometry(w, h, d, 3, 2, 3);
  const p = g.getAttribute("position");
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const ex = Math.max(0, Math.abs(v.x) - (w / 2 - r)) / r;
    const ey = Math.max(0, Math.abs(v.y) - (h / 2 - r)) / r;
    const ez = Math.max(0, Math.abs(v.z) - (d / 2 - r)) / r;
    const k = Math.min(1, Math.hypot(ex, ey, ez));
    const shrink = 1 - 0.3 * k * k;
    if (ex > 0) v.x = Math.sign(v.x) * (w / 2 - r + (Math.abs(v.x) - (w / 2 - r)) * shrink);
    if (ez > 0) v.z = Math.sign(v.z) * (d / 2 - r + (Math.abs(v.z) - (d / 2 - r)) * shrink);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function wheel(r: number, wdt: number, x: number, z: number): Part[] {
  const t = new THREE.CylinderGeometry(r, r, wdt, 14).rotateZ(Math.PI / 2).translate(x, r, z);
  const h = new THREE.CylinderGeometry(r * 0.55, r * 0.55, wdt + 0.02, 10).rotateZ(Math.PI / 2).translate(x, r, z);
  return [
    { geo: t, color: "#151515" },
    { geo: h, color: "#8c9198" },
  ];
}

function merge(parts: Part[]) {
  const geos = parts.map(({ geo, color }) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const c = new THREE.Color(color);
    const n = g.getAttribute("position").count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.deleteAttribute("uv");
    return g;
  });
  const out = mergeGeometries(geos, false)!;
  out.computeBoundingSphere();
  return out;
}

const GLASS = "#141a22";
const PAINT = "#ffffff";
const HEAD = "#fff6d8";
const TAIL = "#d01818";

/** A car body extruded from a side silhouette (x = along the car, nose at +x), centred and turned nose → +Z. */
function profileBody(points: [number, number][], width: number, bevel: number, color: string): Part {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 6 });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2);
  return { geo: g, color };
}

export function sedan() {
  const body: [number, number][] = [
    [2.3, 0.34], [2.36, 0.56], [2.22, 0.76], [1.1, 0.9], [0.3, 1.36], [-0.95, 1.4], [-1.75, 1.02], [-2.28, 0.96], [-2.34, 0.52], [-2.22, 0.32],
  ];
  const glass: [number, number][] = [[1.02, 0.93], [0.32, 1.33], [-0.92, 1.37], [-1.66, 1.02]];
  return merge([
    profileBody(body, 1.82, 0.12, PAINT),
    profileBody(glass, 1.86, 0.02, GLASS),
    box(1.5, 0.08, 0.06, 0, 0.5, 2.36, "#2a2a2a"),
    box(0.36, 0.11, 0.04, -0.6, 0.7, 2.31, HEAD),
    box(0.36, 0.11, 0.04, 0.6, 0.7, 2.31, HEAD),
    box(0.4, 0.1, 0.04, -0.58, 0.82, -2.33, TAIL),
    box(0.4, 0.1, 0.04, 0.58, 0.82, -2.33, TAIL),
    ...wheel(0.34, 0.24, -0.82, 1.42),
    ...wheel(0.34, 0.24, 0.82, 1.42),
    ...wheel(0.34, 0.24, -0.82, -1.38),
    ...wheel(0.34, 0.24, 0.82, -1.38),
  ]);
}

export function suv() {
  const body: [number, number][] = [
    [2.4, 0.42], [2.45, 0.78], [2.3, 1.02], [1.35, 1.12], [0.75, 1.78], [-2.15, 1.82], [-2.42, 1.55], [-2.45, 0.5], [-2.3, 0.4],
  ];
  const glass: [number, number][] = [[1.28, 1.15], [0.78, 1.73], [-2.05, 1.76], [-2.3, 1.5], [-2.3, 1.18]];
  return merge([
    profileBody(body, 1.94, 0.14, PAINT),
    profileBody(glass, 1.98, 0.02, GLASS),
    box(1.7, 0.2, 0.08, 0, 0.62, 2.42, "#2a2a2a"),
    box(0.4, 0.14, 0.04, -0.66, 0.96, 2.4, HEAD),
    box(0.4, 0.14, 0.04, 0.66, 0.96, 2.4, HEAD),
    box(0.22, 0.34, 0.04, -0.78, 1.25, -2.44, TAIL),
    box(0.22, 0.34, 0.04, 0.78, 1.25, -2.44, TAIL),
    box(1.6, 0.06, 1.6, 0, 1.86, -0.6, "#222222"),
    ...wheel(0.4, 0.28, -0.88, 1.52),
    ...wheel(0.4, 0.28, 0.88, 1.52),
    ...wheel(0.4, 0.28, -0.88, -1.52),
    ...wheel(0.4, 0.28, 0.88, -1.52),
  ]);
}

/** The yellow danfo minibus with its black side stripes and open sliding door. */
export function danfo() {
  const Y = "#f2b705";
  const parts: Part[] = [
    box(1.95, 1.75, 4.7, 0, 1.25, 0, Y, 0.18),
    box(1.97, 0.12, 4.72, 0, 0.75, 0, "#111111"),
    box(1.97, 0.12, 4.72, 0, 1.0, 0, "#111111"),
    box(1.98, 0.62, 3.4, 0, 1.68, -0.45, GLASS),
    box(1.7, 0.7, 0.05, 0, 1.68, 2.36, GLASS),
    box(0.05, 1.3, 1.0, 0.99, 1.15, 0.6, "#1b1b1b"), // open door
    box(1.6, 0.12, 2.6, 0, 2.18, -0.6, "#3a3a3a"), // roof rack
    box(0.3, 0.14, 0.04, -0.7, 0.8, 2.36, HEAD),
    box(0.3, 0.14, 0.04, 0.7, 0.8, 2.36, HEAD),
    box(0.28, 0.2, 0.04, -0.75, 0.9, -2.36, TAIL),
    box(0.28, 0.2, 0.04, 0.75, 0.9, -2.36, TAIL),
    ...wheel(0.36, 0.25, -0.9, 1.5),
    ...wheel(0.36, 0.25, 0.9, 1.5),
    ...wheel(0.36, 0.25, -0.9, -1.5),
    ...wheel(0.36, 0.25, 0.9, -1.5),
  ];
  return merge(parts);
}

/** Lagos BRT bus: 12 m, blue with a red skirt and long window band. */
export function brtBus() {
  return merge([
    box(2.55, 2.6, 12, 0, 1.75, 0, "#1d4fbf", 0.25),
    box(2.57, 0.55, 12.02, 0, 0.75, 0, "#c0182a"),
    box(2.58, 1.0, 10.6, 0, 2.15, -0.3, GLASS),
    box(2.3, 1.3, 0.05, 0, 2.0, 6.01, GLASS),
    box(2.4, 0.3, 0.05, 0, 3.0, 6.0, "#ffcc33"),
    box(0.4, 0.18, 0.04, -0.9, 0.95, 6.01, HEAD),
    box(0.4, 0.18, 0.04, 0.9, 0.95, 6.01, HEAD),
    box(0.35, 0.3, 0.04, -1.0, 1.1, -6.01, TAIL),
    box(0.35, 0.3, 0.04, 1.0, 1.1, -6.01, TAIL),
    ...wheel(0.5, 0.32, -1.1, 4.1),
    ...wheel(0.5, 0.32, 1.1, 4.1),
    ...wheel(0.5, 0.32, -1.1, -3.6),
    ...wheel(0.5, 0.32, 1.1, -3.6),
  ]);
}

/** Molue-style big yellow bus with black stripes. */
export function molue() {
  return merge([
    box(2.45, 2.4, 10, 0, 1.7, 0, "#f2b705", 0.2),
    box(2.47, 0.16, 10.02, 0, 1.05, 0, "#111111"),
    box(2.47, 0.16, 10.02, 0, 1.35, 0, "#111111"),
    box(2.48, 0.9, 8.6, 0, 2.2, -0.3, GLASS),
    box(2.2, 1.1, 0.05, 0, 2.1, 5.01, GLASS),
    box(0.4, 0.18, 0.04, -0.85, 0.95, 5.01, HEAD),
    box(0.4, 0.18, 0.04, 0.85, 0.95, 5.01, HEAD),
    ...wheel(0.5, 0.3, -1.05, 3.4),
    ...wheel(0.5, 0.3, 1.05, 3.4),
    ...wheel(0.5, 0.3, -1.05, -3.2),
    ...wheel(0.5, 0.3, 1.05, -3.2),
  ]);
}

/** Keke NAPEP tricycle: yellow with a green stripe, open sides, rider inside. */
export function keke() {
  return merge([
    box(1.3, 0.5, 2.5, 0, 0.55, 0, "#f7c600", 0.12),
    box(1.32, 0.12, 2.52, 0, 0.82, 0, "#1f8a3a"),
    box(1.3, 0.08, 2.3, 0, 1.75, -0.1, "#111111"),
    box(0.06, 0.95, 0.06, -0.62, 1.28, 0.9, "#222222"),
    box(0.06, 0.95, 0.06, 0.62, 1.28, 0.9, "#222222"),
    box(0.06, 0.95, 0.06, -0.62, 1.28, -1.1, "#222222"),
    box(0.06, 0.95, 0.06, 0.62, 1.28, -1.1, "#222222"),
    box(1.1, 0.5, 0.05, 0, 1.4, 1.05, GLASS),
    box(0.45, 0.75, 0.4, 0, 1.15, 0.55, "#3b5998"), // driver
    box(0.25, 0.25, 0.25, 0, 1.6, 0.55, "#5a3a26"),
    ...wheel(0.25, 0.14, 0, 1.0),
    ...wheel(0.25, 0.14, -0.55, -0.9),
    ...wheel(0.25, 0.14, 0.55, -0.9),
  ]);
}

/** Okada: motorcycle with rider and passenger. */
export function okada() {
  return merge([
    box(0.32, 0.4, 1.7, 0, 0.62, 0, "#b81d1d"),
    box(0.5, 0.12, 0.3, 0, 1.05, 0.7, "#222222"),
    box(0.42, 0.7, 0.32, 0, 1.25, 0.05, "#e06b1f"), // rider vest
    box(0.24, 0.26, 0.26, 0, 1.75, 0.12, "#1b1b1b"), // helmet
    box(0.4, 0.62, 0.3, 0, 1.18, -0.45, "#2d6cdf"), // passenger
    box(0.22, 0.24, 0.24, 0, 1.62, -0.42, "#4a2e1d"),
    ...wheel(0.32, 0.1, 0, 0.72),
    ...wheel(0.32, 0.1, 0, -0.72),
  ]);
}

export function truck() {
  return merge([
    box(2.4, 2.2, 2.2, 0, 1.6, 3.2, "#d8d8d8", 0.15),
    box(2.42, 0.8, 2.0, 0, 2.1, 3.3, GLASS),
    box(2.5, 2.8, 6.6, 0, 2.05, -1.4, PAINT),
    ...wheel(0.5, 0.35, -1.05, 3.4),
    ...wheel(0.5, 0.35, 1.05, 3.4),
    ...wheel(0.5, 0.35, -1.05, -2.6),
    ...wheel(0.5, 0.35, 1.05, -2.6),
    ...wheel(0.5, 0.35, -1.05, -3.8),
    ...wheel(0.5, 0.35, 1.05, -3.8),
  ]);
}
