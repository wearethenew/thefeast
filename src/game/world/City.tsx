"use client";

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { MAJOR, nearestRoad, pointInPoly, type LagosWorld } from "./lagosData";
import { PARKING, PED_GATE, PLOT, plotPolygonWorld, toWorld } from "./compound";
import { getStreams, litTimeAt } from "./processionData";
import { FRONTAGE_PALETTE, FRONTAGE_STRIDE, buildFrontage } from "./frontage";

const PLOT_WORLD = plotPolygonWorld(5);
/** Open ground and trees around the compound, as in the renders: no infill blocks here. */
const GREEN_BELT = plotPolygonWorld(20);
/** The car park behind the compound, with a margin (world). */
const PARKING_WORLD: [number, number][] = [
  [PARKING.x0 - 9, PARKING.z0 - 4],
  [PARKING.x1 + 4, PARKING.z0 - 4],
  [PARKING.x1 + 4, PARKING.z1 + 4],
  [PARKING.x0 - 9, PARKING.z1 + 4],
].map(([x, z]) => {
  const w = toWorld(x, z);
  return [w.x, w.z] as [number, number];
});
import { buildAirfield, buildAreas, buildBuildings, buildRoads, buildingMaterial, cityLights, roadTexture, type RoadStyle } from "./cityGeometry";

// The static city: ground, roads, airfield, buildings, trees, street lights and Feast billboards.

