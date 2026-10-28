import * as THREE from "three";
import { MAJOR, type LagosWorld, type Pt } from "./lagosData";

// Geometry for the streets of Ikeja/Ogba: road ribbons, extruded buildings and ground areas.

/** A flat ribbon along a polyline. uv.x across (0..1), uv.y along in metres. */
function ribbon(pts: Pt[], width: number, y: number, pos: number[], uv: number[], idx: number[]) {
  if (pts.length < 2) return;
  const base = pos.length / 3;
  let along = 0;
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    let dx = next[0] - prev[0];
    let dz = next[1] - prev[1];
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    // miter: average of adjacent segment normals, clamped
    let nx = -dz;
    let nz = dx;
    let scale = 1;
    if (i > 0 && i < pts.length - 1) {
      const ax = pts[i][0] - prev[0], az = pts[i][1] - prev[1];
      const al = Math.hypot(ax, az) || 1;
      const n1x = -az / al, n1z = ax / al;
      const dot = n1x * nx + n1z * nz;
      scale = Math.min(2, 1 / Math.max(0.5, dot));
    }
    nx *= (width / 2) * scale;
    nz *= (width / 2) * scale;
    if (i > 0) along += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    pos.push(pts[i][0] + nx, y, pts[i][1] + nz, pts[i][0] - nx, y, pts[i][1] - nz);
    uv.push(0, along, 1, along);
    if (i > 0) {
      const a = base + (i - 1) * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
}

function toGeometry(pos: number[], uv: number[], idx: number[]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  const n = new Float32Array(pos.length);
  for (let i = 1; i < n.length; i += 3) n[i] = 1;
  g.setAttribute("normal", new THREE.BufferAttribute(n, 3));
  g.setIndex(idx);
  return g;
}

/** Road surface style: which lane-marking texture a road uses. */
export type RoadStyle = { key: string; major: boolean; oneway: boolean; lanes: number; brt: boolean };

export function roadStyle(r: { type: string; oneway: boolean; lanes: number; brt: boolean }): RoadStyle {
  const major = MAJOR.has(r.type);
  const lanes = major ? r.lanes : 0;
  const oneway = major && r.oneway;
  return { key: `${major ? "M" : "m"}${oneway ? "o" : "t"}${lanes}${r.brt ? "b" : ""}`, major, oneway, lanes, brt: r.brt };
}

/** Thin wall following a polyline at a sideways offset (median barriers). */
function wallAlong(pts: Pt[], offset: number, h: number, t: number, pos: number[], idx: number[], keep: (a: Pt, b: Pt) => boolean) {
  for (let i = 1; i < pts.length; i++) {
    if (!keep(pts[i - 1], pts[i])) continue;
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.5) continue;
    const nx = (bz - az) / len, nz = -(bx - ax) / len; // left of travel
    const ox = nx * offset, oz = nz * offset;
    const base = pos.length / 3;
    for (const s of [-t / 2, t / 2])
      pos.push(ax + ox + nx * s, 0, az + oz + nz * s, bx + ox + nx * s, 0, bz + oz + nz * s, bx + ox + nx * s * 0.5, h, bz + oz + nz * s * 0.5, ax + ox + nx * s * 0.5, h, az + oz + nz * s * 0.5);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3, base + 4, base + 6, base + 5, base + 4, base + 7, base + 6, base + 3, base + 2, base + 6, base + 3, base + 6, base + 7);
  }
}

/** Splits long segments so barriers can stop short of junctions. */
function subdivide(pts: Pt[], step: number): Pt[] {
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let k = 1; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  return out;
}

/** Is there a one-way carriageway running the other way just to the left (i.e. a real median)? */
function oppositeOnLeft(w: LagosWorld, self: LagosWorld["roads"][number], x: number, z: number, dx: number, dz: number) {
  const lx = dz, lz = -dx; // left of travel
  for (const dist of [self.width / 2 + 3, self.width / 2 + 7, self.width / 2 + 12]) {
    const px = x + lx * dist, pz = z + lz * dist;
    const ids = w.roadGrid.get(Math.floor(px / 40) + "," + Math.floor(pz / 40)) ?? [];
    for (const id of ids) {
      const o = w.roads[id];
      if (o === self || !o.oneway) continue;
      for (let i = 1; i < o.pts.length; i++) {
        const [ax, az] = o.pts[i - 1], [bx, bz] = o.pts[i];
        const len = Math.hypot(bx - ax, bz - az) || 1;
        const ox = (bx - ax) / len, oz = (bz - az) / len;
        if (ox * dx + oz * dz > -0.7) continue; // must run the opposite way
        const t = Math.max(0, Math.min(1, ((px - ax) * ox + (pz - az) * oz) / len));
        if (Math.hypot(ax + ox * len * t - px, az + oz * len * t - pz) < o.width / 2 + 1.5) return true;
      }
    }
  }
  return false;
}

