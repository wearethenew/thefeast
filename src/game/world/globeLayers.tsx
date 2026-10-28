"use client";

import { useTexture } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { CITIES, SWNG, UK_MAP } from "../data/cities";
import { GLOBE_R, latLonToVec } from "./geo";

// Detail that appears as you zoom into the globe: a real map under the gold dots, a high-detail
// south-west Nigeria map with its highways, clouds you descend through, city lights and labels.

/** Altitude of the camera above the globe surface, in globe units (R = 100 ≈ 6371 km). */
export function useAltitude() {
  const camera = useThree((s) => s.camera);
  return () => camera.position.length() - GLOBE_R;
}

export const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Sphere patch between lat/lon bounds with equirectangular UVs (u = lon, v = lat). */
function latLonPatch(box: { lon0: number; lon1: number; lat0: number; lat1: number }, r: number, segLon: number, segLat: number) {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const v = new THREE.Vector3();
  for (let j = 0; j <= segLat; j++) {
    const lat = box.lat1 - ((box.lat1 - box.lat0) * j) / segLat;
    for (let i = 0; i <= segLon; i++) {
      const lon = box.lon0 + ((box.lon1 - box.lon0) * i) / segLon;
      latLonToVec(lat, lon, r, v);
      pos.push(v.x, v.y, v.z);
      uv.push(i / segLon, 1 - j / segLat);
    }
  }
  for (let j = 0; j < segLat; j++)
    for (let i = 0; i < segLon; i++) {
      const a = j * (segLon + 1) + i;
      const b = a + segLon + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** The country map that takes over from the gold dots as you zoom in. */
export function MapSkin({ onFade }: { onFade?: (t: number) => void }) {
  const [world, swng, uk] = useTexture(["/globe/world.png", "/globe/swng.png", "/globe/uk.png"]);
  for (const t of [world, swng, uk]) {
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 16;
  }
  const geo = useMemo(() => latLonPatch({ lon0: -180, lon1: 180, lat0: -90, lat1: 90 }, GLOBE_R * 1.0004, 256, 128), []);
  const regions = useMemo(
    () =>
      [
        { box: SWNG, tex: swng },
        { box: UK_MAP, tex: uk },
      ].map(({ box, tex }) => ({
        geo: latLonPatch(box, GLOBE_R * 1.0006, 64, 48),
        mat: new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
      })),
    [swng, uk],
  );
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: world, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }), [world]);
  const alt = useAltitude();
  useFrame(() => {
    const a = alt();
    const t = smooth(GLOBE_R * 1.1, GLOBE_R * 0.3, a);
    mat.opacity = t;
    for (const r of regions) r.mat.opacity = smooth(GLOBE_R * 0.16, GLOBE_R * 0.05, a);
    onFade?.(t);
  });
  return (
    <>
      <mesh geometry={geo} material={mat} renderOrder={1} />
      {regions.map((r, i) => (
        <mesh key={i} geometry={r.geo} material={r.mat} renderOrder={2} />
      ))}
    </>
  );
}

function cloudTexture() {
  const W = 1024;
  const H = 512;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const img = g.createImageData(W, H);
  // seamless: sample 3-D value noise on the sphere itself
  const hash = (x: number, y: number, z: number) => {
    const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const noise = (x: number, y: number, z: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    const l = (a: number, b: number, t: number) => a + (b - a) * t;
    return l(
      l(l(hash(xi, yi, zi), hash(xi + 1, yi, zi), u), l(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), u), v),
      l(l(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), u), l(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), u), v),
      w,
    );
  };
  for (let j = 0; j < H; j++) {
    const lat = Math.PI / 2 - (j / H) * Math.PI;
    for (let i = 0; i < W; i++) {
      const lon = (i / W) * Math.PI * 2;
      const x = Math.cos(lat) * Math.cos(lon), y = Math.sin(lat), z = Math.cos(lat) * Math.sin(lon);
      let n = 0, amp = 0.5, f = 2.2;
      for (let o = 0; o < 5; o++) {
        n += amp * noise(x * f + 11, y * f + 7, z * f + 3);
        f *= 2.1;
        amp *= 0.5;
      }
      const a = Math.max(0, Math.min(1, (n - 0.5) * 3.2));
      const k = (j * W + i) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
      img.data[k + 3] = a * 235;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A cloud deck you fly down through when zooming in to a city. */
export function Clouds() {
  const tex = useMemo(cloudTexture, []);
  const geo = useMemo(() => latLonPatch({ lon0: -180, lon1: 180, lat0: -90, lat1: 90 }, GLOBE_R * 1.012, 128, 64), []);
  const mat = useMemo(() => new THREE.MeshLambertMaterial({ map: tex, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }), [tex]);
  const ref = useRef<THREE.Mesh>(null);
  const alt = useAltitude();
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.004;
    const a = alt();
    // faint from space, thickest just above the deck, gone once you're through it
    const deck = GLOBE_R * 0.012;
    mat.opacity = (0.3 + 0.4 * smooth(GLOBE_R * 0.6, GLOBE_R * 0.05, a)) * smooth(deck * 1.05, deck * 2.2, a);
    if (ref.current) ref.current.visible = a > deck * 1.05;
  });
  return <mesh ref={ref} geometry={geo} material={mat} renderOrder={3} />;
}

