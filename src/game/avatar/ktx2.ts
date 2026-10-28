import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import type { GLTFLoader } from "three-stdlib";

// The avatars' images are KTX2 (Basis): compressed in a form the GPU uses as it is, at a fraction
// of the memory of a decoded picture. The loader turns each into whichever compressed format this
// device's GPU reads (ASTC, ETC, BC…), using the transcoder served from /basis/.

let loader: KTX2Loader | null = null;

/**
 * What this device's GPU can read, asked of the scene's own WebGL context (the 3D view's canvas
 * already has it: asking again hands back the same one, so no second context is ever made).
 */
function capabilities() {
  let gl: WebGL2RenderingContext | WebGLRenderingContext | null = null;
  for (const c of document.querySelectorAll("canvas")) {
    gl = (c.getContext("webgl2") as WebGL2RenderingContext | null) ?? (c.getContext("webgl") as WebGLRenderingContext | null);
    if (gl) break;
  }
  const ext = (name: string) => gl?.getExtension(name) ?? null;
  return { extensions: { has: (name: string) => !!ext(name), get: (name: string) => ext(name) } };
}

/** For useGLTF's `extendLoader`: lets a glTF loader read KTX2 images. */
export function withKTX2(gltf: GLTFLoader) {
  if (!loader) {
    // (one image unpacked at a time: less memory in use at once while everything else loads)
    loader = new KTX2Loader().setTranscoderPath("/basis/").setWorkerLimit(1);
    loader.detectSupport(capabilities() as never);
  }
  gltf.setKTX2Loader(loader as never);
}
