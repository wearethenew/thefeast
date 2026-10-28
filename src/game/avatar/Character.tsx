"use client";

import type { ThreeElements } from "@react-three/fiber";
import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ROBES, type AnimName } from "../data/avatars";
import { Torch } from "../fx/Torch";
import { Avatar, type AvatarHandle, type AvatarRig as Rig } from "./Avatar";
import { dressInRobe } from "./robe";

// A Feast attendee: avatar + fitted TORCH robe + a lit torch held up in the right hand.

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _t = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qw = new THREE.Quaternion();
const _qp = new THREE.Quaternion();

/** CCD IK: rotates `chain` (root → tip parent) so that `effector` reaches `target` (world space). */
function solveCCD(chain: THREE.Bone[], effector: THREE.Object3D, target: THREE.Vector3, iterations = 6, weight = 1) {
  for (let it = 0; it < iterations; it++) {
    for (let i = chain.length - 1; i >= 0; i--) {
      const bone = chain[i];
      bone.updateMatrixWorld(true);
      const bonePos = _t.setFromMatrixPosition(bone.matrixWorld);
      const eff = _a.setFromMatrixPosition(effector.matrixWorld).sub(bonePos).normalize();
      const tgt = _b.copy(target).sub(bonePos).normalize();
      const angle = eff.angleTo(tgt);
      if (angle < 1e-4) continue;
      _q.setFromUnitVectors(eff, tgt);
      if (weight < 1) _q.slerp(_qp.identity(), 1 - weight);
      // apply world-space rotation delta in the bone's parent frame
      bone.getWorldQuaternion(_qw);
      const parentQ = bone.parent ? bone.parent.getWorldQuaternion(_qp.clone()) : new THREE.Quaternion();
      const newWorld = _q.clone().multiply(_qw);
      bone.quaternion.copy(parentQ.invert().multiply(newWorld));
      bone.updateMatrixWorld(true);
    }
  }
}

export type CharacterProps = Omit<ThreeElements["group"], "ref"> & {
  avatarId: string;
  robeId?: string;
  /** Wear the Feast robe over the avatar's own clothes (off: everyday outfits). */
  robe?: boolean;
  skin?: string;
  hoodUp?: boolean;
  anim?: AnimName;
  torch?: "none" | "unlit" | "lit";
  /** Raise the torch overhead (e.g. cheering). Otherwise it is carried in front of the chest. */
  raiseTorch?: boolean;
  torchLight?: boolean;
  torchShadows?: boolean;
  timeScale?: number;
};

const FINGER_CHAINS = [
  ["Bip01_R_Finger1", "Bip01_R_Finger11", "Bip01_R_Finger12"],
  ["Bip01_R_Finger2", "Bip01_R_Finger21", "Bip01_R_Finger22"],
  ["Bip01_R_Finger3", "Bip01_R_Finger31", "Bip01_R_Finger32"],
  ["Bip01_R_Finger4", "Bip01_R_Finger41", "Bip01_R_Finger42"],
];
const THUMB = ["Bip01_R_Finger0", "Bip01_R_Finger01", "Bip01_R_Finger02"];
const CURL = [1.25, 1.35, 0.9];
const THUMB_CURL = [0.25, 0.45, 0.45];
const _z = new THREE.Vector3(0, 0, 1);
const _x = new THREE.Vector3(1, 0, 0);

/**
 * Pose overrides must start from the animated pose every frame. Some clips don't key every bone
 * (walk leaves several fingers unkeyed), and then the mixer never resets them, so overrides would
 * pile up frame after frame and the hand jitters. If a bone still holds exactly what we wrote last
 * frame, put back what it had before we touched it.
 */
function beginOverride(b: THREE.Object3D) {
  const u = b.userData as { ovIn?: THREE.Quaternion; ovOut?: THREE.Quaternion };
  if (u.ovOut && b.quaternion.equals(u.ovOut)) b.quaternion.copy(u.ovIn!);
  (u.ovIn ??= new THREE.Quaternion()).copy(b.quaternion);
}
function endOverride(b: THREE.Object3D) {
  const u = b.userData as { ovOut?: THREE.Quaternion };
  (u.ovOut ??= new THREE.Quaternion()).copy(b.quaternion);
}

