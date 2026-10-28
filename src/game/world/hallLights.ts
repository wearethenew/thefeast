import * as THREE from "three";

// The hall's washes and spots. A light at intensity 0 still costs every lit pixel on screen (three
// runs each one in every material's shader), so outside the hall they're taken out altogether.
// Each material then has two shader versions, with and without them: both are compiled ahead of
// time (see primeHallLights) so walking in or out never stalls on a compile.

const lights = new Set<THREE.Light>();

/** Ref callback for a hall light. */
export const hallLight = (l: THREE.Light | null) => {
  if (l) lights.add(l);
};

/** Shows or takes out the hall lights (their look inside is unchanged: they only switch on there). */
export function showHallLights(on: boolean) {
  for (const l of lights) l.visible = on;
}

/**
 * What's in the hall but hidden while it can't be seen from where you are (see Venue's
 * HallCuller): it's shown again as you walk in, so its shaders are made ready along with the rest.
 */
export const hallAsleep = new Set<THREE.Object3D>();

/**
 * Compiles every material in the scene for the other light setup too, in the background (three
 * builds the programs synchronously inside compileAsync, so the lights, and the hall's hidden
 * things, go straight back as they were). Walking in then never stalls on a compile.
 */
export function primeHallLights(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, on: boolean) {
  const was = [...lights].map((l) => l.visible);
  showHallLights(on);
  const woken = [...hallAsleep].filter((o) => !o.visible);
  for (const o of woken) o.visible = true;
  const done = gl.compileAsync(scene, camera, scene).catch(() => {});
  for (const o of woken) o.visible = false;
  [...lights].forEach((l, i) => (l.visible = was[i]));
  return done;
}
