"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { fillerMaterial } from "./City";
import { Palm } from "./FusionCentre";
import { GROUPS, resample, streamAt, type Stream } from "./processionData";

// Where each The New campus is filmed in the opening: a small set for the actual place (Victoria
// Island's glass towers by the lagoon, Yaba's busy market street, Ikeja's flyover, Ibadan's hill
// of brown roofs, Ife's green hills, Akure's granite domes), its own route, and its own drone move.
// Sets sit far out from the Lagos map, so only one is drawn at a time.

export type DroneMove = (u: number, st: Stream, out: { pos: THREE.Vector3; look: THREE.Vector3 }) => void;
export type CampusSetDef = {
  id: string;
  origin: [number, number];
  path: [number, number][];
  half: number;
  seconds: number;
  /** Where along the route the green direction sign hangs (the ministers' board is further on). */
  sign: number;
  /** The half of the road the walkers keep to (the traffic has the other): the camera's side. */
  walk: 1 | -1;
  drone: DroneMove;
};

const rnd = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const P = { x: 0, z: 0, dx: 0, dz: 1, half: 4 };

/** Sample a stream and add an offset: along (+ahead), across (+left of travel), up. */
function at(st: Stream, s: number, ahead: number, left: number, up: number, out: THREE.Vector3) {
  streamAt(st, s, P);
  return out.set(P.x + P.dx * ahead - P.dz * left, up, P.z + P.dz * ahead + P.dx * left);
}

export const CAMPUS_SETS: CampusSetDef[] = [
  {
    // Victoria Island: high on the lagoon side, tracking along the boulevard, towers beyond
    id: "island",
    walk: -1,
    sign: 175,
    origin: [30000, 0],
    path: [[-260, 0], [-80, 6], [80, -4], [260, 8]],
    half: 9,
    seconds: 3.2,
    drone: (u, st, o) => {
      at(st, 90 + u * 9, 0, -70, 34, o.pos);
      at(st, 120 + u * 9, 0, 10, 4, o.look);
    },
  },
  {
    // Yaba: street level behind the crowd, the green sign and the footbridge down the street
    id: "yaba",
    walk: 1,
    sign: 205,
    origin: [33000, 0],
    path: [[-220, 0], [-60, 0], [60, 12], [220, 16]],
    half: 7,
    seconds: 3.2,
    drone: (u, st, o) => {
      at(st, 100 + u * 4, -12, 1.5, 6.5, o.pos);
      at(st, 100 + u * 4, 30, 0, 3, o.look);
    },
  },
  {
    // Ibadan: a wide aerial descending over the hill of brown roofs to the winding road
    id: "ibadan",
    walk: 1,
    sign: 205,
    origin: [39000, 0],
    path: [[-220, 60], [-120, 20], [-30, 40], [60, 0], [160, 30], [240, 0]],
    half: 6,
    seconds: 3.4,
    drone: (u, st, o) => {
      at(st, 120 + u * 6, -110 + u * 12, 70, 120 - u * 13, o.pos);
      at(st, 140 + u * 6, 0, 0, 0, o.look);
    },
  },
  {
    // Ife: high and steep over the tree-lined road, one slow drift forward and across, the green
    // sign over the road ahead in frame all the way
    id: "ife",
    walk: 1,
    sign: 150,
    origin: [42000, 0],
    path: [[-200, -40], [-60, 0], [60, 10], [200, 50]],
    half: 6,
    seconds: 3.2,
    drone: (u, st, o) => {
      at(st, 100 + u * 4, 0, 16 - u * 3.5, 52 - u * 2.5, o.pos);
      at(st, 138 + u * 4, 0, 0, 2, o.look);
    },
  },
  {
    // Akure: a low orbit round the crowd with the granite domes behind
    id: "akure",
    walk: 1,
    sign: 175,
    origin: [45000, 0],
    path: [[-220, 20], [-80, -10], [60, 10], [220, -20]],
    half: 6,
    seconds: 3.2,
    drone: (u, st, o) => {
      const a = 2.4 + u * 0.32;
      at(st, 120 + u * 2.5, Math.cos(a) * 38, Math.sin(a) * 38, 14, o.pos);
      at(st, 120 + u * 2.5, 0, 0, 2, o.look);
    },
  },
];