/** Rotates a bone by a world-space rotation. */
function rotateWorld(bone: THREE.Object3D, q: THREE.Quaternion) {
  const world = bone.getWorldQuaternion(new THREE.Quaternion());
  const parentQ = bone.parent ? bone.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
  bone.quaternion.copy(parentQ.invert().multiply(q.clone().multiply(world)));
  bone.updateMatrixWorld(true);
}

function boneTip(chain: THREE.Bone[]) {
  const a = chain[chain.length - 2].getWorldPosition(new THREE.Vector3());
  const b = chain[chain.length - 1].getWorldPosition(new THREE.Vector3());
  return b.clone().add(b.clone().sub(a).multiplyScalar(0.9));
}

/**
 * Makes the right hand hold a torch along `axis` (world): turns the wrist so the fist's grip
 * channel (hand local +Z, thumb side up) lies along the torch with the fingers wrapping toward
 * `across`, curls fingers and thumb around it, and returns the centre of the fist.
 */
function gripHand(r: Rig, hand: THREE.Bone, axis: THREE.Vector3, across: THREE.Vector3) {
  // 1. wrist: grip channel along the torch, fingers pointing across the body
  hand.updateMatrixWorld(true);
  const hq = hand.getWorldQuaternion(new THREE.Quaternion());
  rotateWorld(hand, new THREE.Quaternion().setFromUnitVectors(_z.clone().applyQuaternion(hq), axis));
  const hq2 = hand.getWorldQuaternion(new THREE.Quaternion());
  const fingersNow = _x.clone().applyQuaternion(hq2).projectOnPlane(axis).normalize();
  const want = across.clone().projectOnPlane(axis).normalize();
  if (fingersNow.lengthSq() > 0 && want.lengthSq() > 0) {
    const ang = Math.atan2(fingersNow.clone().cross(want).dot(axis), fingersNow.dot(want));
    rotateWorld(hand, new THREE.Quaternion().setFromAxisAngle(axis, ang));
  }
  const handPos = hand.getWorldPosition(new THREE.Vector3());
  const fingerDir = _x.clone().applyQuaternion(hand.getWorldQuaternion(new THREE.Quaternion()));
  const palm = handPos.clone().addScaledVector(fingerDir, 0.085);

  // 2. fingers + thumb: curl each chain about its local Z. On these Biped rigs a positive turn bends
  //    toward the palm (measured from the rest pose on every avatar), so the direction is fixed.
  const chains = [...FINGER_CHAINS.map((c) => ({ names: c, curl: CURL })), { names: THUMB, curl: THUMB_CURL }];
  for (const { names, curl } of chains) {
    const bones = names.map((n) => r.bones.get(n)).filter(Boolean) as THREE.Bone[];
    bones.forEach((b, i) => {
      b.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(_z, curl[i]));
      b.updateMatrixWorld(true);
    });
  }

  // 3. the fist's hollow: between the palm and the curled middle finger
  const mid = FINGER_CHAINS[1].map((n) => r.bones.get(n)).filter(Boolean) as THREE.Bone[];
  if (mid.length < 3) return palm;
  const tip = boneTip(mid);
  const toTip = tip.sub(palm).projectOnPlane(axis);
  return palm.clone().addScaledVector(toTip, 0.5);
}

