import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import type { GLTFLoader } from "three-stdlib";

// The avatars' images are KTX2 (Basis): compressed in a form the GPU uses as it is, at a fraction
// of the memory of a decoded picture. The loader turns each into whichever compressed format this
// device's GPU reads (ASTC, ETC, BC…), using the transcoder served from /basis/.

let loader: KTX2Loader | null = null;

/** What this device's GPU can read, asked of a throwaway 1×1 context (no need to wait for the scene's). */
function capabilities() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
  const ext = (name: string) => gl?.getExtension(name) ?? null;
  const shim = { extensions: { has: (name: string) => !!ext(name), get: (name: string) => ext(name) } };
  return { shim, done: () => (ext("WEBGL_lose_context") as WEBGL_lose_context | null)?.loseContext() };
}

/** For useGLTF's `extendLoader`: lets a glTF loader read KTX2 images. */
export function withKTX2(gltf: GLTFLoader) {
  if (!loader) {
    loader = new KTX2Loader().setTranscoderPath("/basis/");
    const { shim, done } = capabilities();
    loader.detectSupport(shim as never);
    done();
  }
  gltf.setKTX2Loader(loader as never);
}
