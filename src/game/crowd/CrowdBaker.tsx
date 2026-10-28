"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useRef, useState, useSyncExternalStore } from "react";
import * as THREE from "three";
import type { AvatarHandle } from "../avatar/Avatar";
import { Character } from "../avatar/Character";
import { AVATARS } from "../data/avatars";
import { PLAYER_AVATARS } from "../store";
import { bakeSteps, simplifierReady, type Baked } from "./vat";

// Bakes every avatar's walk (torch in hand), sitting and standing poses for some, once, in the
// background while the opening film plays. Everyday clothes, no robes. Each Character is mounted out of sight, posed through its clip, baked, unmounted.

export type CrowdAnim = "walk" | "sit" | "idle" | "wave";
/** Everyone walks; a mix of casual and corporate people also sit, and some stand at the desks. */
export const WALK_AVATARS = AVATARS.map((_, i) => i);
export const SIT_AVATARS = [0, 3, 6, 8, 10, 12];
export const STANDING_AVATARS = [1, 4, 7, 11];
const JOBS = [
  ...WALK_AVATARS.map((i) => ({ avatar: AVATARS[i], i, anim: "walk" as CrowdAnim })),
  ...SIT_AVATARS.map((i) => ({ avatar: AVATARS[i], i, anim: "sit" as CrowdAnim })),
  ...STANDING_AVATARS.flatMap((i) => (["idle", "wave"] as CrowdAnim[]).map((anim) => ({ avatar: AVATARS[i], i, anim }))),
];
// everyone in the hall is registered, so the seated hold their torches too
const TORCH: Record<CrowdAnim, boolean> = { walk: true, sit: true, idle: true, wave: false };
const models = new Map<string, Baked>();
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const modelKey = (avatar: number, anim: CrowdAnim) => `${avatar}:${anim}`;
export const getModel = (avatar: number, anim: CrowdAnim) => models.get(modelKey(avatar, anim));
/** Number of baked models; everything is ready at CROWD_MODELS. */
export const useCrowdProgress = () => useSyncExternalStore(subscribe, () => models.size, () => 0);
export const CROWD_MODELS = JOBS.length;
/** Walk and sit for every avatar: enough to draw the crowd (standing poses join when baked). */
export const CORE_MODELS = WALK_AVATARS.length + SIT_AVATARS.length;

/**
 * Once a texture is on the GPU the page's own copy of it (a decoded image, or the baked animation's
 * float array) is only kept in case it has to be sent again, which it never is: let it go. Phones
 * close a tab that holds on to all of them (hundreds of MB for the whole crowd). The picture is
 * the same; it's the copy in memory that goes.
 */
function dropPageCopy(t: THREE.Texture, unused = false) {
  const img = t.image as { close?: () => void; data?: unknown; width: number; height: number; getContext?: unknown } | null;
  // (`unused`: never sent to the GPU, and never will be)
  if (!img || (t.version === 0 && !unused)) return;
  // (anything that asks for its size later gets the size it had)
  const size = { width: img.width, height: img.height };
  if (typeof img.close === "function") img.close();
  else if (typeof img.getContext === "function") img.width = img.height = 0;
  else if (!("data" in img)) return;
  t.image = size;
}

/**
 * Phones and tablets: the crowd wears half-size copies of each person's clothes and skin (512 px
 * rather than 1024). On a phone's screen nobody in the crowd is ever drawn bigger than that, so it
 * looks the same, at a quarter of the graphics memory that would otherwise run the phone out.
 * Your own avatar keeps the full size, and computers keep it for everyone.
 */
const TOUCH = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
const halved = new Map<THREE.Texture, THREE.Texture>();
function forCrowd(t: THREE.Texture | null) {
  const img = t?.image as { width: number; height: number } | undefined;
  if (!t || !TOUCH || !img || img.width <= 512) return t;
  let s = halved.get(t);
  if (s) return s;
  const c = document.createElement("canvas");
  c.width = img.width / 2;
  c.height = img.height / 2;
  const g = c.getContext("2d")!;
  g.imageSmoothingQuality = "high";
  g.drawImage(img as CanvasImageSource, 0, 0, c.width, c.height);
  s = new THREE.Texture(c);
  s.colorSpace = t.colorSpace;
  s.flipY = t.flipY;
  s.wrapS = t.wrapS;
  s.wrapT = t.wrapT;
  s.magFilter = t.magFilter;
  s.minFilter = t.minFilter;
  s.anisotropy = t.anisotropy;
  s.needsUpdate = true;
  halved.set(t, s);
  return s;
}
/** The last bake that uses each avatar (after it, a phone can let that avatar's full-size images go). */
const LAST_JOB = new Map<number, number>();