function hash(n: number) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function Ground() {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d")!;
    g.fillStyle = "#6f6a4c";
    g.fillRect(0, 0, 256, 256);
    // patchy grass over red laterite earth
    for (let i = 0; i < 900; i++) {
      const green = Math.random() > 0.45;
      g.fillStyle = green ? `rgba(${70 + Math.random() * 30},${95 + Math.random() * 40},${45 + Math.random() * 20},0.5)` : `rgba(${150 + Math.random() * 40},${90 + Math.random() * 30},${60},0.35)`;
      g.beginPath();
      g.arc(Math.random() * 256, Math.random() * 256, 4 + Math.random() * 16, 0, Math.PI * 2);
      g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(400, 400);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  return (
    <mesh rotation-x={-Math.PI / 2} receiveShadow>
      <planeGeometry args={[16000, 16000]} />
      <meshStandardMaterial map={tex} roughness={1} />
    </mesh>
  );
}

function Roads({ world }: { world: LagosWorld }) {
  const geo = useMemo(() => buildRoads(world), [world]);
  const air = useMemo(() => buildAirfield(world), [world]);
  const mats = useMemo(() => {
    const mk = (kind: "major" | "minor" | "runway" | "taxi", style?: RoadStyle) =>
      new THREE.MeshStandardMaterial({ map: roadTexture(kind, style), roughness: 0.92, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    return {
      surfaces: geo.surfaces.map((s) => mk(s.style.major ? "major" : "minor", s.style)),
      runway: mk("runway"),
      taxi: mk("taxi"),
    };
  }, [geo]);
  return (
    <group>
      <mesh geometry={geo.kerb} receiveShadow>
        <meshStandardMaterial color="#9a958a" roughness={0.95} polygonOffset polygonOffsetFactor={-0.5} />
      </mesh>
      {geo.surfaces.map((s, i) => (
        <mesh key={s.style.key} geometry={s.geometry} material={mats.surfaces[i]} receiveShadow />
      ))}
      <mesh geometry={geo.barrier} castShadow receiveShadow>
        <meshStandardMaterial color="#c9c6be" roughness={0.9} />
      </mesh>
      <mesh geometry={air.aprons} receiveShadow>
        <meshStandardMaterial color="#8c8d8f" roughness={0.9} polygonOffset polygonOffsetFactor={-0.5} />
      </mesh>
      <mesh geometry={air.taxiway} material={mats.taxi} receiveShadow />
      <mesh geometry={air.runway} material={mats.runway} receiveShadow />
    </group>
  );
}

function Areas({ world }: { world: LagosWorld }) {
  const geo = useMemo(() => buildAreas(world), [world]);
  return (
    <group>
      <mesh geometry={geo.green} receiveShadow>
        <meshStandardMaterial color="#4f7a37" roughness={1} polygonOffset polygonOffsetFactor={-0.2} />
      </mesh>
      <mesh geometry={geo.built} receiveShadow>
        <meshStandardMaterial color="#7d7468" roughness={1} polygonOffset polygonOffsetFactor={-0.1} />
      </mesh>
    </group>
  );
}

const GATE = toWorld(PLOT.x0 - 2, (PED_GATE.z0 + PED_GATE.z1) / 2);
const processionStreams = (world: LagosWorld) => getStreams(world, [GATE.x, GATE.z]);

function Buildings({ world }: { world: LagosWorld }) {
  const geo = useMemo(() => {
    const streams = processionStreams(world);
    return buildBuildings(world, (x, z) => litTimeAt(streams, x, z));
  }, [world]);
  const mat = useMemo(buildingMaterial, []);
  return <mesh geometry={geo} material={mat} castShadow receiveShadow />;
}

function palmCrown() {
  const pos: number[] = [];
  const idx: number[] = [];
  const N = 8;
  const SEG = 6;
  for (let f = 0; f < N; f++) {
    const a = (f / N) * Math.PI * 2 + (f % 2) * 0.2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const base = pos.length / 3;
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG;
      const r = t * 3.2;
      const y = 8.1 + Math.sin(t * Math.PI * 0.75) * 0.9 - t * t * 2.2;
      const w = Math.sin(t * Math.PI) * 0.55 + 0.05;
      // leaf strip: two vertices across the frond's width
      pos.push(ca * r - sa * w, y, sa * r + ca * w, ca * r + sa * w, y - 0.05, sa * r - ca * w);
      if (i > 0) {
        const k = base + (i - 1) * 2;
        idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Trees and lamp posts placed along the roads, deterministic. */
function Roadside({ world }: { world: LagosWorld }) {
  const { trees, palms, lamps } = useMemo(() => {
    const trees: THREE.Matrix4[] = [];
    const palms: THREE.Matrix4[] = [];
    const lamps: THREE.Matrix4[] = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    let n = 0;
    for (const r of world.roads) {
      if (r.type === "service") continue;
      const major = MAJOR.has(r.type);
      for (let i = 1; i < r.pts.length; i++) {
        const [ax, az] = r.pts[i - 1];
        const [bx, bz] = r.pts[i];
        const len = Math.hypot(bx - ax, bz - az);
        const dx = (bx - ax) / len, dz = (bz - az) / len;
        const step = major ? 34 : 46;
        for (let t = step / 2; t < len; t += step) {
          n++;
          for (const side of [-1, 1]) {
            const off = r.width / 2 + 2.2;
            const x = ax + dx * t - dz * off * side;
            const z = az + dz * t + dx * off * side;
            const hv = hash(n * 2 + side);
            // keep the street in front of the Fusion Centre clear for the arrival shot
            if (pointInPoly(x, z, PLOT_WORLD) || pointInPoly(x, z, PARKING_WORLD)) continue;
            // never on a carriageway (dual roads, junctions and slip roads overlap each other)
            const near = nearestRoad(world, x, z);
            if (near.road && near.dist < near.road.width / 2 + 1.6) continue;
            if (major && side === 1 && n % 2 === 0) {
              q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(dx, dz) + (side > 0 ? Math.PI : 0));
              lamps.push(new THREE.Matrix4().compose(new THREE.Vector3(x - dz * 0.6, 0, z + dx * 0.6), q, new THREE.Vector3(1, 1, 1)));
            } else if (hv < 0.55) {
              const s = 0.75 + hash(n * 7 + side) * 0.6;
              const target = hv < 0.25 ? palms : trees;
              m.compose(new THREE.Vector3(x + (hv - 0.3) * 2, 0, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hv * 20), new THREE.Vector3(s, s, s));
              target.push(m.clone());
            }
          }
        }
      }
    }
    return { trees, palms, lamps };
  }, [world]);

  const geos = useMemo(() => {
    const trunk = new THREE.CylinderGeometry(0.18, 0.28, 4, 6);
    trunk.translate(0, 2, 0);
    const canopy = new THREE.IcosahedronGeometry(2.6, 1);
    canopy.scale(1, 0.75, 1);
    canopy.translate(0, 5, 0);
    const palmTrunk = new THREE.CylinderGeometry(0.16, 0.24, 8, 6);
    palmTrunk.translate(0, 4, 0);
    // drooping fronds: 8 bent leaf strips radiating from the crown
    const fronds = palmCrown();
    const pole = new THREE.CylinderGeometry(0.08, 0.12, 8, 6);
    pole.translate(0, 4, 0);
    const arm = new THREE.BoxGeometry(0.1, 0.1, 2.2);
    arm.translate(0, 7.9, 1.1);
    const head = new THREE.BoxGeometry(0.35, 0.12, 0.7);
    head.translate(0, 7.8, 2.1);
    return { trunk, canopy, palmTrunk, fronds, pole, arm, head };
  }, []);

  const inst = (geo: THREE.BufferGeometry, mats: THREE.Matrix4[], material: THREE.Material, shadow = true) => (
    <instancedMesh
      args={[geo, material, mats.length]}
      castShadow={shadow}
      receiveShadow
      ref={(im) => {
        if (!im) return;
        mats.forEach((mm, i) => im.setMatrixAt(i, mm));
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
      }}
    />
  );
  const M = useMemo(
    () => ({
      bark: new THREE.MeshStandardMaterial({ color: "#5b4632", roughness: 1 }),
      leaf: new THREE.MeshStandardMaterial({ color: "#3f6b2a", roughness: 0.9, flatShading: true }),
      frond: new THREE.MeshStandardMaterial({ color: "#4f7f2e", roughness: 0.9, side: THREE.DoubleSide, flatShading: true }),
      metal: new THREE.MeshStandardMaterial({ color: "#6b7078", roughness: 0.5, metalness: 0.6 }),
      lamp: new THREE.MeshStandardMaterial({ color: "#ffe2a8", emissive: "#ffcf80", emissiveIntensity: 3, toneMapped: false }),
    }),
    [],
  );
  return (
    <group>
      {inst(geos.trunk, trees, M.bark)}
      {inst(geos.canopy, trees, M.leaf)}
      {inst(geos.palmTrunk, palms, M.bark)}
      {inst(geos.fronds, palms, M.frond)}
      {inst(geos.pole, lamps, M.metal, false)}
      {inst(geos.arm, lamps, M.metal, false)}
      {inst(geos.head, lamps, M.lamp, false)}
    </group>
  );
}

export function City({ world }: { world: LagosWorld }) {
  return (
    <group>
      <Ground />
      <Areas world={world} />
      <Roads world={world} />
      <Buildings world={world} />
      <RoadFrontage world={world} />
      <Roadside world={world} />
    </group>
  );
}

/**
 * Low-detail blocks filling the rest of Ikeja so the city reads as dense from the plane and
 * from the far end of long streets. Kept off roads, real buildings and the airfield.
 */
export function DistantCity({ world }: { world: LagosWorld }) {
  const mats = useMemo(() => {
    const palette = ["#e8dcc4", "#d7c3a3", "#c9a27e", "#efe8dc", "#b9a58b", "#9a8f86", "#8a3d2a", "#7d8186"];
    const out: THREE.Matrix4[] = [];
    const colors: THREE.Color[] = [];
    const lit: number[] = [];
    const streams = processionStreams(world);
    const q = new THREE.Quaternion();
    // placed by scripts/build-world.mjs against every road in the extract, so none sit on a street
    for (const [x, z, w, d, h, c] of world.filler) {
      if (pointInPoly(x, z, GREEN_BELT)) continue;
      out.push(new THREE.Matrix4().compose(new THREE.Vector3(x, h / 2, z), q, new THREE.Vector3(w, h, d)));
      colors.push(new THREE.Color(palette[c % palette.length]));
      lit.push(litTimeAt(streams, x, z));
    }
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.setAttribute("litT", new THREE.InstancedBufferAttribute(new Float32Array(lit), 1));
    return { out, colors, geo, mat: fillerMaterial() };
  }, [world]);
  return (
    <instancedMesh
      args={[mats.geo, mats.mat, mats.out.length]}
      receiveShadow
      ref={(im) => {
        if (!im) return;
        mats.out.forEach((m, i) => {
          im.setMatrixAt(i, m);
          im.setColorAt(i, mats.colors[i]);
        });
        im.instanceMatrix.needsUpdate = true;
        im.instanceColor!.needsUpdate = true;
        im.computeBoundingSphere();
      }}
    />
  );
}

/** Filler blocks get floors of windows too, keyed to world position so they don't stretch. */
export function fillerMaterial() {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uProc = cityLights.uProc;
    shader.uniforms.uLitTime = cityLights.uTime;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float litT;\nvarying vec3 vWorld;\nvarying vec3 vWN;\nvarying float vLitT;\nvarying float vSeed;")
      .replace(
        "#include <worldpos_vertex>",
        `#include <worldpos_vertex>
        vec4 wp = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
        vWorld = wp.xyz;
        vWN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
        vLitT = litT;
        vSeed = fract(instanceMatrix[3].x * 0.137 + instanceMatrix[3].z * 0.071);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uProc;\nuniform float uLitTime;\nvarying vec3 vWorld;\nvarying vec3 vWN;\nvarying float vLitT;\nvarying float vSeed;\nfloat h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float winLit = 0.0;
        if (abs(vWN.y) < 0.5 && vWorld.y > 3.0) {
          float along = abs(vWN.x) > 0.5 ? vWorld.z : vWorld.x;
          vec2 cell = vec2(floor(along / 3.1), floor(vWorld.y / 3.3));
          vec2 f = vec2(fract(along / 3.1), fract(vWorld.y / 3.3));
          float win = step(0.32, f.x) * step(f.x, 0.68) * step(0.36, f.y) * step(f.y, 0.74);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12, 0.15, 0.2), win * 0.8);
          float lit = smoothstep(vLitT, vLitT + 1.6, uLitTime) * uProc;
          float share = mix(mix(0.85, 0.97, uProc), 0.35, lit);
          winLit = win * step(share, h21(cell + vSeed * 17.0)) * mix(1.0, 1.5, lit);
        }`,
      )
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.68, 0.34) * winLit * 0.9;");
  };
  return mat;
}

/**
 * Shop-houses and blocks shoulder to shoulder along the streets (see frontage.ts). They're worked
 * out in a background worker, so the page stays responsive, and appear as soon as they're ready.
 */
function RoadFrontage({ world }: { world: LagosWorld }) {
  const [boxes, setBoxes] = useState<Float32Array | null>(null);
  useEffect(() => {
    let worker: Worker | null = null;
    try {
      worker = new Worker(new URL("./cityWorker.ts", import.meta.url));
      worker.onmessage = (e: MessageEvent<Float32Array>) => setBoxes(e.data);
      worker.postMessage(null);
    } catch {
      // no workers: build it here
      setBoxes(buildFrontage(world));
    }
    return () => worker?.terminate();
  }, [world]);
  const data = useMemo(() => {
    if (!boxes) return null;
    const count = boxes.length / FRONTAGE_STRIDE;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const palette = FRONTAGE_PALETTE.map((c) => new THREE.Color(c));
    const lit = new Float32Array(count);
    const mats: THREE.Matrix4[] = [];
    const colors: THREE.Color[] = [];
    for (let i = 0; i < count; i++) {
      const o = i * FRONTAGE_STRIDE;
      const [x, z, w, h, d, rot, c, t] = boxes.subarray(o, o + FRONTAGE_STRIDE);
      mats.push(m.compose(pos.set(x, h / 2, z), q.setFromAxisAngle(up, rot), scale.set(w, h, d)).clone());
      colors.push(palette[c]);
      lit[i] = t;
    }
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.setAttribute("litT", new THREE.InstancedBufferAttribute(lit, 1));
    return { mats, colors, geo, mat: fillerMaterial() };
  }, [boxes]);
  if (!data) return null;
  return (
    <instancedMesh
      args={[data.geo, data.mat, data.mats.length]}
      receiveShadow
      ref={(im) => {
        if (!im) return;
        data.mats.forEach((mm, i) => {
          im.setMatrixAt(i, mm);
          im.setColorAt(i, data.colors[i]);
        });
        im.instanceMatrix.needsUpdate = true;
        im.instanceColor!.needsUpdate = true;
        im.computeBoundingSphere();
      }}
    />
  );
}
