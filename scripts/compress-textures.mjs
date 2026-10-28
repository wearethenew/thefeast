// Turns the avatars' images (public/avatars/*.glb) into KTX2 (Basis ETC1S, at its top quality): a
// format the GPU uses as it is, at an eighth to a quarter of the memory of a decoded JPEG/PNG
// (half to one byte a pixel instead of four), mipmaps included, in files about the size of the
// JPEGs. (Basis's other mode, UASTC, is a touch sharper but makes the download five times bigger.)
// This is what lets the whole crowd fit in a low-end phone's graphics memory.
// Colour images keep their sRGB colours; normal maps are encoded as normal maps. Safe to re-run:
// files already converted are skipped. Run after scripts/optimize-models.mjs.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRTextureBasisu } from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import { ktx2 } from "ktx2-encoder/gltf-transform";
import sharp from "sharp";

const ROOT = new URL("..", import.meta.url).pathname;
const DIR = join(ROOT, "public/avatars");

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions([EXTMeshoptCompression, KHRTextureBasisu])
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });

const imageDecoder = async (buffer) => {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
};
const common = { isUASTC: false, qualityLevel: 255, compressionLevel: 2, generateMipmap: true, imageDecoder };

for (const file of readdirSync(DIR).filter((f) => f.endsWith(".glb"))) {
  const path = join(DIR, file);
  const doc = await io.read(path);
  if (!doc.getRoot().listTextures().some((t) => t.getMimeType() !== "image/ktx2")) continue;
  // colour (and the hair cards' colour with its alpha): sRGB
  await doc.transform(ktx2({ ...common, slots: /^baseColorTexture$/, isSetKTX2SRGBTransferFunc: true }));
  // normal maps: linear, encoded as normals
  await doc.transform(ktx2({ ...common, slots: /^normalTexture$/, isSetKTX2SRGBTransferFunc: false, isNormalMap: true }));
  await io.write(path, doc);
  console.log("compressed", file);
}