export function buildRoads(w: LagosWorld) {
  // every road end is a junction or a dead end; barriers keep clear of them
  const ends: Pt[] = [];
  for (const r of w.roads) ends.push(r.pts[0], r.pts[r.pts.length - 1]);
  const groups = new Map<string, { style: RoadStyle; p: number[]; u: number[]; i: number[] }>();
  const kerb = { p: [] as number[], u: [] as number[], i: [] as number[] };
  const barrier = { p: [] as number[], i: [] as number[] };
  // minor roads first and lower so junctions with major roads look right
  for (const r of w.roads) {
    const style = roadStyle(r);
    if (!groups.has(style.key)) groups.set(style.key, { style, p: [], u: [], i: [] });
    const g = groups.get(style.key)!;
    ribbon(r.pts, r.width, style.major ? 0.06 : 0.04, g.p, g.u, g.i);
    if (style.major) ribbon(r.pts, r.width + 3.2, 0.03, kerb.p, kerb.u, kerb.i);
    // dual carriageways: a concrete barrier along the median, only where the opposite carriageway
    // really runs alongside, and never across a junction
    if (style.oneway && style.major && r.type !== "link") {
      const keep = (a: Pt, b: Pt) => {
        const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
        if (ends.some(([ex, ez]) => (ex - mx) ** 2 + (ez - mz) ** 2 < 22 * 22)) return false;
        return oppositeOnLeft(w, r, mx, mz, dx, dz);
      };
      wallAlong(subdivide(r.pts, 12), r.width / 2 + 0.35, 0.85, 0.45, barrier.p, barrier.i, keep);
    }
  }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute("position", new THREE.Float32BufferAttribute(barrier.p, 3));
  bg.setIndex(barrier.i);
  bg.computeVertexNormals();
  return {
    surfaces: [...groups.values()].map((g) => ({ style: g.style, geometry: toGeometry(g.p, g.u, g.i) })),
    kerb: toGeometry(kerb.p, kerb.u, kerb.i),
    barrier: bg,
  };
}

export function buildAirfield(w: LagosWorld) {
  const run = { p: [] as number[], u: [] as number[], i: [] as number[] };
  const taxi = { p: [] as number[], u: [] as number[], i: [] as number[] };
  const aprons: THREE.BufferGeometry[] = [];
  for (const a of w.areas) {
    if (a.kind === "aero_runway") ribbon(a.pts, 45, 0.05, run.p, run.u, run.i);
    else if (a.kind === "aero_taxiway") ribbon(a.pts, 18, 0.045, taxi.p, taxi.u, taxi.i);
    else if (a.kind === "aero_apron") aprons.push(flatPolygon(a.pts, 0.035));
  }
  return { runway: toGeometry(run.p, run.u, run.i), taxiway: toGeometry(taxi.p, taxi.u, taxi.i), aprons: merge(aprons) };
}

export function flatPolygon(pts: Pt[], y: number) {
  const contour = pts.map(([x, z]) => new THREE.Vector2(x, z));
  if (THREE.ShapeUtils.isClockWise(contour)) contour.reverse();
  const tris = THREE.ShapeUtils.triangulateShape(contour, []);
  const pos: number[] = [];
  const uv: number[] = [];
  for (const c of contour) {
    pos.push(c.x, y, c.y);
    uv.push(c.x / 10, c.y / 10);
  }
  const idx: number[] = [];
  for (const [a, b, c] of tris) idx.push(a, c, b);
  return toGeometry(pos, uv, idx);
}

export function buildAreas(w: LagosWorld) {
  const byKind: Record<string, THREE.BufferGeometry[]> = { green: [], built: [] };
  for (const a of w.areas) {
    if (a.kind.startsWith("aero")) continue;
    const green = /grass|forest|park|golf|pitch|recreation/.test(a.kind);
    if (a.pts.length >= 3) (green ? byKind.green : byKind.built).push(flatPolygon(a.pts, green ? 0.02 : 0.015));
  }
  return { green: merge(byKind.green), built: merge(byKind.built) };
}

function merge(list: THREE.BufferGeometry[]) {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (const g of list) {
    const base = pos.length / 3;
    pos.push(...(g.getAttribute("position").array as Float32Array));
    uv.push(...(g.getAttribute("uv").array as Float32Array));
    for (const i of g.getIndex()!.array) idx.push(i + base);
  }
  return toGeometry(pos, uv, idx);
}