/** The crowd's route through a campus set, in world coordinates. */
export function campusStream(def: CampusSetDef): Stream {
  const g = GROUPS.find((x) => x.id === def.id)!;
  const pts = def.path.map(([x, z]) => [def.origin[0] + x, def.origin[1] + z] as [number, number]);
  return resample(pts, pts.map(() => def.half), g);
}

// ---------- building blocks ----------

function groundTexture(base: string, specks: string[], n = 900) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < n; i++) {
    g.fillStyle = specks[i % specks.length];
    g.globalAlpha = 0.25 + rnd(i) * 0.35;
    g.beginPath();
    g.arc(rnd(i + 0.1) * 256, rnd(i + 0.2) * 256, 3 + rnd(i + 0.3) * 14, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(60, 60);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function Ground({ origin, base, specks }: { origin: [number, number]; base: string; specks: string[] }) {
  // (keyed on the colours, not the array: callers pass a fresh array every render)
  const key = specks.join();
  const tex = useMemo(() => groundTexture(base, key.split(",")), [base, key]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh rotation-x={-Math.PI / 2} position={[origin[0], -0.02, origin[1]]} receiveShadow>
      <planeGeometry args={[2400, 2400]} />
      <meshStandardMaterial map={tex} roughness={1} />
    </mesh>
  );
}

function roadTex(lines: "dash" | "double" | "none") {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#3b3d40";
  g.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(${90 + rnd(i) * 40},${90 + rnd(i) * 40},${90 + rnd(i) * 40},0.35)`;
    g.fillRect(rnd(i + 0.1) * 128, rnd(i + 0.2) * 256, 2, 2);
  }
  g.fillStyle = "#e9e3c8";
  if (lines === "dash") for (let y = 0; y < 256; y += 64) g.fillRect(62, y, 4, 32);
  if (lines === "double") {
    g.fillStyle = "#e8c23a";
    g.fillRect(58, 0, 4, 256);
    g.fillRect(66, 0, 4, 256);
  }
  g.fillStyle = "#d8d4c4";
  g.fillRect(4, 0, 3, 256);
  g.fillRect(121, 0, 3, 256);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The road along the route (with a kerb-high footpath either side). */
function Road({ st, lines = "dash", path = "#a9a49a", y = 0 }: { st: Stream; lines?: "dash" | "double" | "none"; path?: string; y?: number }) {
  const { road, walk, tex } = useMemo(() => {
    const strip = (inner: number, outer: number, yy: number) => {
      const pos: number[] = [];
      const uv: number[] = [];
      const idx: number[] = [];
      let rows = 0;
      for (let i = 0; i <= st.length; i += 2, rows++) {
        const nx = -st.dz[i], nz = st.dx[i];
        for (const k of [-1, 1]) {
          const w = inner === 0 ? outer * k : 0;
          if (inner === 0) pos.push(st.x[i] + nx * w, yy, st.z[i] + nz * w);
          else pos.push(st.x[i] + nx * (k < 0 ? -outer : inner), yy, st.z[i] + nz * (k < 0 ? -outer : inner));
          uv.push(k < 0 ? 0 : 1, i / 16);
        }
      }
      for (let r = 0; r < rows - 1; r++) idx.push(r * 2, r * 2 + 2, r * 2 + 1, r * 2 + 1, r * 2 + 2, r * 2 + 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      return geo;
    };
    const h = st.half[0];
    // footpaths: two strips just outside the carriageway
    const side = (k: number) => {
      const pos: number[] = [];
      const idx: number[] = [];
      let rows = 0;
      for (let i = 0; i <= st.length; i += 2, rows++) {
        const nx = -st.dz[i], nz = st.dx[i];
        for (const d of [h, h + 3]) pos.push(st.x[i] + nx * d * k, y + 0.15, st.z[i] + nz * d * k);
      }
      for (let r = 0; r < rows - 1; r++) idx.push(r * 2, r * 2 + 2, r * 2 + 1, r * 2 + 1, r * 2 + 2, r * 2 + 3);
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    };
    return { road: strip(0, h, y + 0.03), walk: [side(1), side(-1)], tex: roadTex(lines) };
  }, [st, lines, y]);
  return (
    <>
      <mesh geometry={road} receiveShadow>
        <meshStandardMaterial map={tex} roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
      {walk.map((g, i) => (
        <mesh key={i} geometry={g} receiveShadow>
          <meshStandardMaterial color={path} roughness={0.95} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </>
  );
}

type Block = { x: number; z: number; w: number; d: number; h: number; rot: number; color: string; y?: number };

/** Buildings as lit-window blocks (the city's own facade shader). */
function Blocks({ list }: { list: Block[] }) {
  const { geo, mat, mats, cols } = useMemo(() => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.setAttribute("litT", new THREE.InstancedBufferAttribute(new Float32Array(list.length), 1));
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    return {
      geo,
      mat: fillerMaterial(),
      mats: list.map((b) => new THREE.Matrix4().compose(new THREE.Vector3(b.x, (b.y ?? 0) + b.h / 2, b.z), q.setFromAxisAngle(up, b.rot), new THREE.Vector3(b.w, b.h, b.d))),
      cols: list.map((b) => new THREE.Color(b.color)),
    };
  }, [list]);
  return (
    <instancedMesh
      args={[geo, mat, list.length]}
      castShadow
      receiveShadow
      ref={(im) => {
        if (!im) return;
        mats.forEach((m, i) => {
          im.setMatrixAt(i, m);
          im.setColorAt(i, cols[i]);
        });
        im.instanceMatrix.needsUpdate = true;
        im.instanceColor!.needsUpdate = true;
        im.computeBoundingSphere();
      }}
    />
  );
}

/** Line both sides of a route with buildings, set back from the footpath. */
function frontage(st: Stream, opts: { gap: number; set: number; w: [number, number]; d: [number, number]; h: [number, number]; palette: string[]; seed: number; skip?: (s: number, side: number) => boolean; y?: (x: number, z: number) => number }) {
  const out: Block[] = [];
  let k = opts.seed;
  for (const side of [-1, 1])
    for (let s = 4; s < st.length - 4; k++) {
      const w = opts.w[0] + rnd(k) * (opts.w[1] - opts.w[0]);
      const d = opts.d[0] + rnd(k + 0.2) * (opts.d[1] - opts.d[0]);
      const h = opts.h[0] + Math.pow(rnd(k + 0.4), 1.5) * (opts.h[1] - opts.h[0]);
      streamAt(st, s + w / 2, P);
      if (!opts.skip?.(s, side)) {
        const off = st.half[Math.floor(s)] + 3 + opts.set + d / 2;
        const x = P.x - P.dz * off * side, z = P.z + P.dx * off * side;
        out.push({ x, z, w, d, h, rot: Math.atan2(P.dx, P.dz), color: opts.palette[Math.floor(rnd(k + 0.6) * opts.palette.length)], y: opts.y?.(x, z) });
      }
      s += w + opts.gap + rnd(k + 0.8) * opts.gap;
    }
  return out;
}

function Trees({ points, crown = "#2f5f24", scale = 1 }: { points: [number, number, number?][]; crown?: string; scale?: number }) {
  const { trunk, leaf, mats } = useMemo(() => {
    const q = new THREE.Quaternion();
    return {
      trunk: new THREE.CylinderGeometry(0.25, 0.35, 5, 6).translate(0, 2.5, 0),
      leaf: new THREE.IcosahedronGeometry(3.6, 1).scale(1, 0.85, 1).translate(0, 6.6, 0),
      mats: points.map(([x, z, y], i) => {
        const s = (0.75 + rnd(i) * 0.6) * scale;
        return new THREE.Matrix4().compose(new THREE.Vector3(x, y ?? 0, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd(i + 0.3) * 6), new THREE.Vector3(s, s, s));
      }),
    };
  }, [points, scale]);
  const fill = (im: THREE.InstancedMesh | null) => {
    if (!im) return;
    mats.forEach((m, i) => im.setMatrixAt(i, m));
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
  };
  return (
    <>
      <instancedMesh args={[trunk, undefined, mats.length]} ref={fill} castShadow>
        <meshStandardMaterial color="#4f3d2c" roughness={1} />
      </instancedMesh>
      <instancedMesh args={[leaf, undefined, mats.length]} ref={fill} castShadow>
        <meshStandardMaterial color={crown} roughness={0.9} flatShading />
      </instancedMesh>
    </>
  );
}

/** Points along both sides of a route (for trees, palms, stalls). */
function alongside(st: Stream, every: number, off: number, seed: number, jitter = 1.5): [number, number][] {
  const out: [number, number][] = [];
  let k = seed;
  for (const side of [-1, 1])
    for (let s = 6; s < st.length - 6; s += every, k++) {
      streamAt(st, s + (rnd(k) - 0.5) * every * 0.4, P);
      const o = st.half[Math.floor(s)] + off + (rnd(k + 0.5) - 0.5) * jitter;
      out.push([P.x - P.dz * o * side, P.z + P.dx * o * side]);
    }
  return out;
}

// ---------- the six places ----------

function Island({ st, o }: { st: Stream; o: [number, number] }) {
  const towers = useMemo(() => {
    const glass = ["#3f6f9a", "#2c5878", "#4b86a6", "#5c7d8f", "#39627f"];
    // the tower side (right of travel) is all glass high-rise; the lagoon is on the left
    return frontage(st, { gap: 8, set: 10, w: [18, 34], d: [18, 30], h: [40, 140], palette: glass, seed: 11, skip: (_s, side) => side < 0 });
  }, [st]);
  const palms = useMemo(() => alongside(st, 18, -st.half[0] + 0.4, 21, 0.2).filter((_, i) => i % 2 === 0), [st]);
  return (
    <>
      <Ground origin={o} base="#6c7a5a" specks={["#7d8a62", "#5c6b4a", "#8a8a70"]} />
      {/* the lagoon along the left of the boulevard */}
      <mesh rotation-x={-Math.PI / 2} position={[o[0], 0.05, o[1] - 160]}>
        <planeGeometry args={[2400, 260]} />
        <meshStandardMaterial color="#1c4b6e" roughness={0.12} metalness={0.3} />
      </mesh>
      <Road st={st} lines="double" />
      <Blocks list={towers} />
      {palms.map(([x, z], i) => (
        <Palm key={i} x={x} z={z} h={11 + rnd(i) * 3} />
      ))}
    </>
  );
}

function Yaba({ st, o }: { st: Stream; o: [number, number] }) {
  const blocks = useMemo(() => frontage(st, { gap: 0.6, set: 2.5, w: [7, 13], d: [9, 14], h: [8, 22], palette: ["#d9b98a", "#c97d55", "#e2d3a8", "#9fb3c0", "#d7a95b", "#b8564a", "#efe4cf"], seed: 31 }), [st]);
  const stalls = useMemo(() => alongside(st, 5, 1.3, 41, 0.3), [st]);
  const canopy = ["#e8336d", "#2c8ff0", "#ffc62a", "#26b5a6", "#ff7a2f", "#7ac943"];
  // beyond the green sign and the ministers' board (sign + 70), so it never hides them
  streamAt(st, 300, P);
  const bridge = { x: P.x, z: P.z, rot: Math.atan2(P.dx, P.dz) };
  return (
    <>
      <Ground origin={o} base="#7a6a58" specks={["#8d7a63", "#6b5c4c", "#9a8770"]} />
      <Road st={st} lines="dash" />
      <Blocks list={blocks} />
      {/* market stalls with bright canopies along both footpaths */}
      {stalls.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position-y={2.3}>
            <boxGeometry args={[2.4, 0.12, 2.2]} />
            <meshStandardMaterial color={canopy[i % canopy.length]} roughness={0.7} />
          </mesh>
          <mesh position-y={0.5}>
            <boxGeometry args={[1.8, 1, 1.2]} />
            <meshStandardMaterial color="#8a6a48" roughness={0.9} />
          </mesh>
        </group>
      ))}
      {/* the pedestrian footbridge across the road */}
      <group position={[bridge.x, 0, bridge.z]} rotation-y={bridge.rot}>
        <mesh position={[0, 7, 0]} castShadow>
          <boxGeometry args={[st.half[0] * 2 + 14, 0.6, 3]} />
          <meshStandardMaterial color="#9aa0a6" roughness={0.6} />
        </mesh>
        {[-1, 1].map((k) => (
          <mesh key={k} position={[k * (st.half[0] + 5), 3.5, 0]}>
            <boxGeometry args={[1.2, 7, 1.2]} />
            <meshStandardMaterial color="#7d8186" />
          </mesh>
        ))}
        <mesh position={[0, 8.1, 0]}>
          <boxGeometry args={[st.half[0] * 2 + 14, 1.2, 0.1]} />
          <meshStandardMaterial color="#1a4fa0" />
        </mesh>
      </group>
    </>
  );
}

function Ikeja({ st, o }: { st: Stream; o: [number, number] }) {
  const blocks = useMemo(() => frontage(st, { gap: 1.5, set: 4, w: [10, 18], d: [12, 18], h: [10, 34], palette: ["#e8dcc4", "#c9a27e", "#9fb8c9", "#e3d27a", "#d7c3a3", "#7d8186"], seed: 51 }), [st]);
  streamAt(st, 180, P);
  // the flyover crossing over the avenue
  const fx = P.x, fz = P.z, rot = Math.atan2(P.dx, P.dz) + Math.PI / 2;
  return (
    <>
      <Ground origin={o} base="#6f6a4c" specks={["#7f7a58", "#5f5a40", "#8b6a4a"]} />
      <Road st={st} lines="dash" />
      <Blocks list={blocks} />
      <group position={[fx, 0, fz]} rotation-y={rot}>
        <mesh position={[0, 8, 0]} castShadow receiveShadow>
          <boxGeometry args={[220, 1.4, 16]} />
          <meshStandardMaterial color="#9a9890" roughness={0.85} />
        </mesh>
        {[-90, -45, 45, 90].map((x) => (
          <mesh key={x} position={[x, 3.6, 0]} castShadow>
            <boxGeometry args={[2.2, 7.2, 5]} />
            <meshStandardMaterial color="#8c8a82" roughness={0.9} />
          </mesh>
        ))}
        {[-1, 1].map((k) => (
          <mesh key={k} position={[0, 9.1, k * 7.8]}>
            <boxGeometry args={[220, 0.9, 0.4]} />
            <meshStandardMaterial color="#c9c6bb" />
          </mesh>
        ))}
      </group>
    </>
  );
}

/** Ibadan's hill: the city climbs it, roofs rusted brown. */
const HILL = { x: 40, z: 330, r: 240, h: 62 };
const ibadanHill = (o: [number, number]) => (x: number, z: number) => {
  const d = Math.hypot(x - o[0] - HILL.x, z - o[1] - HILL.z) / HILL.r;
  return d >= 1 ? 0 : HILL.h * Math.sqrt(1 - d * d) - 2;
};

function Ibadan({ st, o }: { st: Stream; o: [number, number] }) {
  const hill = useMemo(() => ibadanHill(o), [o]);
  const houses = useMemo(() => {
    const out: Block[] = [];
    for (let i = 0; i < 900; i++) {
      const x = o[0] + (rnd(i) - 0.5) * 700, z = o[1] + 40 + rnd(i + 0.3) * 520;
      // keep the road clear
      let near = Infinity;
      for (let s = 0; s <= st.length; s += 8) near = Math.min(near, Math.hypot(st.x[s] - x, st.z[s] - z));
      if (near < st.half[0] + 6) continue;
      const w = 6 + rnd(i + 0.5) * 6;
      out.push({ x, z, w, d: w * (0.8 + rnd(i + 0.7) * 0.4), h: 3.5 + rnd(i + 0.9) * 4, rot: rnd(i + 1.1) * 0.6, color: ["#d8c7a5", "#cdb48c", "#e0d2b6"][i % 3], y: hill(x, z) });
    }
    return out;
  }, [st, o, hill]);
  const roofs = useMemo(() => {
    const geo = new THREE.ConeGeometry(0.75, 0.5, 4, 1).rotateY(Math.PI / 4);
    const q = new THREE.Quaternion();
    return {
      geo,
      mats: houses.map((b) => new THREE.Matrix4().compose(new THREE.Vector3(b.x, (b.y ?? 0) + b.h + b.w * 0.18, b.z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.rot), new THREE.Vector3(b.w, b.w * 0.75, b.d))),
    };
  }, [houses]);
  return (
    <>
      <Ground origin={o} base="#7a5a3c" specks={["#8c6a48", "#6a4c30", "#5f6a3c"]} />
      {/* the hill itself */}
      <mesh position={[o[0] + HILL.x, -2, o[1] + HILL.z]} scale={[HILL.r, HILL.h, HILL.r]}>
        <sphereGeometry args={[1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#7d5c3e" roughness={1} />
      </mesh>
      <Road st={st} lines="none" path="#9a7a58" />
      <Blocks list={houses} />
      <instancedMesh
        args={[roofs.geo, undefined, roofs.mats.length]}
        castShadow
        ref={(im) => {
          if (!im) return;
          roofs.mats.forEach((m, i) => im.setMatrixAt(i, m));
          im.instanceMatrix.needsUpdate = true;
          im.computeBoundingSphere();
        }}
      >
        <meshStandardMaterial color="#8a4a26" roughness={0.85} metalness={0.25} />
      </instancedMesh>
      {/* Cocoa House on the skyline */}
      <group position={[o[0] + 90, hill(o[0] + 90, o[1] + 330), o[1] + 330]}>
        <mesh position-y={52} castShadow>
          <boxGeometry args={[18, 104, 18]} />
          <meshStandardMaterial color="#e9e6dc" roughness={0.6} />
        </mesh>
        <mesh position-y={108}>
          <boxGeometry args={[10, 8, 10]} />
          <meshStandardMaterial color="#c8c2b0" />
        </mesh>
      </group>
    </>
  );
}

function Ife({ st, o }: { st: Stream; o: [number, number] }) {
  const trees = useMemo(() => alongside(st, 7, 3.5, 61, 2).concat(alongside(st, 9, 12, 71, 6)), [st]);
  const halls = useMemo(() => frontage(st, { gap: 30, set: 26, w: [20, 34], d: [12, 18], h: [6, 12], palette: ["#f2efe6", "#ece6d6"], seed: 81 }), [st]);
  const roofs = useMemo(() => halls.map((b) => ({ ...b, y: b.h, h: 1.4, w: b.w + 1.2, d: b.d + 1.2, color: "#a6402b" })), [halls]);
  return (
    <>
      <Ground origin={o} base="#4f6b34" specks={["#5f7d3c", "#41592a", "#6b8a44"]} />
      {/* rolling green hills around */}
      {[
        [-420, 360, 220, 70],
        [380, 420, 260, 90],
        [-120, -520, 300, 80],
        [520, -300, 200, 60],
      ].map(([x, z, r, h], i) => (
        <mesh key={i} position={[o[0] + x, -2, o[1] + z]} scale={[r, h, r]}>
          <sphereGeometry args={[1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#3f5f2c" roughness={1} />
        </mesh>
      ))}
      <Road st={st} lines="dash" path="#b5a888" />
      <Blocks list={halls} />
      <Blocks list={roofs} />
      <Trees points={trees} crown="#2f6a2a" />
    </>
  );
}

function Akure({ st, o }: { st: Stream; o: [number, number] }) {
  const houses = useMemo(() => frontage(st, { gap: 5, set: 6, w: [7, 12], d: [7, 11], h: [3.5, 7], palette: ["#e6d6b8", "#d9c39c", "#cfb48a"], seed: 91 }), [st]);
  const roofs = useMemo(() => houses.map((b) => ({ ...b, y: b.h, h: 0.8, w: b.w + 0.8, d: b.d + 0.8, color: "#8a4a26" })), [houses]);
  const palms = useMemo(() => alongside(st, 26, 4, 101, 3), [st]);
  return (
    <>
      <Ground origin={o} base="#9a5a36" specks={["#a86a42", "#87502e", "#6d6a3a"]} />
      {/* the granite domes */}
      {[
        [-260, 260, 120, 110],
        [-60, 330, 90, 140],
        [180, 280, 140, 95],
        [420, 380, 110, 120],
        [-480, -240, 130, 90],
      ].map(([x, z, r, h], i) => (
        <mesh key={i} position={[o[0] + x, -4, o[1] + z]} scale={[r, h, r * 0.85]} castShadow>
          <sphereGeometry args={[1, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={["#8f8a82", "#9b968c", "#86817a"][i % 3]} roughness={0.95} />
        </mesh>
      ))}
      <Road st={st} lines="none" path="#a8724a" />
      <Blocks list={houses} />
      <Blocks list={roofs} />
      {palms.map(([x, z], i) => (
        <Palm key={i} x={x} z={z} h={10 + rnd(i) * 4} />
      ))}
    </>
  );
}

const SETS: Record<string, (p: { st: Stream; o: [number, number] }) => React.ReactElement> = { island: Island, yaba: Yaba, ikeja: Ikeja, ibadan: Ibadan, ife: Ife, akure: Akure };

/** The set for one campus (only the one on screen is mounted). */
export function CampusSet({ id, st }: { id: string; st: Stream }) {
  const def = CAMPUS_SETS.find((d) => d.id === id);
  const Set = SETS[id];
  if (!def || !Set) return null;
  return <Set st={st} o={def.origin} />;
}
