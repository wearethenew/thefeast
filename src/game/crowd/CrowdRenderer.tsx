"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { FOOT_Y } from "../world/compound";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { AVATARS } from "../data/avatars";
import { CORE_MODELS, STANDING_AVATARS, getModel, useCrowdProgress, type CrowdAnim } from "./CrowdBaker";
import { flameMaterial, lookMaterial, vatClock, vatDepthMaterial, vatMaterial, type Baked } from "./vat";

/** One person in a crowd. The renderer reads these every frame. */
export type Agent = {
  x: number;
  z: number;
  /** Facing (radians, like Object3D.rotation.y). */
  h: number;
  /** Avatar index (see data/avatars). */
  avatar: number;
  robe?: 0 | 1;
  anim: CrowdAnim;
  /** Where in the cycle (0–1) and cycles per second. */
  phase: number;
  rate: number;
  /** Height above the ground (gallery seats). */
  y?: number;
  hidden?: boolean;
  /** false: empty-handed (still queueing for a torch). Only the standing people have this look. */
  torch?: boolean;
};

type LodSet = {
  matrix: THREE.InstancedBufferAttribute;
  /** Skin tone per person (rgb). */
  tone: THREE.InstancedBufferAttribute;
  /** Phase, rate, outfit hue shift, outfit lightness. */
  anim: THREE.InstancedBufferAttribute;
  meshes: THREE.InstancedMesh[];
  count: number;
};
type Group = { lods: LodSet[] };

/** Skin tones of Lagos, light to deep. */
const TONES = ["#c48b62", "#a8714c", "#8d5a3b", "#7a4c33", "#6a4029", "#5c3823"].map((c) => new THREE.Color(c));

function buildGroup(b: Baked, cap: number, shadows: boolean, parent: THREE.Object3D, bare = false): Group {
  const depth = vatDepthMaterial(b);
  const lods: LodSet[] = [0, 1].map((lod) => {
    const matrix = new THREE.InstancedBufferAttribute(new Float32Array(cap * 16), 16);
    const tone = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(0.6), 3);
    const anim = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    for (const a of [matrix, tone, anim]) a.setUsage(THREE.DynamicDrawUsage);
    const meshes: THREE.InstancedMesh[] = [];
    for (const part of b.parts) {
      if (bare && part.kind === "torch") continue;
      const src = part.lods[lod];
      const g = new THREE.BufferGeometry();
      for (const [name, attr] of Object.entries(src.attributes)) g.setAttribute(name, attr);
      g.setIndex(src.index);
      g.setAttribute("aAnim", anim);
      g.setAttribute("aTone", tone);
      let mat = vatMaterial(part.material.clone(), b);
      if (part.kind === "skin") mat = lookMaterial(mat, /_head$/.test(part.material.name));
      const m = new THREE.InstancedMesh(g, mat, cap);
      m.instanceMatrix = matrix;
      m.frustumCulled = false;
      m.castShadow = shadows && lod === 0;
      m.receiveShadow = lod === 0;
      if (m.castShadow) m.customDepthMaterial = depth;
      m.count = 0;
      parent.add(m);
      meshes.push(m);
    }
    if (b.anchor >= 0 && !bare) {
      const g = new THREE.PlaneGeometry(1, 1);
      g.setAttribute("aAnim", anim);
      const m = new THREE.InstancedMesh(g, flameMaterial(b), cap);
      m.instanceMatrix = matrix;
      m.frustumCulled = false;
      m.renderOrder = 5;
      m.count = 0;
      parent.add(m);
      meshes.push(m);
    }
    return { matrix, tone, anim, meshes, count: 0 };
  });
  return { lods };
}

/** Most people drawn with the detailed mesh in one frame (keeps the GPU well within budget). */
const MAX_DETAILED = 220;
const _frustum = new THREE.Frustum();
const _pm = new THREE.Matrix4();
const _sphere = new THREE.Sphere(new THREE.Vector3(), 1.3);

/**
 * Draws a crowd of real, animated people from a list of agents that the caller updates each frame.
 * Near people get the detailed mesh (and shadows), far ones a lighter one; anyone off screen is skipped.
 */
