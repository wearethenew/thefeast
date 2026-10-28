import { MeshoptSimplifier } from "meshoptimizer";
import * as THREE from "three";
import type { AvatarHandle } from "../avatar/Avatar";
import type { AnimName } from "../data/avatars";

// Vertex-animation textures for crowds. A real Character (Rocketbox body, fitted robe, torch held
// by IK) is posed frame by frame through one animation cycle; every vertex's position and normal
// is written into float textures. Instanced copies then play the cycle on the GPU, each at its
// own phase, so hundreds of real people walk or sit for the cost of a few draw calls.

export const VAT_W = 1024;

export type PartKind = "skin" | "hair" | "robe-body" | "robe-sleeve" | "robe-hood" | "torch";
export type BakedPart = { kind: PartKind; lods: THREE.BufferGeometry[]; material: THREE.Material };
export type Baked = {
  parts: BakedPart[];
  pos: THREE.DataTexture;
  nrm: THREE.DataTexture;
  frames: number;
  rows: number;
  /** VAT index of the torch flame's centre (-1 without a torch). */
  anchor: number;
  duration: number;
};

type Source = { mesh: THREE.Mesh; skinned: boolean; color: THREE.Color };
type Part = { kind: PartKind; material: THREE.Material; sources: Source[] };

const _v = new THREE.Vector3();

function kindOf(m: THREE.Mesh): PartKind {
  if (m.name.startsWith("robe_body")) return "robe-body";
  if (m.name.startsWith("robe_sleeves")) return "robe-sleeve";
  if (m.name.startsWith("robe_hood")) return "robe-hood";
  const mat = m.material as THREE.Material;
  if (/_opacity$/.test(mat.name)) return "hair";
  return "skin";
}

function collect(root: THREE.Object3D) {
  const parts: Part[] = [];
  const torch: Source[] = [];
  let flame: THREE.Object3D | null = null;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (o as THREE.Points).isPoints) return;
    const mat = m.material as THREE.Material;
    if ((mat as THREE.ShaderMaterial).isShaderMaterial) {
      flame ??= m;
      return;
    }
    if ((m as THREE.SkinnedMesh).isSkinnedMesh) {
      parts.push({ kind: kindOf(m), material: mat, sources: [{ mesh: m, skinned: true, color: new THREE.Color(1, 1, 1) }] });
    } else {
      torch.push({ mesh: m, skinned: false, color: ((mat as THREE.MeshStandardMaterial).color ?? new THREE.Color(1, 1, 1)).clone() });
    }
  });
  if (torch.length) parts.push({ kind: "torch", material: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.85, roughness: 0.3 }), sources: torch });
  return { parts, flame: flame as THREE.Object3D | null };
}

/** Pose → positions of every vertex of a source, in the character root's space. */
function sample(src: Source, inv: THREE.Matrix4, out: Float32Array, offset: number) {
  const pos = src.mesh.geometry.getAttribute("position");
  const world = src.mesh.matrixWorld;
  for (let i = 0; i < pos.count; i++) {
    if (src.skinned) (src.mesh as THREE.SkinnedMesh).getVertexPosition(i, _v);
    else _v.fromBufferAttribute(pos, i);
    _v.applyMatrix4(world).applyMatrix4(inv);
    out[(offset + i) * 3] = _v.x;
    out[(offset + i) * 3 + 1] = _v.y;
    out[(offset + i) * 3 + 2] = _v.z;
  }
}

function indexOf(g: THREE.BufferGeometry) {
  if (g.index) return Array.from(g.index.array as ArrayLike<number>);
  return Array.from({ length: g.getAttribute("position").count }, (_, i) => i);
}

export async function simplifierReady() {
  await MeshoptSimplifier.ready;
}

/**
 * Bake the current clip of a mounted Character, a step at a time (run it across frames). `root`
 * is the Character's outer group; `handle` its avatar handle (already playing `anim`). Each step
 * re-poses the character itself, so it doesn't matter what the clip does in between.
 */
