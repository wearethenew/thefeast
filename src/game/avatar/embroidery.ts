import * as THREE from "three";

// Procedural textures for the TORCH robe: velvet base + gold baroque embroidery bands,
// echoing the robes on The Feast posters. Everything is drawn on canvas, no image assets.

export const ROBE_TEX_W = 2048;
export const ROBE_TEX_H = 1024;

/** UV layout of the robe body: u wraps around the body (0.5 = centre front), v runs hem (0) → collar (1). */
export const ROBE_LAYOUT = {
  frontBand: 0.026, // half-width in u of the gold band each side of the front opening
  hemBand: 0.065,
  collarBand: 0.05,
};

function scroll(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, flip: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.bezierCurveTo(x + flip * s * 0.9, y - s * 0.8, x + flip * s * 0.9, y + s * 0.2, x + flip * s * 0.25, y + s * 0.25);
  ctx.bezierCurveTo(x - flip * s * 0.2, y + s * 0.3, x - flip * s * 0.15, y - s * 0.15, x + flip * s * 0.15, y - s * 0.1);
  ctx.stroke();
  // leaf
  ctx.beginPath();
  ctx.ellipse(x - flip * s * 0.35, y - s * 0.55, s * 0.12, s * 0.3, flip * 0.7, 0, Math.PI * 2);
  ctx.fill();
}

/** Draws a vertical embroidered band (x0..x1) between y0..y1 into colour + mask canvases. */
function band(ctxs: CanvasRenderingContext2D[], x0: number, x1: number, y0: number, y1: number, vertical: boolean) {
  const w = x1 - x0;
  const h = y1 - y0;
  for (const [i, ctx] of ctxs.entries()) {
    const gold = i === 0 ? "#e9b94f" : "#ffffff";
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, w, h);
    ctx.clip();
    ctx.strokeStyle = gold;
    ctx.fillStyle = gold;
    // border rails
    const rail = Math.max(2, (vertical ? w : h) * 0.06);
    ctx.lineWidth = rail;
    if (vertical) {
      ctx.strokeRect(x0 + rail, y0 - 10, w - rail * 2, h + 20);
    } else {
      ctx.strokeRect(x0 - 10, y0 + rail, w + 20, h - rail * 2);
    }
    // repeating scroll motif
    const s = (vertical ? w : h) * 0.32;
    const step = s * 2.3;
    ctx.lineWidth = Math.max(1.5, s * 0.14);
    const len = vertical ? h : w;
    for (let t = step * 0.5, k = 0; t < len; t += step, k++) {
      const flip = k % 2 ? 1 : -1;
      if (vertical) scroll(ctx, x0 + w / 2, y0 + t, s, flip);
      else {
        ctx.save();
        ctx.translate(x0 + t, y0 + h / 2);
        ctx.rotate(Math.PI / 2);
        scroll(ctx, 0, 0, s, flip);
        ctx.restore();
      }
    }
    ctx.restore();
  }
}