export function CrowdRenderer({ agents, capacity = 400, near = 14, shadows = true }: { agents: React.MutableRefObject<Agent[]>; capacity?: number; near?: number; shadows?: boolean }) {
  const progress = useCrowdProgress();
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const root = useMemo(() => new THREE.Group(), []);
  // groups are added as their people finish baking (never rebuilt: rebuilding would make the
  // whole crowd vanish while its shaders recompiled), and all torn down together on unmount
  const groupsRef = useRef<Map<string, Group> | null>(null);
  /** Groups built and still compiling. */
  const pending = useRef(new Set<string>());
  useEffect(() => {
    const out = new Map<string, Group>();
    groupsRef.current = out;
    pending.current = new Set();
    return () => {
      groupsRef.current = null;
      root.traverse((o) => {
        const m = o as THREE.InstancedMesh;
        if (m.isInstancedMesh) m.geometry.dispose();
      });
      root.clear();
    };
  }, [capacity, shadows, root]);
  useEffect(() => {
    const out = groupsRef.current;
    if (!out || progress < CORE_MODELS) return;
    // this batch of new groups goes on its own node, compiled in the background before showing
    const batch = new THREE.Group();
    const fresh: [string, Group][] = [];
    const add = (key: string, b: ReturnType<typeof getModel>, bare = false) => {
      if (!b || out.has(key) || pending.current.has(key)) return;
      pending.current.add(key);
      fresh.push([key, buildGroup(b, capacity, shadows, batch, bare)]);
    };
    AVATARS.forEach((_, a) => (["walk", "sit", "idle", "wave"] as CrowdAnim[]).forEach((anim) => add(`${a}:${anim}`, getModel(a, anim))));
    // the people queueing for their torch: standing and shuffling forward empty-handed
    for (const a of STANDING_AVATARS) for (const anim of ["walk", "idle"] as CrowdAnim[]) add(`${a}:${anim}:bare`, getModel(a, anim), true);
    if (!fresh.length) return;
    batch.traverse((o) => o.layers.set(31));
    root.add(batch);
    gl.compileAsync(batch, camera, scene)
      .catch(() => {})
      .then(() => {
        if (groupsRef.current !== out) return;
        batch.traverse((o) => o.layers.set(0));
        for (const [k, g] of fresh) out.set(k, g);
      });
  }, [progress, capacity, shadows, root, gl, camera, scene]);

  useFrame((_, dt) => {
    vatClock.value += Math.min(dt, 0.1);
    const groups = groupsRef.current;
    if (!groups) return;
    for (const g of groups.values()) for (const l of g.lods) l.count = 0;
    _frustum.setFromProjectionMatrix(_pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const cx = camera.position.x, cz = camera.position.z;
    const near2 = near * near;
    let detailed = 0;
    for (const a of agents.current) {
      if (a.hidden) continue;
      _sphere.center.set(a.x, (a.y ?? 0) + 0.9, a.z);
      // standing on the surface (laid just above y = 0), not sunk into it
      const y = (a.y ?? 0) + FOOT_Y;
      if (!_frustum.intersectsSphere(_sphere)) continue;
      const g = groups.get(a.torch === false ? `${a.avatar}:${a.anim}:bare` : `${a.avatar}:${a.anim}`) ?? groups.get(`${a.avatar}:${a.anim}`);
      if (!g) continue;
      // full detail (and shadows) only close up, and only for so many people at once
      const lod = (a.x - cx) ** 2 + (a.z - cz) ** 2 < near2 && detailed < MAX_DETAILED ? g.lods[0] : g.lods[1];
      if (lod === g.lods[0]) detailed++;
      if (lod.count >= capacity) continue;
      const i = lod.count++;
      const c = Math.cos(a.h), s = Math.sin(a.h);
      lod.matrix.array.set([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, a.x, y, a.z, 1], i * 16);
      // each person's own outfit colours and skin tone, steady for them (keyed on their phase)
      lod.anim.array.set([a.phase, a.rate, (a.phase * 13.37) % 1, (a.phase * 7.77) % 1], i * 4);
      const t = TONES[Math.floor(((a.phase * 3.31) % 1) * TONES.length)];
      lod.tone.array.set([t.r, t.g, t.b], i * 3);
    }
    for (const g of groups.values())
      for (const l of g.lods) {
        for (const m of l.meshes) {
          m.count = l.count;
          m.visible = l.count > 0;
        }
        if (l.count) {
          l.matrix.clearUpdateRanges();
          l.matrix.addUpdateRange(0, l.count * 16);
          l.matrix.needsUpdate = true;
          l.anim.needsUpdate = true;
          l.tone.needsUpdate = true;
        }
      }
  });
  return <primitive object={root} />;
}

/** Cycles per second for someone walking at `speed` m/s (the clips are recorded at about 1.25 m/s). */
export function walkRate(avatar: number, speed: number) {
  const d = getModel(avatar, "walk")?.duration ?? 1.1;
  return speed / 1.25 / d;
}
export function sitRate(avatar: number) {
  return 1 / (getModel(avatar, "sit")?.duration ?? 8);
}
/** Natural speed for a looping clip (idle, wave…). */
export function clipRate(avatar: number, anim: CrowdAnim) {
  return 1 / (getModel(avatar, anim)?.duration ?? 4);
}