/** Warm city lights that bloom in as you get closer. */
export function CityLights() {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const p: number[] = [];
    const s: number[] = [];
    const v = new THREE.Vector3();
    for (const c of CITIES) {
      latLonToVec(c.lat, c.lon, GLOBE_R * 1.0008, v);
      p.push(v.x, v.y, v.z);
      s.push(c.tier === 1 ? 1.6 : c.tier === 2 ? 1.1 : 0.8);
    }
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute("size", new THREE.Float32BufferAttribute(s, 1));
    return g;
  }, []);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uAmount: { value: 0 } },
        vertexShader: /* glsl */ `
          attribute float size; varying float vFacing;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vFacing = dot(normalize(normalMatrix * normalize(position)), normalize(-mv.xyz));
            gl_PointSize = size * 26.0;
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uAmount; varying float vFacing;
          void main() {
            vec2 c = gl_PointCoord - 0.5;
            float d = length(c);
            float glow = exp(-d * 9.0) + 0.6 * exp(-d * 30.0);
            gl_FragColor = vec4(vec3(1.0, 0.75, 0.38) * glow * 1.6, glow * uAmount * step(0.0, vFacing));
          }
        `,
      }),
    [],
  );
  const alt = useAltitude();
  useFrame(() => {
    mat.uniforms.uAmount.value = 0.35 + 0.65 * smooth(GLOBE_R * 1.2, GLOBE_R * 0.2, alt());
  });
  return <points geometry={geo} material={mat} renderOrder={4} />;
}

export type GlobeLabel = {
  id: string;
  lat: number;
  lon: number;
  text: string;
  kind: "feast" | "origin" | "campus" | "city";
  tier?: 1 | 2 | 3;
  active?: boolean;
  onClick?: () => void;
};

const PRIORITY = { feast: 0, origin: 1, campus: 2, city: 3 } as const;

/**
 * HTML labels pinned to the globe. Hidden on the far side, shown by zoom level (city tiers),
 * and decluttered so they never pile on top of each other.
 */
export function LabelLayer({ labels }: { labels: GlobeLabel[] }) {
  const { gl, camera, size } = useThree();
  const host = useMemo(() => {
    const d = document.createElement("div");
    d.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:2";
    return d;
  }, []);
  const els = useRef(new Map<string, HTMLElement>());
  const alt = useAltitude();

  useEffect(() => {
    const parent = gl.domElement.parentElement!;
    parent.appendChild(host);
    return () => void host.remove();
  }, [gl, host]);

  useEffect(() => {
    const map = els.current;
    const keep = new Set(labels.map((l) => l.id));
    for (const [id, el] of map) {
      if (keep.has(id)) continue;
      el.remove();
      map.delete(id);
    }
    for (const l of labels) {
      let el = map.get(l.id);
      if (!el) {
        el = document.createElement(l.onClick ? "button" : "div");
        host.appendChild(el);
        map.set(l.id, el);
      }
      el.textContent = l.text;
      el.onclick = l.onClick ?? null;
      const base = "position:absolute;left:0;top:0;white-space:nowrap;border-radius:999px;font-family:var(--font-display);will-change:transform;";
      const style =
        l.kind === "feast"
          ? "background:#ff7a1a;color:#fff;font-weight:900;font-size:11px;letter-spacing:.08em;padding:4px 10px;box-shadow:0 0 18px rgba(255,120,30,.8);text-transform:uppercase;"
          : l.kind === "campus" || l.kind === "origin"
            ? `background:${l.active ? "#f2b544" : "rgba(0,0,0,.6)"};color:${l.active ? "#111" : "#fff"};font-weight:700;font-size:11px;padding:3px 9px;pointer-events:auto;cursor:pointer;border:1px solid rgba(242,181,68,.5);`
            : "color:rgba(255,236,200,.92);font-size:10px;font-weight:600;padding:1px 4px;text-shadow:0 1px 4px rgba(0,0,0,.9);";
      el.style.cssText = base + style;
    }
  }, [labels, host]);

  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  useFrame(() => {
    const a = alt();
    const camDir = camera.position.clone();
    const placed: [number, number, number, number][] = [];
    const sorted = [...labels].sort((x, y) => PRIORITY[x.kind] - PRIORITY[y.kind] + (x.active ? -1 : 0) - (y.active ? -1 : 0) + ((x.tier ?? 0) - (y.tier ?? 0)) * 0.1);
    for (const l of sorted) {
      const el = els.current.get(l.id);
      if (!el) continue;
      latLonToVec(l.lat, l.lon, GLOBE_R * 1.001, v);
      n.copy(v).normalize();
      const facing = n.dot(camDir.clone().sub(v).normalize());
      const tierOk = l.kind !== "city" || l.tier === 1 || (l.tier === 2 && a < GLOBE_R * 0.45) || (l.tier === 3 && a < GLOBE_R * 0.07);
      let show = facing > 0.08 && tierOk;
      let x = 0, y = 0, w = 0, h = 0;
      if (show) {
        v.project(camera);
        x = (v.x * 0.5 + 0.5) * size.width;
        y = (-v.y * 0.5 + 0.5) * size.height;
        w = el.offsetWidth || l.text.length * 7 + 18;
        h = el.offsetHeight || 20;
        // labels sit above their point (pins have a stem)
        const yOff = l.kind === "city" ? 10 : 26;
        x -= w / 2;
        y -= h + yOff;
        if (x < -w || x > size.width || y < -h || y > size.height) show = false;
        else if (placed.some(([px, py, pw, ph]) => x < px + pw + 4 && x + w + 4 > px && y < py + ph + 2 && y + h + 2 > py)) show = false;
      }
      if (show) {
        placed.push([x, y, w, h]);
        el.style.display = "block";
        el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      } else el.style.display = "none";
    }
  });
  return null;
}
