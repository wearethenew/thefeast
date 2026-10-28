// Converts the Rocketbox placeholder avatars + animations (assets-src/rocketbox) into
// web-ready GLBs in public/avatars. Needs FBX2glTF (npm i fbx2gltf) and macOS `sips` for TGA.
// The raw files (incl. ~540MB of TGA textures) come from github.com/microsoft/Microsoft-Rocketbox;
// only the FBX exports are kept locally, so re-download the Textures folders before re-running.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { NodeIO } from "@gltf-transform/core";
import { prune, dedup } from "@gltf-transform/functions";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "assets-src/rocketbox/Assets");
const OUT = join(ROOT, "public/avatars");
const FBX2GLTF = process.env.FBX2GLTF;
if (!FBX2GLTF) throw new Error("Set FBX2GLTF to the FBX2glTF binary path");
const TMP = join(tmpdir(), "torch-avatars");
mkdirSync(TMP, { recursive: true });
mkdirSync(join(OUT, "anims"), { recursive: true });

const io = new NodeIO();

function fbxToGlb(fbx, name) {
  const out = join(TMP, name);
  execFileSync(FBX2GLTF, ["-b", "-o", out, fbx], { stdio: "ignore" });
  return out + ".glb";
}

async function textureBytes(tga, size, format) {
  const png = join(TMP, basename(tga, ".tga") + ".png");
  execFileSync("sips", ["-s", "format", "png", tga, "--out", png], { stdio: "ignore" });
  let img = sharp(png).resize(size, size);
  return format === "png" ? img.png({ compressionLevel: 9 }).toBuffer() : img.jpeg({ quality: 82 }).toBuffer();
}

// AVATAR_DIR overrides the folder (e.g. a few newly downloaded avatars); SKIP_ANIMS=1 skips the clips
const avatarDir = process.env.AVATAR_DIR ? join(ROOT, process.env.AVATAR_DIR) : join(SRC, "Avatars/Adults");
for (const name of readdirSync(avatarDir)) {
  const dir = join(avatarDir, name);
  const glbPath = fbxToGlb(join(dir, "Export", name + ".fbx"), name);
  const doc = await io.read(glbPath);
  const root = doc.getRoot();
  const tex = (file, mime, bytes) => doc.createTexture(file).setImage(bytes).setMimeType(mime);
  for (const mat of root.listMaterials()) {
    const prefix = join(dir, "Textures", mat.getName());
    if (mat.getName().endsWith("_opacity")) {
      // Eyelashes/hair cards: RGBA texture, alpha-tested.
      if (existsSync(prefix + "_color.tga")) {
        mat.setBaseColorTexture(tex(mat.getName(), "image/png", await textureBytes(prefix + "_color.tga", 512, "png")));
      }
      mat.setAlphaMode("MASK").setAlphaCutoff(0.4).setDoubleSided(true);
    } else {
      mat.setBaseColorTexture(tex(mat.getName() + "_color", "image/jpeg", await textureBytes(prefix + "_color.tga", 1024, "jpg")));
      mat.setNormalTexture(tex(mat.getName() + "_normal", "image/jpeg", await textureBytes(prefix + "_normal.tga", 1024, "jpg")));
    }
    mat.setMetallicFactor(0).setRoughnessFactor(mat.getName().endsWith("_head") ? 0.5 : 0.75);
  }
  for (const anim of root.listAnimations()) anim.dispose();
  await doc.transform(prune(), dedup());
  await io.write(join(OUT, name + ".glb"), doc);
  console.log("avatar", name);
}

// Animations: one small GLB per clip, skeleton only.
for (const sub of process.env.SKIP_ANIMS ? [] : readdirSync(join(SRC, "Animations"))) {
  for (const file of readdirSync(join(SRC, "Animations", sub))) {
    const clip = file.replace(".max.fbx", "");
    const doc = await io.read(fbxToGlb(join(SRC, "Animations", sub, file), clip));
    for (const mesh of doc.getRoot().listMeshes()) mesh.dispose();
    for (const anim of doc.getRoot().listAnimations()) anim.setName(clip);
    await doc.transform(prune({ keepLeaves: true }));
    await io.write(join(OUT, "anims", clip + ".glb"), doc);
    console.log("anim", clip);
  }
}
