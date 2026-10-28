import * as THREE from "three";
import { HALL, MAIN_DOOR, COMPOUND, toWorld } from "./compound";
import { pointInPoly } from "./lagosData";

// What of the hall can be seen from where the camera is. The hall is shut all round except its
// main doors (the stage end opens onto the annex, so only the front is relied on): from out in
// front, only what lies in the wedge from the camera through the doorway can be seen at all.

const HALL_WORLD = [
  [HALL.x0, HALL.z0],
  [HALL.x1, HALL.z0],
  [HALL.x1, HALL.z1],
  [HALL.x0, HALL.z1],
].map(([x, z]) => {
  const w = toWorld(x, z);
  return [w.x, w.z] as [number, number];
});
export const insideHallWorld = (x: number, z: number) => pointInPoly(x, z, HALL_WORLD);

/**
 * The hall is shut all round except its main doors, so from outside its people can only be seen
 * through that opening. The doorway's corners (a little generous), and the planes from the camera
 * through its edges: anyone outside that wedge is out of sight and needn't be drawn at all.
 */
const DOORWAY = [
  [MAIN_DOOR.x - MAIN_DOOR.w / 2 - 0.6, 0],
  [MAIN_DOOR.x + MAIN_DOOR.w / 2 + 0.6, 0],
  [MAIN_DOOR.x + MAIN_DOOR.w / 2 + 0.6, 4],
  [MAIN_DOOR.x - MAIN_DOOR.w / 2 - 0.6, 4],
].map(([x, y]) => {
  const w = toWorld(x, HALL.z1 + 0.2);
  return new THREE.Vector3(w.x, y, w.z);
});
const _doorMid = DOORWAY.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / 4);
const _inward = (() => {
  const w = toWorld(MAIN_DOOR.x, HALL.z1 - 5);
  return new THREE.Vector3(w.x, 2, w.z).sub(_doorMid).setY(0).normalize();
})();
const _wedge = [0, 1, 2, 3].map(() => new THREE.Plane());
const _ea = new THREE.Vector3(), _eb = new THREE.Vector3(), _p = new THREE.Vector3();
/**
 * Sets up the wedge for this camera: "wedge" when it's out in front of the doorway; anywhere else
 * "all", nothing ruled out (the stage end is open to the annex, so the back and sides aren't shut).
 */
export function aimWedge(cam: THREE.Vector3): "all" | "wedge" {
  if (insideHallWorld(cam.x, cam.z)) return "all";
  // in front of the doorway by a clear margin
  if (_p.copy(cam).sub(_doorMid).dot(_inward) > -0.5) return "all";
  for (let i = 0; i < 4; i++) {
    _ea.copy(DOORWAY[i]).sub(cam);
    _eb.copy(DOORWAY[(i + 1) % 4]).sub(cam);
    const n = _ea.cross(_eb).normalize();
    const pl = _wedge[i].setFromNormalAndCoplanarPoint(n, cam);
    // facing in towards the middle of the doorway
    if (pl.distanceToPoint(_doorMid) < 0) pl.negate();
  }
  return "wedge";
}
/** Could someone standing here be seen through the doorway? */
export function throughDoor(x: number, y: number, z: number) {
  _p.set(x, y + 0.9, z);
  for (const pl of _wedge) if (pl.distanceToPoint(_p) < -1.2) return false;
  return true;
}

/** Is this (world) sphere wholly outside the wedge set up by the last aimWedge? */
export function outsideWedge(s: THREE.Sphere, margin = 0.3) {
  for (const pl of _wedge) if (pl.distanceToPoint(s.center) < -s.radius - margin) return true;
  return false;
}

/** World to the compound's own frame (the inverse of toWorld). */
export function toLocal(wx: number, wz: number) {
  const c = Math.cos(COMPOUND.rotation), sn = Math.sin(COMPOUND.rotation);
  const x = wx - COMPOUND.center[0], z = wz - COMPOUND.center[1];
  return [x * c - z * sn, x * sn + z * c];
}