export function* bakeSteps(root: THREE.Object3D, handle: AvatarHandle, anim: AnimName, frames = 24): Generator<void, Baked> {
  const duration = handle.duration(anim) || 1;
  handle.seek(0);
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const { parts, flame } = collect(root);

  // rest arrays per part (frame 0), simplified to two levels of detail
  type Prepared = { part: Part; kept: Uint32Array; remap: Map<number, number>; lods: Uint32Array[]; total: number; base: number; uv: Float32Array | null; color: Float32Array | null };
  const prepared: Prepared[] = [];
  let base = 0;
  for (const part of parts) {
    const total = part.sources.reduce((n, s) => n + s.mesh.geometry.getAttribute("position").count, 0);
    const rest = new Float32Array(total * 3);
    const idx: number[] = [];
    let off = 0;
    for (const s of part.sources) {
      sample(s, inv, rest, off);
      for (const i of indexOf(s.mesh.geometry)) idx.push(i + off);
      off += s.mesh.geometry.getAttribute("position").count;
    }
    const indices = new Uint32Array(idx);
    const torch = part.kind === "torch";
    // near: close to the full body; far: still a person's shape and face, not a blob
    const [lod0] = MeshoptSimplifier.simplify(indices, rest, 3, Math.max(3, Math.floor((indices.length * (torch ? 0.7 : 0.7)) / 3) * 3), 0.003, ["LockBorder"]);
    const [lod1] = MeshoptSimplifier.simplify(lod0, rest, 3, Math.max(3, Math.floor((lod0.length * (torch ? 0.5 : 0.4)) / 3) * 3), 0.012, ["LockBorder"]);
    const remap = new Map<number, number>();
    const keptList: number[] = [];
    for (const i of [...lod0, ...lod1])
      if (!remap.has(i)) {
        remap.set(i, keptList.length);
        keptList.push(i);
      }
    const kept = new Uint32Array(keptList);
    // uvs / colours of the kept vertices
    let uv: Float32Array | null = null;
    let color: Float32Array | null = null;
    if (torch) {
      color = new Float32Array(kept.length * 3);
      let o = 0;
      part.sources.forEach((s) => {
        const n = s.mesh.geometry.getAttribute("position").count;
        kept.forEach((k, j) => {
          if (k >= o && k < o + n) color!.set([s.color.r, s.color.g, s.color.b], j * 3);
        });
        o += n;
      });
    } else {
      const src = part.sources[0].mesh.geometry.getAttribute("uv");
      if (src) {
        uv = new Float32Array(kept.length * 2);
        kept.forEach((k, j) => uv!.set([src.getX(k), src.getY(k)], j * 2));
      }
      // some avatars (the women's) carry vertex colours, and their materials multiply by them:
      // without the colours here the shader reads black and the whole figure goes dark
      const cs = part.sources[0].mesh.geometry.getAttribute("color");
      if (cs) {
        color = new Float32Array(kept.length * 3);
        kept.forEach((k, j) => color!.set([cs.getX(k), cs.getY(k), cs.getZ(k)], j * 3));
      }
    }
    prepared.push({ part, kept, remap, lods: [lod0, lod1], total, base, uv, color });
    base += kept.length;
    yield;
  }
  const anchor = flame ? base : -1;
  const count = base + (flame ? 1 : 0);
  const rows = Math.ceil(count / VAT_W);
  const posData = new Float32Array(VAT_W * rows * frames * 4);
  const nrmData = new Float32Array(VAT_W * rows * frames * 4);
  const put = (data: Float32Array, frame: number, vid: number, x: number, y: number, z: number) => {
    const texel = (frame * rows + Math.floor(vid / VAT_W)) * VAT_W + (vid % VAT_W);
    data[texel * 4] = x;
    data[texel * 4 + 1] = y;
    data[texel * 4 + 2] = z;
    data[texel * 4 + 3] = 1;
  };

  const frame0: Float32Array[] = [];
  const normals0: Float32Array[] = [];
  // (working arrays made once per part and reused every frame: baking a whole crowd otherwise
  // leaves millions of throwaway arrays behind, enough to push a phone's tab over its memory limit)
  const scratch = prepared.map((p) => ({
    all: new Float32Array(p.total * 3),
    kp: new Float32Array(p.kept.length * 3),
    nr: new Float32Array(p.kept.length * 3),
    // the triangles' corners already mapped to kept vertices
    tri: Uint32Array.from(p.lods[0], (i) => p.remap.get(i)!),
  }));
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let f = 0; f < frames; f++) {
    handle.seek((f / frames) * duration);
    root.updateMatrixWorld(true);
    for (const [pi, p] of prepared.entries()) {
      const sc = scratch[pi];
      const all = sc.all;
      let off = 0;
      for (const s of p.part.sources) {
        sample(s, inv, all, off);
        off += s.mesh.geometry.getAttribute("position").count;
      }
      // (the first frame's are kept as the people's resting shape: fresh arrays for those)
      const kp = f === 0 ? new Float32Array(p.kept.length * 3) : sc.kp;
      for (let j = 0; j < p.kept.length; j++) {
        const k = p.kept[j];
        kp[j * 3] = all[k * 3];
        kp[j * 3 + 1] = all[k * 3 + 1];
        kp[j * 3 + 2] = all[k * 3 + 2];
      }
      // smooth normals from the detailed level's triangles
      const nr = f === 0 ? new Float32Array(p.kept.length * 3) : sc.nr.fill(0);
      const tri = sc.tri;
      for (let t = 0; t < tri.length; t += 3) {
        const ia = tri[t], ib = tri[t + 1], ic = tri[t + 2];
        a.fromArray(kp, ia * 3);
        b.fromArray(kp, ib * 3);
        c.fromArray(kp, ic * 3);
        n.subVectors(c, b).cross(a.sub(b));
        nr[ia * 3] += n.x;
        nr[ia * 3 + 1] += n.y;
        nr[ia * 3 + 2] += n.z;
        nr[ib * 3] += n.x;
        nr[ib * 3 + 1] += n.y;
        nr[ib * 3 + 2] += n.z;
        nr[ic * 3] += n.x;
        nr[ic * 3 + 1] += n.y;
        nr[ic * 3 + 2] += n.z;
      }
      for (let j = 0; j < p.kept.length; j++) {
        n.fromArray(nr, j * 3).normalize();
        if (!Number.isFinite(n.x)) n.set(0, 1, 0);
        put(posData, f, p.base + j, kp[j * 3], kp[j * 3 + 1], kp[j * 3 + 2]);
        put(nrmData, f, p.base + j, n.x, n.y, n.z);
        nr[j * 3] = n.x;
        nr[j * 3 + 1] = n.y;
        nr[j * 3 + 2] = n.z;
      }
      if (f === 0) {
        frame0.push(kp);
        normals0.push(nr);
      }
    }
    if (flame) {
      flame.getWorldPosition(_v).applyMatrix4(inv);
      put(posData, f, anchor, _v.x, _v.y, _v.z);
    }
    // a frame of the clip per step, so baking never stalls the picture
    yield;
  }

  const tex = (data: Float32Array) => {
    const t = new THREE.DataTexture(data, VAT_W, rows * frames, THREE.RGBAFormat, THREE.FloatType);
    t.needsUpdate = true;
    return t;
  };

  const baked: Baked = { parts: [], pos: tex(posData), nrm: tex(nrmData), frames, rows, anchor, duration };
  prepared.forEach((p, k) => {
    const attrs: Record<string, THREE.BufferAttribute> = {
      position: new THREE.Float32BufferAttribute(frame0[k], 3),
      normal: new THREE.Float32BufferAttribute(normals0[k], 3),
      aVid: new THREE.Float32BufferAttribute(Float32Array.from(p.kept, (_, j) => p.base + j), 1),
    };
    if (p.uv) attrs.uv = new THREE.Float32BufferAttribute(p.uv, 2);
    if (p.color) attrs.color = new THREE.Float32BufferAttribute(p.color, 3);
    const lods = p.lods.map((l) => {
      const g = new THREE.BufferGeometry();
      for (const [name, a] of Object.entries(attrs)) g.setAttribute(name, a);
      g.setIndex(new THREE.BufferAttribute(Uint32Array.from(l, (i) => p.remap.get(i)!), 1));
      return g;
    });
    const material = p.part.kind === "torch" ? p.part.material : (p.part.material as THREE.Material).clone();
    if (p.part.kind === "skin") (material as THREE.MeshStandardMaterial).color?.set("#ffffff");
    baked.parts.push({ kind: p.part.kind, lods, material });
  });
  return baked;
}

