"use client";

import { useGLTF } from "@react-three/drei";
import { useFrame, type ThreeElements } from "@react-three/fiber";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { AVATARS, animFile, type AnimName, type Sex } from "../data/avatars";
import { withKTX2 } from "./ktx2";

/** The clips every avatar loads; others (cheer, run, clap) load only for an avatar that plays them. */
const CORE_ANIMS: AnimName[] = ["idle", "walk", "sit", "wave"];

/**
 * At the start: only your own avatar (and the clips, which are small), never the whole cast at
 * once: unpacking every person together is what a phone can't take while the city loads. The
 * crowd's people load one at a time as they're baked (see CrowdBaker, and preloadAvatar).
 */
export function preloadAvatars(yours: string) {
  const me = AVATARS.find((a) => a.id === yours) ?? AVATARS[0];
  preloadAvatar(me.file);
  for (const sex of ["f", "m"] as Sex[]) for (const n of CORE_ANIMS) useGLTF.preload(animFile(sex, n));
}
/** One avatar's model, fetched ahead of when it's needed. */
export const preloadAvatar = (file: string) => useGLTF.preload(file, true, true, withKTX2);

/** Loads all clips for one sex, renamed to their AnimName and made in-place (no root drift). */
function useClips(sex: Sex, extra?: AnimName) {
  const wantExtra = extra && !CORE_ANIMS.includes(extra) ? extra : null;
  const ANIMS = useMemo(() => (wantExtra ? [...CORE_ANIMS, wantExtra] : CORE_ANIMS), [wantExtra]);
  const files = ANIMS.map((n) => animFile(sex, n));
  const gltfs = useGLTF(files) as unknown as { animations: THREE.AnimationClip[] }[];
  return useMemo(() => {
    const clips = new Map<AnimName, THREE.AnimationClip>();
    gltfs.forEach((g, i) => {
      const clip = g.animations[0].clone();
      clip.name = ANIMS[i];
      // (the clips carry markers the avatars' skeletons don't have: they only ever warned)
      clip.tracks = clip.tracks.filter((t) => !/^(Bip01_Footsteps|MotionExtractionHelper)\./.test(t.name));
      for (const track of clip.tracks) {
        // Rocketbox walk/run clips carry root motion on Bip01; pin it so movement is driven by gameplay.
        if (track.name === "Bip01.position") {
          const v = track.values;
          const x0 = v[0], z0 = v[2];
          for (let k = 0; k < v.length; k += 3) {
            v[k] = x0;
            v[k + 2] = z0;
          }
        }
      }
      clips.set(ANIMS[i], clip);
    });
    return clips;
  }, [gltfs, ANIMS]);
}

export type AvatarRig = { scene: THREE.Object3D; skinned: THREE.SkinnedMesh; meshes: THREE.SkinnedMesh[]; bones: Map<string, THREE.Bone> };

export type AvatarHandle = {
  root: THREE.Group;
  play: (name: AnimName, fade?: number) => void;
  bone: (name: string) => THREE.Bone | undefined;
  /** Length of a clip in seconds (0 if missing). */
  duration: (name: AnimName) => number;
  /** Pose exactly at time t of the current clip, overrides (IK, grip) included: for baking crowds. */
  seek: (t: number) => void;
};

type Props = ThreeElements["group"] & {
  avatarId: string;
  anim?: AnimName;
  skin?: string;
  /** Called once the cloned rig exists, e.g. to attach a robe or torch to bones. */
  onRig?: (rig: AvatarRig) => void;
  timeScale?: number;
  /** Runs every frame right after the animation mixer, for IK / pose overrides. */
  afterAnimate?: (dt: number) => void;
};

export const Avatar = forwardRef<AvatarHandle, Props>(function Avatar(
  { avatarId, anim = "idle", skin = "#ffffff", onRig, timeScale = 1, afterAnimate, ...group },
  ref,
) {
  const def = AVATARS.find((a) => a.id === avatarId) ?? AVATARS[0];
  const gltf = useGLTF(def.file, true, true, withKTX2);
  const clips = useClips(def.sex, anim);
  const groupRef = useRef<THREE.Group>(null!);

  const rig = useMemo(() => {
    const scene = cloneSkinned(gltf.scene) as THREE.Object3D;
    const bones = new Map<string, THREE.Bone>();
    // GLTFLoader splits multi-material meshes into one SkinnedMesh per primitive (body, head, hair cards).
    const meshes: THREE.SkinnedMesh[] = [];
    scene.traverse((o) => {
      if ((o as THREE.Bone).isBone) bones.set(o.name, o as THREE.Bone);
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) {
        const m = o as THREE.SkinnedMesh;
        meshes.push(m);
        m.castShadow = true;
        m.receiveShadow = true;
        m.frustumCulled = false;
        // Each clone gets its own materials so skin tint is per-character.
        const mats = (Array.isArray(m.material) ? m.material : [m.material]).map((mm) => (mm as THREE.MeshStandardMaterial).clone());
        m.material = mats.length === 1 ? mats[0] : mats;
      }
    });
    // Snapshot the standing rest pose (the bind pose of these rigs is Z-up, so skeleton.pose() would lay them flat).
    scene.userData.rest = [...bones.values()].map((b) => [b, b.position.clone(), b.quaternion.clone(), b.scale.clone()]);
    const skinned = meshes.find((m) => /_body$/.test((m.material as THREE.Material).name)) ?? meshes[0];
    return { scene, skinned, meshes, bones };
  }, [gltf.scene]);

  // Skin tone: tint head + hands (body material), not the eyelash/hair cards.
  useEffect(() => {
    for (const mesh of rig.meshes) {
      const m = mesh.material as THREE.MeshStandardMaterial;
      if (/_head$|_body$/.test(m.name)) m.color.set(skin);
    }
  }, [rig, skin]);

  const mixer = useMemo(() => new THREE.AnimationMixer(rig.scene), [rig]);
  const current = useRef<THREE.AnimationAction | null>(null);

  const play = (name: AnimName, fade = 0.35) => {
    const clip = clips.get(name);
    if (!clip) return;
    const next = mixer.clipAction(clip);
    if (current.current === next) return;
    next.reset().setEffectiveWeight(1).fadeIn(fade).play();
    current.current?.fadeOut(fade);
    current.current = next;
  };

  useEffect(() => {
    play(anim);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anim, mixer]);

  useEffect(() => {
    onRig?.(rig);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rig]);

  const afterRef = useRef(afterAnimate);
  afterRef.current = afterAnimate;
  useImperativeHandle(
    ref,
    () => ({
      root: groupRef.current,
      play,
      bone: (n) => rig.bones.get(n),
      duration: (n) => clips.get(n)?.duration ?? 0,
      seek: (t) => {
        const a = current.current;
        if (!a) return;
        mixer.stopAllAction();
        a.reset().setEffectiveWeight(1).play();
        a.time = t;
        mixer.update(0);
        // settle the per-frame overrides (they ease toward their targets)
        for (let i = 0; i < 3; i++) afterRef.current?.(0.5);
      },
    }),
    [rig, clips, mixer],
  );

  useFrame((_, dt) => {
    mixer.update(Math.min(dt, 0.05) * timeScale);
    afterAnimate?.(dt);
  });

  return (
    <group ref={groupRef} {...group}>
      <primitive object={rig.scene} />
    </group>
  );
});
