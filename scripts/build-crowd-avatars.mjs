// The crowd's lighter copies of the avatars (public/avatars/crowd/*.glb): the same people, the same
// mesh, with every texture one size down (1024 → 512, the hair cards 512 → 256). People in the
// crowd are small on screen, so it looks the same, at about a third of the download. Your own
// person (and the ushers) keep the full files.
// No re-encoding: each KTX2 texture already carries its smaller sizes (its mipmaps), so the top
// level is simply dropped, with its entry in the Basis data. Run after scripts/compress-textures.mjs
// whenever the avatars change; safe to re-run.
import { mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRTextureBasisu } from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import { read, write } from "ktx-parse";

const ROOT = new URL("..", import.meta.url).pathname;
const DIR = join(ROOT, "public/avatars");
const OUT = join(DIR, "crowd");
mkdirSync(OUT, { recursive: true });

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions([EXTMeshoptCompression, KHRTextureBasisu])
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });

/** The texture one size down: its top mip level dropped (Basis ETC1S, as compress-textures makes them). */
function halve(bytes) {
  const k = read(bytes);
  if (k.levels.length < 2 || k.layerCount > 1 || k.faceCount !== 1) return bytes;
  k.levels.shift();
  k.levelCount = k.levels.length;
  // BasisLZ: one image description per level (2D, one layer, one face), top level first
  if (k.globalData) k.globalData.imageDescs.shift();
  k.pixelWidth = Math.max(1, k.pixelWidth >> 1);
  k.pixelHeight = Math.max(1, k.pixelHeight >> 1);
  return write(k);
}

let before = 0;
let after = 0;
for (const file of readdirSync(DIR).filter((f) => f.endsWith(".glb"))) {
  const doc = await io.read(join(DIR, file));
  for (const t of doc.getRoot().listTextures()) {
    if (t.getMimeType() !== "image/ktx2") throw new Error(`${file}: ${t.getName()} isn't KTX2 yet (run compress-textures first)`);
    t.setImage(halve(t.getImage()));
  }
  await io.write(join(OUT, file), doc);
  before += statSync(join(DIR, file)).size;
  after += statSync(join(OUT, file)).size;
  console.log("crowd", file, Math.round(statSync(join(OUT, file)).size / 1024) + "KB");
}
console.log(`all: ${Math.round(before / 1024)}KB → ${Math.round(after / 1024)}KB`);