function crossMotif(ctxs: CanvasRenderingContext2D[], x: number, y: number, s: number) {
  for (const [i, ctx] of ctxs.entries()) {
    ctx.fillStyle = i === 0 ? "#e2ad44" : "#ffffff";
    for (let k = 0; k < 4; k++) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((k * Math.PI) / 2);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(s * 0.35, -s * 0.5, 0, -s);
      ctx.quadraticCurveTo(-s * 0.35, -s * 0.5, 0, 0);
      ctx.fill();
      ctx.restore();
    }
  }
}

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** Height map → tangent-space normal map. */
function normalFromHeight(src: HTMLCanvasElement, strength: number) {
  const { width: w, height: h } = src;
  const d = src.getContext("2d")!.getImageData(0, 0, w, h).data;
  const out = canvas(w, h);
  const octx = out.getContext("2d")!;
  const img = octx.createImageData(w, h);
  const H = (x: number, y: number) => d[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / len) * 0.5 * 255 + 127;
      img.data[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

export type RobeTextures = { map: THREE.Texture; mask: THREE.Texture; normal: THREE.Texture };

const cache = new Map<string, RobeTextures>();

/**
 * Colour map (velvet + gold), a mask (white = gold, used for metalness/roughness) and a normal map.
 * `kind` selects the layout: the main body, a sleeve (cuff band) or the hood (edge band).
 */
export function robeTextures(velvet: string, kind: "body" | "sleeve" | "hood"): RobeTextures {
  const key = velvet + kind;
  const hit = cache.get(key);
  if (hit) return hit;

  const W = kind === "body" ? ROBE_TEX_W : 1024;
  const Hh = kind === "body" ? ROBE_TEX_H : 512;
  const col = canvas(W, Hh);
  const msk = canvas(W, Hh);
  const c = col.getContext("2d")!;
  const m = msk.getContext("2d")!;

  // velvet base with soft pile variation
  c.fillStyle = velvet;
  c.fillRect(0, 0, W, Hh);
  const base = new THREE.Color(velvet);
  for (let i = 0; i < 3000; i++) {
    const k = 0.9 + Math.random() * 0.2;
    c.fillStyle = `rgba(${(base.r * 255 * k) | 0},${(base.g * 255 * k) | 0},${(base.b * 255 * k) | 0},0.08)`;
    const r = 4 + Math.random() * 18;
    c.beginPath();
    c.arc(Math.random() * W, Math.random() * Hh, r, 0, Math.PI * 2);
    c.fill();
  }
  m.fillStyle = "#000";
  m.fillRect(0, 0, W, Hh);
  const both = [c, m];

  // canvas y=0 is the top of the texture = v 1 (flipY), so collar is at the top.
  if (kind === "body") {
    const L = ROBE_LAYOUT;
    const fb = L.frontBand * W;
    // front opening bands either side of u = 0.5 (wrap is at the back)
    band(both, W * 0.5 - fb * 2, W * 0.5 - fb * 0.1, 0, Hh, true);
    band(both, W * 0.5 + fb * 0.1, W * 0.5 + fb * 2, 0, Hh, true);
    band(both, 0, W, Hh * (1 - L.hemBand), Hh, false);
    band(both, 0, W, 0, Hh * L.collarBand, false);
    // scattered cross motifs on the chest, like the pastor's robe
    for (const [u, v] of [[0.42, 0.8], [0.58, 0.8], [0.41, 0.62], [0.59, 0.62]]) crossMotif(both, u * W, (1 - v) * Hh, Hh * 0.035);
  } else if (kind === "sleeve") {
    // v = 0 at the cuff
    band(both, 0, W, Hh * 0.78, Hh, false);
  } else {
    band(both, 0, W, Hh * 0.82, Hh, false);
  }

  const height = canvas(W, Hh);
  const hctx = height.getContext("2d")!;
  hctx.filter = "blur(1.5px)";
  hctx.drawImage(msk, 0, 0);

  const map = new THREE.CanvasTexture(col);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const mask = new THREE.CanvasTexture(msk);
  const normal = new THREE.CanvasTexture(normalFromHeight(height, 4));
  for (const t of [map, mask, normal]) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
  }
  const res = { map, mask, normal };
  cache.set(key, res);
  return res;
}

/** Velvet with gold thread: sheen everywhere, metallic + smoother where the mask is white. */
export function robeMaterial(velvet: string, sheen: string, kind: "body" | "sleeve" | "hood") {
  const tex = robeTextures(velvet, kind);
  const mat = new THREE.MeshPhysicalMaterial({
    map: tex.map,
    normalMap: tex.normal,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughness: 1,
    metalness: 1,
    // Mask drives both: G channel → roughness, B → metalness (glTF convention).
    roughnessMap: tex.mask,
    metalnessMap: tex.mask,
    sheen: 1,
    sheenColor: new THREE.Color(sheen),
    sheenRoughness: 0.45,
    side: THREE.DoubleSide,
  });
  // Remap mask: velvet (0) → rough & non-metal, gold (1) → semi-polished metal.
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <roughnessmap_fragment>", "float roughnessFactor = mix(0.85, 0.32, texture2D(roughnessMap, vRoughnessMapUv).g);")
      .replace("#include <metalnessmap_fragment>", "float metalnessFactor = mix(0.0, 0.95, texture2D(metalnessMap, vMetalnessMapUv).b);");
  };
  mat.customProgramCacheKey = () => "torch-robe";
  return mat;
}