/** Seconds on the crowd clock (shared by every VAT material). */
export const vatClock = { value: 0 };

const VAT_COMMON = `
  uniform highp sampler2D uVatPos;
  uniform highp sampler2D uVatNrm;
  uniform float uVatTime;
  uniform float uVatFrames;
  uniform float uVatRows;
  attribute float aVid;
  attribute vec4 aAnim;
  vec3 vatAt(highp sampler2D t, float vid, float frame) {
    int v = int(vid + 0.5);
    int f = int(frame + 0.5);
    return texelFetch(t, ivec2(v % ${VAT_W}, f * int(uVatRows + 0.5) + v / ${VAT_W}), 0).xyz;
  }
  float vatPhase() { return fract(aAnim.x + uVatTime * aAnim.y) * uVatFrames; }
`;

function inject(shader: THREE.WebGLProgramParametersWithUniforms, b: Baked) {
  shader.uniforms.uVatPos = { value: b.pos };
  shader.uniforms.uVatNrm = { value: b.nrm };
  shader.uniforms.uVatTime = vatClock;
  shader.uniforms.uVatFrames = { value: b.frames };
  shader.uniforms.uVatRows = { value: b.rows };
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\n" + VAT_COMMON)
    .replace(
      "#include <beginnormal_vertex>",
      `float vnPh = vatPhase();
      float vnF0 = floor(vnPh);
      vec3 objectNormal = normalize(mix(vatAt(uVatNrm, aVid, vnF0), vatAt(uVatNrm, aVid, mod(vnF0 + 1.0, uVatFrames)), vnPh - vnF0));
      #ifdef USE_TANGENT
      vec3 objectTangent = vec3(tangent.xyz);
      #endif`,
    )
    .replace(
      "#include <begin_vertex>",
      `float vPh = vatPhase();
      float vF0 = floor(vPh);
      vec3 transformed = mix(vatAt(uVatPos, aVid, vF0), vatAt(uVatPos, aVid, mod(vF0 + 1.0, uVatFrames)), vPh - vF0);`,
    );
}

