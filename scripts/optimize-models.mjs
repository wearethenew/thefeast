// Shrinks the GLBs in public/avatars for the web without changing how anything looks:
//  - animations: drops keyframes that sit on the straight line between their neighbours
//    (within 1e-7, so playback is unchanged) and bones' tracks that never move
//  - everything: EXT_meshopt_compression on geometry and animation data, with no quantization,
//    so the decoded numbers are bit-for-bit the originals (three's GLTFLoader decodes it; drei's
//    useGLTF wires the decoder in by default)
// Textures are left exactly as they are. Safe to re-run: files already compressed are skipped.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression } from "@gltf-transform/extensions";
import { dedup, prune, resample } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

const ROOT = new URL("..", import.meta.url).pathname;
const DIRS = [join(ROOT, "public/avatars"), join(ROOT, "public/avatars/anims")];

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions([EXTMeshoptCompression])
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });

for (const dir of DIRS) {
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".glb"))) {
    const path = join(dir, file);
    const doc = await io.read(path);
    if (doc.getRoot().listExtensionsUsed().some((e) => e.extensionName === EXTMeshoptCompression.EXTENSION_NAME)) continue;
    if (doc.getRoot().listAnimations().length) await doc.transform(resample({ tolerance: 1e-7 }), prune({ keepLeaves: true }), dedup());
    doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
    await io.write(path, doc);
    console.log("optimized", file);
  }
}