// Lagos palette: cream, sand, terracotta, pale pastels, white with weathering.
const FACADES = ["#efe6d2", "#e8d9b9", "#d9c3a0", "#f3efe6", "#e5cfc0", "#cfd8d2", "#e9dcc9", "#d8b892", "#c9a27e", "#f1e2c6", "#dfe6ea", "#e6d1b3"];
const ROOFS = ["#7c3b2a", "#8a8f94", "#5d6268", "#9a4a2f", "#6e7378", "#4f5a63"];

/**
 * Buildings as one mesh: walls (uv = perimeter metres, height metres, for the window shader)
 * and flat roofs (uv.y = -1 so the shader skips windows). Colour per building.
 */
export function buildBuildings(w: LagosWorld, litTime: (x: number, z: number) => number = () => 0) {
  const pos: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const nrm: number[] = [];
  const seed: number[] = [];
  const lit: number[] = [];
  const idx: number[] = [];
  const c = new THREE.Color();
  w.buildings.forEach((b, bi) => {
    const pts = b.pts;
    if (pts.length < 3) return;
    const lt = litTime(pts[0][0], pts[0][1]);
    const before = pos.length / 3;
    const ring = pts.map(([x, z]) => new THREE.Vector2(x, z));
    if (THREE.ShapeUtils.isClockWise(ring)) ring.reverse();
    const h = Math.max(3, b.h);
    const rnd = (Math.sin(bi * 12.9898) * 43758.5453) % 1;
    const r = Math.abs(rnd);
    c.set(FACADES[Math.floor(r * FACADES.length)]);
    // walls
    let per = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const d = ring[(i + 1) % ring.length];
      const len = a.distanceTo(d);
      if (len < 0.01) continue;
      const nx = (d.y - a.y) / len;
      const nz = -(d.x - a.x) / len;
      const base = pos.length / 3;
      // wind each wall so it faces outward when seen from outside
      pos.push(d.x, 0, d.y, a.x, 0, a.y, a.x, h, a.y, d.x, h, d.y);
      uv.push(per + len, 0, per, 0, per, h, per + len, h);
      for (let k = 0; k < 4; k++) {
        col.push(c.r, c.g, c.b);
        nrm.push(nx, 0, nz);
        seed.push(r);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      per += len;
    }
    // roof
    const rc = new THREE.Color(ROOFS[Math.floor(((r * 7.3) % 1) * ROOFS.length)]);
    const tris = THREE.ShapeUtils.triangulateShape(ring, []);
    const base = pos.length / 3;
    for (const p of ring) {
      pos.push(p.x, h, p.y);
      uv.push(0, -1);
      col.push(rc.r, rc.g, rc.b);
      nrm.push(0, 1, 0);
      seed.push(r);
    }
    for (const [a, bb, cc] of tris) idx.push(base + a, base + cc, base + bb);
    for (let i = before; i < pos.length / 3; i++) lit.push(lt);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute("seed", new THREE.Float32BufferAttribute(seed, 1));
  g.setAttribute("litT", new THREE.Float32BufferAttribute(lit, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** Facade material: vertex colour + procedural windows (some lit at dusk) and a darker plinth. */
/**
 * City lights for the procession: with uProc on, windows stay dark until the torches reach each
 * building (its `litT`, seconds into the procession), then most of them come on.
 */
export const cityLights = { uProc: { value: 0 }, uTime: { value: 0 } };

/** The window glow shared by real buildings and filler blocks (needs `win`, `cell`, `vSeed`, `vLitT`). */
const WINDOW_LIGHT = `
  float lit = smoothstep(vLitT, vLitT + 1.6, uLitTime) * uProc;
  float share = mix(mix(0.72, 0.97, uProc), 0.3, lit);
  winLit = win * step(share, h21(cell + vSeed * 17.0)) * mix(1.0, 1.5, lit);
`;

export function buildingMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.02 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uProc = cityLights.uProc;
    shader.uniforms.uLitTime = cityLights.uTime;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float seed;\nattribute float litT;\nvarying vec2 vFacade;\nvarying float vSeed;\nvarying float vLitT;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvFacade = uv;\nvSeed = seed;\nvLitT = litT;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uProc;\nuniform float uLitTime;\nvarying vec2 vFacade;\nvarying float vSeed;\nvarying float vLitT;\nfloat h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float winLit = 0.0;
        if (vFacade.y >= 0.0) {
          float fl = floor(vFacade.y / 3.3);
          float colw = 2.8 + vSeed * 1.2;
          vec2 cell = vec2(floor(vFacade.x / colw), fl);
          vec2 f = vec2(fract(vFacade.x / colw), fract(vFacade.y / 3.3));
          float win = step(0.22, f.x) * step(f.x, 0.78) * step(0.3, f.y) * step(f.y, 0.78) * step(0.5, fl + 0.6);
          // weathering streaks + plinth
          diffuseColor.rgb *= 0.88 + 0.12 * h21(vec2(floor(vFacade.x * 0.7), vSeed));
          diffuseColor.rgb *= mix(0.72, 1.0, smoothstep(0.0, 0.6, vFacade.y));
          vec3 glass = vec3(0.12, 0.15, 0.2);
          diffuseColor.rgb = mix(diffuseColor.rgb, glass, win * 0.85);
          ${WINDOW_LIGHT}
        }
        `,
      )
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.72, 0.38) * winLit * 1.2;");
  };
  return mat;
}

function asphalt(g: CanvasRenderingContext2D, W: number, H: number, base: string) {
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < W * H * 0.06; i++) {
    const v = 38 + Math.random() * 40;
    g.fillStyle = `rgba(${v},${v},${v + 4},0.35)`;
    g.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  // patches and oil stains: Lagos roads are well worn
  for (let i = 0; i < 6; i++) {
    g.fillStyle = `rgba(20,20,22,${0.08 + Math.random() * 0.12})`;
    g.beginPath();
    g.ellipse(Math.random() * W, Math.random() * H, 6 + Math.random() * 22, 10 + Math.random() * 40, Math.random(), 0, Math.PI * 2);
    g.fill();
  }
}

/**
 * Asphalt with lane markings for a road style; u runs across the road (0 = right-hand edge,
 * 1 = left/median edge for one-way carriageways), v repeats every 12 m.
 */
export function roadTexture(kind: "major" | "minor" | "runway" | "taxi", style?: RoadStyle) {
  const W = 256;
  const H = 256;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  asphalt(g, W, H, kind === "runway" ? "#3d3f44" : kind === "taxi" ? "#47494d" : kind === "major" ? "#323438" : "#3b3c3f");
  const line = (u: number, color: string, wpx: number, dashed: boolean) => {
    g.fillStyle = color;
    if (dashed) g.fillRect(u * W - wpx / 2, 0, wpx, H * 0.5);
    else g.fillRect(u * W - wpx / 2, 0, wpx, H);
  };
  if (kind === "major" && style) {
    const lanes = Math.max(1, style.lanes);
    const brtFrac = style.brt ? 3.6 / (lanes * 3.4 + 1.2 + 3.6) : 0;
    const general = 1 - brtFrac;
    const edge = 0.6 / (lanes * 3.4 + 1.2 + (style.brt ? 3.6 : 0));
    if (style.oneway) {
      line(edge, "rgba(240,240,232,0.9)", 4, false); // kerb-side edge
      for (let k = 1; k < lanes; k++) line(edge + ((general - edge * 2) * k) / lanes, "rgba(240,240,232,0.85)", 4, true);
      if (style.brt) {
        // dedicated BRT lane on the median side: red surface, solid separator, BRT lettering
        g.fillStyle = "rgba(150,30,30,0.55)";
        g.fillRect(general * W, 0, brtFrac * W, H);
        line(general, "rgba(250,250,250,0.95)", 6, false);
        g.save();
        g.translate((general + brtFrac / 2) * W, H * 0.75);
        g.rotate(Math.PI);
        g.fillStyle = "rgba(255,255,255,0.9)";
        g.font = `bold ${Math.round(brtFrac * W * 0.42)}px sans-serif`;
        g.textAlign = "center";
        g.fillText("BRT", 0, 0);
        g.restore();
      }
      line(1 - edge, "rgba(240,190,60,0.95)", 5, false); // median edge
    } else {
      line(edge, "rgba(240,240,232,0.85)", 4, false);
      line(1 - edge, "rgba(240,240,232,0.85)", 4, false);
      line(0.5, "rgba(240,190,60,0.95)", 4, lanes < 3);
      if (lanes >= 4) {
        line(0.25, "rgba(240,240,232,0.8)", 3, true);
        line(0.75, "rgba(240,240,232,0.8)", 3, true);
      }
    }
  } else if (kind === "runway") {
    line(0.5, "rgba(245,245,245,0.9)", 6, true);
    line(0.02, "rgba(245,245,245,0.9)", 4, false);
    line(0.98, "rgba(245,245,245,0.9)", 4, false);
  } else if (kind === "taxi") {
    line(0.5, "rgba(240,200,60,0.9)", 4, false);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 1 / 12);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