/** Make a material read its vertices from the baked animation (keeps any existing shader tweaks). */
export function vatMaterial<T extends THREE.Material>(mat: T, b: Baked): T {
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey();
  mat.onBeforeCompile = (shader, renderer) => {
    prev.call(mat, shader, renderer);
    inject(shader, b);
  };
  mat.customProgramCacheKey = () => prevKey + "|vat";
  return mat;
}

/** Depth material for shadows that follows the baked animation. */
export function vatDepthMaterial(b: Baked) {
  return vatMaterial(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), b);
}

/** Billboarded torch flames riding on each instance's baked flame anchor. */
export function flameMaterial(b: Baked) {
  return new THREE.ShaderMaterial({
    uniforms: { uVatPos: { value: b.pos }, uVatNrm: { value: b.nrm }, uVatTime: vatClock, uVatFrames: { value: b.frames }, uVatRows: { value: b.rows }, uAnchor: { value: b.anchor } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    vertexShader: `
      uniform highp sampler2D uVatPos;
      uniform float uVatTime;
      uniform float uVatFrames;
      uniform float uVatRows;
      uniform float uAnchor;
      attribute vec4 aAnim;
      varying vec2 vUv;
      varying float vSeed;
      vec3 vatAt(float frame) {
        int v = int(uAnchor + 0.5);
        int f = int(frame + 0.5);
        return texelFetch(uVatPos, ivec2(v % ${VAT_W}, f * int(uVatRows + 0.5) + v / ${VAT_W}), 0).xyz;
      }
      void main() {
        float ph = fract(aAnim.x + uVatTime * aAnim.y) * uVatFrames;
        float f0 = floor(ph);
        vec3 a = mix(vatAt(f0), vatAt(mod(f0 + 1.0, uVatFrames)), ph - f0);
        vec4 mv = viewMatrix * modelMatrix * instanceMatrix * vec4(a, 1.0);
        vSeed = aAnim.x * 37.0;
        float fl = 1.0 + 0.18 * sin(uVatTime * 17.0 + vSeed) + 0.08 * sin(uVatTime * 29.0 + vSeed * 2.0);
        mv.xy += vec2(position.x * 0.24, (position.y + 0.3) * 0.34 * fl);
        vUv = position.xy + 0.5;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uVatTime;
      varying vec2 vUv;
      varying float vSeed;
      float uTime9() { return uVatTime * 9.0 + vSeed; }
      void main() {
        vec2 p = vUv - vec2(0.5, 0.3);
        p.x -= sin(uTime9() + vUv.y * 4.0) * 0.04 * vUv.y;
        // teardrop: round at the base, tapering to a tip
        float r = length(vec2(p.x * (1.6 + max(p.y, 0.0) * 4.5), p.y * (p.y > 0.0 ? 0.9 : 2.2)));
        float body = smoothstep(0.32, 0.12, r);
        float core = smoothstep(0.16, 0.0, length(vec2(p.x * 2.2, (p.y + 0.06) * 2.0)));
        vec3 col = mix(vec3(1.0, 0.28, 0.04), vec3(1.0, 0.62, 0.18), body) + vec3(1.0, 0.85, 0.5) * core * 0.8;
        float a = clamp(body * 0.85 + core * 0.5, 0.0, 1.0);
        gl_FragColor = vec4(col * a * 1.6, a);
      }`,
  });
}

/**
 * Everyday looks for crowd "skin" parts (the avatar's body and head textures, which carry both
 * skin and clothes): skin-coloured texels get the person's skin tone, everything else on the body
 * (the outfit) gets their own hue shift and lightness, so the same avatar never looks the same twice.
 */
export function lookMaterial<T extends THREE.Material>(mat: T, head: boolean): T {
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey();
  mat.onBeforeCompile = (shader, renderer) => {
    prev.call(mat, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 aTone;\nvarying vec3 vTone;\nvarying vec2 vLook;\nvarying float vObjY;")
      // (begin_vertex is already the baked animation by now; hook in just before projection)
      .replace("#include <project_vertex>", "vTone = aTone;\nvLook = aAnim.zw;\nvObjY = transformed.y;\n#include <project_vertex>");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vTone;
        varying vec2 vLook;
        varying float vObjY;
        // bright, Lagos-colourful outfit colours (Ankara blues, oranges, magentas, greens, golds…)
        vec3 outfit(float k) {
          float i = floor(k * 12.0);
          if (i < 1.0) return vec3(0.10, 0.28, 0.85);
          if (i < 2.0) return vec3(0.95, 0.45, 0.08);
          if (i < 3.0) return vec3(0.85, 0.12, 0.48);
          if (i < 4.0) return vec3(0.08, 0.62, 0.32);
          if (i < 5.0) return vec3(0.96, 0.76, 0.12);
          if (i < 6.0) return vec3(0.05, 0.62, 0.68);
          if (i < 7.0) return vec3(0.78, 0.10, 0.12);
          if (i < 8.0) return vec3(0.48, 0.20, 0.78);
          if (i < 9.0) return vec3(0.95, 0.95, 0.92);
          if (i < 10.0) return vec3(0.98, 0.55, 0.65);
          if (i < 11.0) return vec3(0.55, 0.78, 0.20);
          return vec3(0.20, 0.45, 0.95);
        }
        vec3 rgb2hsv(vec3 c) {
          vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
          vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
          vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
          float d = q.x - min(q.w, q.y);
          return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
        }
        vec3 hsv2rgb(vec3 c) {
          vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
          vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
          return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
        }`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        {
          vec3 hsv = rgb2hsv(diffuseColor.rgb);
          float skin = (1.0 - smoothstep(0.085, 0.12, hsv.x)) * smoothstep(0.12, 0.22, hsv.y) * (1.0 - smoothstep(0.6, 0.72, hsv.y)) * smoothstep(0.2, 0.34, hsv.z);
          vec3 tone = vTone * clamp(hsv.z / 0.62, 0.65, 1.3);
          ${
            head
              ? "diffuseColor.rgb = mix(diffuseColor.rgb, tone, skin);"
              : `// the outfit: a vivid top and a different bottom, keeping the fabric's own folds and shading;
          // shoes stay as they are
          float shade = clamp(hsv.z / 0.28, 0.62, 1.3);
          vec3 top = outfit(vLook.x), bottom = outfit(fract(vLook.y + 0.37));
          vec3 cloth = mix(bottom, top, smoothstep(0.88, 0.98, vObjY)) * shade;
          float shoes = 1.0 - smoothstep(0.08, 0.14, vObjY);
          vec3 dressed = mix(cloth, diffuseColor.rgb, shoes);
          diffuseColor.rgb = mix(dressed, tone, skin);`
          }
        }`,
      );
  };
  mat.customProgramCacheKey = () => prevKey + (head ? "|look-head" : "|look-body");
  return mat;
}
