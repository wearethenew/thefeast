"use client";

import * as THREE from "three";
import { Q } from "../quality";

// The Feast's flier (public/posters/the-torch-flier.jpg) on a portrait roadside board: one panel on
// a unipole, lit from within so it reads at dusk. Every board in the film shares one texture and one
// set of materials and geometries (the flier is loaded once, the first time a board is drawn).

const FLIER = "/posters/the-torch-flier.jpg";
/** The flier is 1024 × 1280: the panel keeps its 4:5. */
const ASPECT = 1280 / 1024;

let shared: { face: THREE.MeshBasicMaterial; frame: THREE.MeshStandardMaterial; pole: THREE.MeshStandardMaterial; plane: THREE.PlaneGeometry; box: THREE.BoxGeometry; cyl: THREE.CylinderGeometry } | null = null;

function flier() {
  if (shared) return shared;
  // the texture exists from the start (so the board's shader is compiled with the rest of the
  // film); its picture arrives when loaded. Phones get it at half size: a quarter of the memory
  const tex = new THREE.TextureLoader().load(FLIER, (t) => {
    if (!Q.lite) return;
    const img = t.image as HTMLImageElement;
    const c = document.createElement("canvas");
    c.width = Math.round(img.width / 2);
    c.height = Math.round(img.height / 2);
    const g = c.getContext("2d")!;
    g.imageSmoothingQuality = "high";
    g.drawImage(img, 0, 0, c.width, c.height);
    (t as THREE.Texture<HTMLImageElement | HTMLCanvasElement>).image = c;
    t.needsUpdate = true;
  });
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  shared = {
    face: new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }),
    frame: new THREE.MeshStandardMaterial({ color: "#0c0d10", metalness: 0.4, roughness: 0.5 }),
    pole: new THREE.MeshStandardMaterial({ color: "#2a2d33", metalness: 0.7, roughness: 0.4 }),
    plane: new THREE.PlaneGeometry(1, 1),
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(0.8, 1, 1, 10),
  };
  return shared;
}

export type FlierSpot = {
  x: number;
  z: number;
  /** Turned to face this point (the drone, for most of its shot). */
  faceX: number;
  faceZ: number;
  /** Panel width (m); its height follows the flier. */
  w: number;
  /** Height of the panel's bottom edge over the ground (m). */
  bottom: number;
  /** The flier on the back too (seen from all round). */
  both?: boolean;
};

/** A portrait flier board on a single pole. */
export function FlierBoard({ x, z, faceX, faceZ, w, bottom, both }: FlierSpot) {
  const m = flier();
  const h = w * ASPECT;
  const cy = bottom + h / 2;
  const pole = Math.max(0.25, w * 0.05);
  return (
    <group position={[x, 0, z]} rotation-y={Math.atan2(faceX - x, faceZ - z)}>
      <mesh geometry={m.cyl} material={m.pole} position-y={bottom / 2 + 0.3} scale={[pole, bottom + 0.6, pole]} />
      <mesh geometry={m.box} material={m.frame} position={[0, cy, -0.25]} scale={[w + 0.5, h + 0.5, 0.4]} />
      {(both ? [0, Math.PI] : [0]).map((r) => (
        <mesh key={r} geometry={m.plane} material={m.face} position={[0, cy, r ? -0.5 : 0]} rotation-y={r} scale={[w, h, 1]} />
      ))}
    </group>
  );
}
