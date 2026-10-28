import * as THREE from "three";
import { PARKING, toWorld } from "./compound";
import type { Stream } from "./processionData";

// The car park behind the Fusion Centre, off Adeniyi Jones Avenue, and the marshalled crossing at
// its entrance: when a car turns in across the lane the crowd walks, the people walking up to the
// entrance wait, those already on it walk clear, and the car goes in once the crossing is empty.

/** Bays along both sides of the aisle (compound-local centre, facing: +1 north row, −1 south row). */
export const BAYS: { x: number; z: number; face: 1 | -1 }[] = [];
for (let x = PARKING.x0 + 2.4; x < PARKING.x1 - 1.4; x += 2.7)
  for (const face of [1, -1] as const) BAYS.push({ x, z: PARKING.aisle + face * 5.6, face });

/** The crossing over the walkers' lane (the avenue's outer lane by the fence) at the entrance (world). */
const c = toWorld(PARKING.road + 5.4, PARKING.aisle);
export const CROSSING = { x: c.x, z: c.z, r: 4.2, closed: false };

const sCross = new WeakMap<Stream, number>();
/** Where along a walkers' path the crossing is (−1: it doesn't pass it). */
function crossAt(st: Stream) {
  let s = sCross.get(st);
  if (s === undefined) {
    s = -1;
    let best = 5;
    for (let i = 0; i < st.length; i++) {
      const d = Math.hypot(st.x[i] - CROSSING.x, st.z[i] - CROSSING.z);
      if (d < best) {
        best = d;
        s = i;
      }
    }
    sCross.set(st, s);
  }
  return s;
}

/** Should a walker at `s` on `st` stand and wait (the crossing is closed and they're coming up to it)? */
export function waitAtCrossing(st: Stream, s: number) {
  if (!CROSSING.closed) return false;
  const at = crossAt(st);
  if (at < 0) return false;
  const before = at - CROSSING.r - s;
  return before > 0 && before < 40;
}

/** Which bays are taken (index into BAYS), shared by the parked cars and the ones turning in. */
export const taken = new Set<number>();
// the car park is already half full when you arrive
BAYS.forEach((_, i) => {
  const x = Math.sin(i * 91.7) * 43758.5;
  if (x - Math.floor(x) < 0.5) taken.add(i);
});

/**
 * The route into a bay, from where the car leaves the avenue's inner lane on the fence side
 * (coming from +z when `from` is +1): a right turn across the walkers' lane.
 */
export function routeIn(from: THREE.Vector3, bay: number, side: 1 | -1) {
  const b = BAYS[bay];
  const w = (x: number, z: number) => toWorld(x, z);
  const pts = [
    from.clone(),
    w(PARKING.road + 1.7, PARKING.aisle + 7 * side),
    w(PARKING.road + 3.4, PARKING.aisle + 2 * side),
    w(PARKING.road + 6.5, PARKING.aisle),
    w(Math.max(b.x - 3.2, PARKING.road + 9), PARKING.aisle),
    w(b.x - 0.6, PARKING.aisle + b.face * 2.2),
    w(b.x, b.z - b.face * 0.4),
  ];
  return new THREE.CatmullRomCurve3(pts, false, "centripetal", 0.5);
}