export const Character = forwardRef<AvatarHandle, CharacterProps>(function Character(
  { avatarId, robeId = "royal", robe: wearRobe = true, skin, hoodUp = false, anim = "idle", torch = "lit", raiseTorch = false, torchLight = true, torchShadows = false, timeScale, ...group },
  ref,
) {
  const robe = ROBES.find((r) => r.id === robeId) ?? ROBES[0];
  const rig = useRef<Rig | null>(null);
  const torchRef = useRef<THREE.Group>(null);
  const robeMeshes = useRef<THREE.SkinnedMesh[]>([]);
  const [ready, setReady] = useState(false);
  const target = useRef(new THREE.Vector3());
  const raise = useRef(0);
  const torchInit = useRef(false);

  const onRig = useCallback((r: Rig) => {
    rig.current = r;
    if (process.env.NODE_ENV !== "production") ((window as unknown as { __rigs?: Rig[] }).__rigs ??= []).push(r);
    setReady(true);
  }, []);

  // (Re)dress whenever the robe colour or hood changes; the fitted geometry is cached per avatar.
  useEffect(() => {
    const r = rig.current;
    if (!r || !ready) return;
    for (const m of robeMeshes.current) m.removeFromParent();
    robeMeshes.current = wearRobe ? dressInRobe(avatarId, r.meshes, r.skinned, r.scene, robe, hoodUp) : [];
  }, [robe, hoodUp, ready, avatarId, wearRobe]);

  const afterAnimate = useCallback(
    (dt: number) => {
      const r = rig.current;
      if (!r) return;
      // keep the free (left) arm swinging clear of the robe instead of through it
      const lUpper = r.bones.get("Bip01_L_UpperArm");
      if (lUpper && anim !== "sit") {
        beginOverride(lUpper);
        r.scene.updateMatrixWorld(true);
        const fwd = new THREE.Vector3(0, 0, 1).transformDirection(r.scene.matrixWorld);
        const outward = r.scene.worldToLocal(lUpper.getWorldPosition(new THREE.Vector3())).x >= 0 ? 1 : -1;
        rotateWorld(lUpper, new THREE.Quaternion().setFromAxisAngle(fwd, 0.24 * outward));
        endOverride(lUpper);
      }
      if (torch === "none") return;
      const upper = r.bones.get("Bip01_R_UpperArm");
      const fore = r.bones.get("Bip01_R_Forearm");
      const hand = r.bones.get("Bip01_R_Hand");
      const root = r.scene;
      if (!upper || !fore || !hand) return;
      raise.current = THREE.MathUtils.damp(raise.current, raiseTorch ? 1 : 0, 5, dt);
      root.updateMatrixWorld(true);
      // target in character space: in front of the right shoulder, chest height; or overhead when raised
      const shoulder = _t.setFromMatrixPosition(upper.matrixWorld);
      const local = root.worldToLocal(shoulder.clone());
      const side = Math.sign(local.x) || -1;
      const carry = new THREE.Vector3(local.x - side * 0.06, local.y - 0.2, local.z + 0.24);
      const up = new THREE.Vector3(local.x + side * 0.08, local.y + 0.42, local.z + 0.12);
      target.current.copy(carry.lerp(up, raise.current));
      root.localToWorld(target.current);
      const fingers = [...FINGER_CHAINS.flat(), ...THUMB].map((n) => r.bones.get(n)).filter(Boolean) as THREE.Bone[];
      const touched = [upper, fore, hand, ...fingers];
      touched.forEach(beginOverride);
      root.updateMatrixWorld(true);
      solveCCD([upper, fore], hand, target.current, 5);
      // close the hand around the torch and seat the grip in the fist
      const forward = _b.set(0, 0, 1).transformDirection(root.matrixWorld);
      const axis = new THREE.Vector3(0, 1, 0).addScaledVector(forward, 0.12 - raise.current * 0.08).normalize();
      const across = new THREE.Vector3(1, 0, 0).transformDirection(root.matrixWorld).multiplyScalar(-side).addScaledVector(forward, 0.6);
      const center = gripHand(r, hand, axis, across);
      touched.forEach(endOverride);
      if (torchRef.current && center) {
        const parent = torchRef.current.parent!;
        parent.updateMatrixWorld(true);
        const want = parent.worldToLocal(center);
        const parentQ = parent.getWorldQuaternion(new THREE.Quaternion());
        const wantQ = parentQ.invert().multiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis));
        // follow the fist tightly but filter frame-to-frame IK noise
        const k = torchInit.current ? 1 - Math.exp(-dt * 30) : 1;
        torchInit.current = true;
        torchRef.current.position.lerp(want, k);
        torchRef.current.quaternion.slerp(wantQ, k);
      }
    },
    [torch, raiseTorch, anim],
  );

  return (
    <group {...group}>
      <Avatar ref={ref} avatarId={avatarId} anim={anim} skin={skin} onRig={onRig} afterAnimate={afterAnimate} timeScale={timeScale} />
      {torch !== "none" && ready && (
        <Torch ref={torchRef} lit={torch === "lit"} light={torchLight} shadows={torchShadows} />
      )}
    </group>
  );
});