export function CrowdBaker() {
  const [job, setJob] = useState(0);
  const [ready, setReady] = useState(false);
  const root = useRef<THREE.Group>(null);
  const handle = useRef<AvatarHandle>(null);
  const settled = useRef(0);
  const running = useRef<Generator<void, Baked> | null>(null);
  // textures of baked people go up to the GPU one a frame, so the crowd's first frame doesn't stall
  const uploads = useRef<THREE.Texture[]>([]);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    simplifierReady().then(() => setReady(true));
  }, []);
  useFrame(() => {
    const next = uploads.current.shift();
    if (next) {
      gl.initTexture(next);
      dropPageCopy(next);
    }
    const J = JOBS[job];
    if (!J || !ready || !root.current || !handle.current) return;
    if (models.has(modelKey(J.i, J.anim))) return setJob(job + 1);
    // wait until the avatar is in (and, for torch-bearers, the torch is in hand)
    let robe = false;
    let flame = false;
    root.current.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) robe = true;
      if ((o as THREE.Mesh).isMesh && ((o as THREE.Mesh).material as THREE.ShaderMaterial).isShaderMaterial) flame = true;
    });
    if (!robe || (TORCH[J.anim] && !flame)) return;
    if (!running.current) {
      if (++settled.current < 2) return;
      settled.current = 0;
      running.current = bakeSteps(root.current, handle.current, J.anim, J.anim === "walk" ? 24 : 18);
    }
    // a slice of each frame for baking: generous while the crowd isn't drawable yet (the jets are
    // a light scene, and the film waits on it), a few milliseconds once it is
    const t0 = performance.now();
    const budget = models.size < CORE_MODELS ? 10 : 4;
    let r = running.current.next();
    while (!r.done && performance.now() - t0 < budget) r = running.current.next();
    if (!r.done) return;
    running.current = null;
    models.set(modelKey(J.i, J.anim), r.value);
    const originals = new Set<THREE.Texture>();
    for (const part of r.value.parts) {
      const m = part.material as THREE.MeshStandardMaterial;
      if (m.map) originals.add(m.map);
      if (m.normalMap) originals.add(m.normalMap);
      // (each person's material is their own copy: swapping its images touches nobody else)
      if (part.kind !== "torch") {
        m.map = forCrowd(m.map);
        m.normalMap = forCrowd(m.normalMap);
      }
      for (const t of [m.map, m.normalMap]) if (t && !uploads.current.includes(t)) uploads.current.push(t);
    }
    // on a phone, once this avatar's last bake is done its full-size images are only needed if
    // it's one you can play as
    if (!LAST_JOB.size) JOBS.forEach((x, k) => LAST_JOB.set(x.i, k));
    const playable = (Object.values(PLAYER_AVATARS) as string[]).includes(J.avatar.id);
    if (TOUCH && !playable && LAST_JOB.get(J.i) === job)
      for (const t of originals) if (halved.has(t)) dropPageCopy(t, true);
    // and the animation itself (big float textures): up now, not on the crowd's first frame
    uploads.current.push(r.value.pos, r.value.nrm);
    listeners.forEach((l) => l());
    setJob(job + 1);
  });
  const J = JOBS[job];
  if (!J) return null;
  return (
    <group ref={root} position={[0, -400, 0]} visible={false}>
      {/* its own boundary: a person still loading must never hide the scene that's on screen */}
      <Suspense fallback={null}>
        <Character key={job} ref={handle} avatarId={J.avatar.id} robe={false} anim={J.anim} torch={TORCH[J.anim] ? "lit" : "none"} torchLight={false} />
      </Suspense>
    </group>
  );
}
