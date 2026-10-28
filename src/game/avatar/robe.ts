import * as THREE from "three";
import { robeMaterial } from "./embroidery";

// Builds a hooded velvet robe fitted to a Rocketbox body and skinned to its skeleton.
// The robe is generated in the character's rig space (Y up, facing +Z) from the body's
// bind-pose vertices, then skin weights are transferred from the nearest body vertices,
// except the skirt, which hangs from the pelvis and only partly follows the thighs.

type Region = "torso" | "legL" | "legR" | "armL" | "armR" | "head";

type BodySample = { p: THREE.Vector3; idx: number[]; w: number[]; region: Region };

export type RobeGeometries = { body: THREE.BufferGeometry; sleeves: THREE.BufferGeometry; hood: THREE.BufferGeometry };

function regionOf(bone: string): Region {
  if (/Head|Eye|Jaw|Mouth|Lip|Nose|Cheek|brow|Caninus|Masseter|Tongue|Upperlip/i.test(bone)) return "head";
  const left = /_L_|\sL\s|_L$/.test(bone) || /Bip01_L/.test(bone);
  if (/UpperArm|Forearm|Hand|Finger/.test(bone)) return left ? "armL" : "armR";
  if (/Thigh|Calf|Foot|Toe/.test(bone)) return left ? "legL" : "legR";
  return "torso";
}

function sampleBody(meshes: THREE.SkinnedMesh[], rootInv: THREE.Matrix4): BodySample[] {
  const out: BodySample[] = [];
  const v = new THREE.Vector3();
  for (const skinned of meshes) {
  const toRig = rootInv.clone().multiply(skinned.matrixWorld);
  const geo = skinned.geometry;
  const si = geo.getAttribute("skinIndex");
  const sw = geo.getAttribute("skinWeight");
  const bones = skinned.skeleton.bones;
  for (let i = 0; i < geo.getAttribute("position").count; i++) {
    skinned.getVertexPosition(i, v);
    const p = v.clone().applyMatrix4(toRig);
    const idx = [si.getX(i), si.getY(i), si.getZ(i), si.getW(i)];
    const w = [sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)];
    let best = 0;
    for (let k = 1; k < 4; k++) if (w[k] > w[best]) best = k;
    out.push({ p, idx, w, region: regionOf(bones[idx[best]].name) });
  }
  }
  return out;
}

/** Inverse-distance blend of the skin weights of the k nearest samples, reduced to 4 influences. */
function transferWeights(p: THREE.Vector3, pool: BodySample[], k = 4): [number[], number[]] {
  const best: { d: number; s: BodySample }[] = [];
  for (const s of pool) {
    const d = s.p.distanceToSquared(p);
    if (best.length < k || d < best[best.length - 1].d) {
      best.push({ d, s });
      best.sort((a, b) => a.d - b.d);
      if (best.length > k) best.pop();
    }
  }
  const acc = new Map<number, number>();
  for (const { d, s } of best) {
    const f = 1 / (Math.sqrt(d) + 1e-3);
    s.idx.forEach((bi, j) => acc.set(bi, (acc.get(bi) ?? 0) + s.w[j] * f));
  }
  return top4(acc);
}

function top4(acc: Map<number, number>): [number[], number[]] {
  const sorted = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const total = sorted.reduce((t, [, w]) => t + w, 0) || 1;
  const idx = [0, 0, 0, 0];
  const w = [0, 0, 0, 0];
  sorted.forEach(([bi, wi], j) => {
    idx[j] = bi;
    w[j] = wi / total;
  });
  return [idx, w];
}

function blendWeights(a: [number[], number[]], b: [number[], number[]], t: number): [number[], number[]] {
  const acc = new Map<number, number>();
  a[0].forEach((bi, j) => acc.set(bi, (acc.get(bi) ?? 0) + a[1][j] * (1 - t)));
  b[0].forEach((bi, j) => acc.set(bi, (acc.get(bi) ?? 0) + b[1][j] * t));
  return top4(acc);
}

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

class Builder {
  pos: number[] = [];
  uv: number[] = [];
  si: number[] = [];
  sw: number[] = [];
  index: number[] = [];
  vert(p: THREE.Vector3, u: number, v: number, w: [number[], number[]]) {
    this.pos.push(p.x, p.y, p.z);
    this.uv.push(u, v);
    this.si.push(...w[0]);
    this.sw.push(...w[1]);
    return this.pos.length / 3 - 1;
  }
  /** Grid of rows × cols vertices, already pushed starting at `start`. */
  grid(start: number, rows: number, cols: number, skip?: (r: number, c: number) => boolean) {
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        if (skip?.(r, c)) continue;
        const a = start + r * cols + c;
        const b = a + 1;
        const d = a + cols;
        const e = d + 1;
        this.index.push(a, d, b, b, d, e);
      }
    }
  }
  /**
   * Converts rig-space rest-pose positions into the skinned mesh's bind space by inverting the
   * blended skinning matrix of each vertex (these rigs bind Z-up but stand Y-up at rest).
   */
  build(fromRig: THREE.Matrix4, skinMats: THREE.Matrix4[]) {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(this.pos);
    const v = new THREE.Vector3();
    const m = new THREE.Matrix4();
    for (let i = 0, vi = 0; i < p.length; i += 3, vi++) {
      m.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
      for (let k = 0; k < 4; k++) {
        const w = this.sw[vi * 4 + k];
        if (w === 0) continue;
        const e = skinMats[this.si[vi * 4 + k]].elements;
        for (let j = 0; j < 16; j++) m.elements[j] += e[j] * w;
      }
      m.invert();
      v.set(p[i], p[i + 1], p[i + 2]).applyMatrix4(fromRig).applyMatrix4(m);
      p[i] = v.x;
      p[i + 1] = v.y;
      p[i + 2] = v.z;
    }
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.index);
    g.computeVertexNormals();
    return g;
  }
}

export function buildRobe(meshes: THREE.SkinnedMesh[], skinned: THREE.SkinnedMesh, rigRoot: THREE.Object3D, hoodUp: boolean): RobeGeometries {
  // Measure the body in its standing rest pose.
  const rest = rigRoot.userData.rest as [THREE.Bone, THREE.Vector3, THREE.Quaternion, THREE.Vector3][] | undefined;
  for (const [b, p, q, sc] of rest ?? []) {
    b.position.copy(p);
    b.quaternion.copy(q);
    b.scale.copy(sc);
  }
  rigRoot.updateMatrixWorld(true);
  for (const m of meshes) m.skeleton.update();
  const rootInv = rigRoot.matrixWorld.clone().invert();
  const toRig = rootInv.clone().multiply(skinned.matrixWorld);
  const fromRig = toRig.clone().invert();

  const body = sampleBody(meshes.filter((m) => !/_opacity$/.test((m.material as THREE.Material).name)), rootInv);
  const bones = skinned.skeleton.bones;
  const boneIndex = (name: string) => bones.findIndex((b) => b.name === name);
  const bonePos = (name: string) => {
    const b = bones.find((bb) => bb.name === name)!;
    return new THREE.Vector3().setFromMatrixPosition(b.matrixWorld).applyMatrix4(rootInv);
  };

  const pelvis = bonePos("Bip01_Pelvis");
  const neck = bonePos("Bip01_Neck");
  const head = bonePos("Bip01_Head");
  const footY = Math.min(bonePos("Bip01_L_Foot").y, bonePos("Bip01_R_Foot").y);
  const thighL = bonePos("Bip01_L_Thigh");
  const leftSign = Math.sign(thighL.x - pelvis.x) || 1;
  const cx = pelvis.x;
  const cz = pelvis.z;

  const torsoPool = body.filter((s) => s.region === "torso");
  const trunkPool = body.filter((s) => s.region === "torso" || s.region === "legL" || s.region === "legR");

  // ---------- body / skirt ----------
  const S = 56; // around
  const R = 46; // rings
  const hemY = footY + 0.07;
  const collarY = neck.y + 0.015;
  const radii: number[][] = [];
  const ys: number[] = [];
  for (let r = 0; r < R; r++) {
    const y = hemY + ((collarY - hemY) * r) / (R - 1);
    ys.push(y);
    const bins = new Array(S).fill(0);
    for (const s of trunkPool) {
      if (Math.abs(s.p.y - y) > 0.035) continue;
      const dx = s.p.x - cx;
      const dz = s.p.z - cz;
      const a = Math.atan2(dx, dz); // 0 = front
      const u = (a / (2 * Math.PI) + 0.5 + 1) % 1;
      const bin = Math.round(u * S) % S;
      bins[bin] = Math.max(bins[bin], Math.hypot(dx, dz));
    }
    // fill empty bins from neighbours, then smooth around
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < S; i++) {
        if (bins[i] === 0) bins[i] = Math.max(bins[(i + S - 1) % S], bins[(i + 1) % S]) * 0.98;
      }
    }
    const sm = bins.map((_, i) => (bins[(i + S - 2) % S] + 2 * bins[(i + S - 1) % S] + 3 * bins[i] + 2 * bins[(i + 1) % S] + bins[(i + 2) % S]) / 9);
    radii.push(sm.map((x, i) => Math.max(x, bins[i] * 0.97)));
  }
  // vertical smoothing + A-line skirt + collar taper
  const hipRing = Math.round(((pelvis.y - hemY) / (collarY - hemY)) * (R - 1));
  const hipR = Math.max(...radii[hipRing]);
  const hemR = hipR * 1.6 + 0.06;
  for (let r = 0; r < R; r++) {
    const t = r <= hipRing ? 1 - r / hipRing : 0; // 1 at hem → 0 at hips
    for (let i = 0; i < S; i++) {
      const a = radii[Math.max(0, r - 1)][i];
      const b = radii[Math.min(R - 1, r + 1)][i];
      let rad = (a + 2 * radii[r][i] + b) / 4 + 0.03;
      if (r <= hipRing) {
        // round the leg outline into a skirt that flares toward the hem
        const skirt = THREE.MathUtils.lerp(hipR + 0.05, hemR, Math.pow(t, 0.8));
        rad = Math.max(rad, skirt);
      }
      radii[r][i] = rad;
    }
  }
  // collar: pull the top rings in toward the neck
  for (let r = R - 4; r < R; r++) {
    const k = (r - (R - 4)) / 3;
    radii[r] = radii[r].map((x) => THREE.MathUtils.lerp(x, 0.085, k * 0.85));
  }

  const pelvisW: [number[], number[]] = [[boneIndex("Bip01_Pelvis"), 0, 0, 0], [1, 0, 0, 0]];
  const thighLI = boneIndex("Bip01_L_Thigh");
  const thighRI = boneIndex("Bip01_R_Thigh");

  const bodyB = new Builder();
  for (let r = 0; r < R; r++) {
    for (let i = 0; i <= S; i++) {
      const u = i / S;
      const a = (u - 0.5) * Math.PI * 2;
      // soft vertical folds, deepening toward the hem (kept off the front opening)
      const t = ys[r] < pelvis.y ? (pelvis.y - ys[r]) / (pelvis.y - hemY) : 0;
      const frontCalm = smoothstep(0.05, 0.14, Math.abs(u - 0.5));
      const fold = (Math.sin(a * 11 + 0.7) * 0.6 + Math.sin(a * 5 + 2.1) * 0.4) * (0.012 + 0.03 * t) * frontCalm;
      const rad = radii[r][i % S] + fold;
      const p = new THREE.Vector3(cx + Math.sin(a) * rad, ys[r], cz + Math.cos(a) * rad);
      let w: [number[], number[]];
      if (ys[r] < pelvis.y - 0.05) {
        // skirt: hangs from the pelvis, each side drifts toward its thigh further down
        const t = smoothstep(pelvis.y - 0.05, hemY, ys[r]);
        const side = smoothstep(-0.12, 0.12, (p.x - cx) * leftSign); // 1 = left
        const legShare = 0.7 * t;
        w = top4(
          new Map([
            [pelvisW[0][0], 1 - legShare],
            [thighLI, legShare * side],
            [thighRI, legShare * (1 - side)],
          ]),
        );
        if (ys[r] > pelvis.y - 0.2) w = blendWeights(transferWeights(p, torsoPool), w, smoothstep(pelvis.y - 0.05, pelvis.y - 0.2, ys[r]));
      } else {
        w = transferWeights(p, torsoPool);
      }
      bodyB.vert(p, u, r / (R - 1), w);
    }
  }
  bodyB.grid(0, R, S + 1);

  // ---------- sleeves ----------
  const sleeveB = new Builder();
  for (const side of ["L", "R"] as const) {
    const sh = bonePos(`Bip01_${side}_UpperArm`);
    const el = bonePos(`Bip01_${side}_Forearm`);
    const wr = bonePos(`Bip01_${side}_Hand`);
    const clav = bonePos(`Bip01_${side}_Clavicle`);
    const start = sh.clone().lerp(clav, 0.35);
    const armPool = body.filter((s) => s.region === (side === "L" ? "armL" : "armR"));
    const shoulderPool = [...armPool, ...torsoPool];
    const forearmW: [number[], number[]] = [[boneIndex(`Bip01_${side}_Forearm`), 0, 0, 0], [1, 0, 0, 0]];
    const RS = 22;
    const SS = 20;
    const base = sleeveB.pos.length / 3;
    // the torch arm is usually raised, when a real sleeve would slide back: end it above the wrist
    // so the fist and grip stay visible
    const end = side === "R" ? el.clone().lerp(wr, 0.72) : wr.clone().add(wr.clone().sub(el).setLength(0.02));
    for (let r = 0; r < RS; r++) {
      const s = r / (RS - 1); // 0 = cuff end, 1 = shoulder
      const along = 1 - s;
      // polyline start → elbow → end
      const lenA = start.distanceTo(el);
      const lenB = el.distanceTo(end);
      const d = along * (lenA + lenB);
      const c = d < lenA ? start.clone().lerp(el, d / lenA) : el.clone().lerp(end, (d - lenA) / lenB);
      const dir = (d < lenA ? el.clone().sub(start) : end.clone().sub(el)).normalize();
      // perpendicular frame
      const up = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const n1 = new THREE.Vector3().crossVectors(dir, up).normalize();
      const n2 = new THREE.Vector3().crossVectors(dir, n1).normalize();
      let maxR = 0.045;
      for (const sp of armPool) {
        const rel = sp.p.clone().sub(c);
        if (Math.abs(rel.dot(dir)) > 0.03) continue;
        maxR = Math.max(maxR, rel.sub(dir.clone().multiplyScalar(rel.dot(dir))).length());
      }
      // the right (torch) arm is raised most of the time, so keep its cuff narrow
      const flare = THREE.MathUtils.lerp(side === "R" ? 0.012 : 0.055, 0, smoothstep(0, 0.5, s));
      const rad = Math.min(maxR, 0.09) + 0.03 + flare;
      for (let i = 0; i <= SS; i++) {
        const a = (i / SS) * Math.PI * 2;
        // let the open cuff droop under gravity
        const droop = s < 0.4 ? (1 - s / 0.4) * 0.035 : 0;
        const p = c.clone()
          .add(n1.clone().multiplyScalar(Math.cos(a) * rad))
          .add(n2.clone().multiplyScalar(Math.sin(a) * rad));
        p.y -= droop * (0.5 + 0.5 * Math.sin(a));
        let w = transferWeights(p, s > 0.8 ? shoulderPool : armPool);
        if (s < 0.45) w = blendWeights(w, forearmW, 1 - s / 0.45);
        sleeveB.vert(p, i / SS, s, w);
      }
    }
    sleeveB.grid(base, RS, SS + 1);
  }

  // ---------- hood ----------
  const hoodB = new Builder();
  const headPool = body.filter((s) => s.region === "head");
  const neckPool = torsoPool.filter((s) => s.p.y > neck.y - 0.12);
  if (hoodUp) {
    // shell over the back/top of the head, open around the face, flowing into the collar
    let headR = 0;
    const hc = head.clone();
    hc.y += 0.07;
    for (const s of headPool) headR = Math.max(headR, s.p.distanceTo(hc));
    headR = Math.min(headR, 0.135) + 0.03;
    const RH = 18;
    const SH = 28;
    const base = 0;
    for (let r = 0; r < RH; r++) {
      const phi = (r / (RH - 1)) * Math.PI * 0.62; // 0 = top
      for (let i = 0; i <= SH; i++) {
        const u = i / SH;
        const a = (u - 0.5) * Math.PI * 2; // 0 = front
        // face opening: pull the front edge back so the face shows
        const open = Math.max(0, 1 - Math.abs(a) / 1.1);
        const radial = headR * (1 + 0.15 * (r / (RH - 1)));
        const p = new THREE.Vector3(
          hc.x + Math.sin(phi) * Math.sin(a) * radial,
          hc.y + Math.cos(phi) * radial * 1.12 - (r / (RH - 1)) * 0.06,
          hc.z + Math.sin(phi) * Math.cos(a) * radial - open * 0.11 * Math.sin(phi) - 0.02,
        );
        const toNeck = smoothstep(Math.PI * 0.35, Math.PI * 0.62, phi);
        const w = blendWeights(transferWeights(p, headPool), transferWeights(p, neckPool), toNeck);
        // v: 1 at the face edge (gold band), 0 at the back
        // v: 1 along the face opening (gold band), 0 at the back
        hoodB.vert(p, u, smoothstep(1.7, 1.1, Math.abs(a)) * smoothstep(0.1, 0.35, phi / Math.PI), w);
      }
    }
    // leave the face open
    hoodB.grid(base, RH, SH + 1, (r, c) => {
      const a = ((c + 0.5) / SH - 0.5) * Math.PI * 2;
      const phi = ((r + 0.5) / (RH - 1)) * Math.PI * 0.62;
      return Math.abs(a) < 1.1 && phi > Math.PI * 0.2;
    });
  } else {
    // hood down: a cowl lying on the shoulders and upper back, open at the front
    const RC = 9;
    const SC = 30;
    for (let r = 0; r < RC; r++) {
      const t = r / (RC - 1); // 0 = collar edge, 1 = outer drape
      for (let i = 0; i <= SC; i++) {
        const u = i / SC;
        const a = (u - 0.5) * Math.PI * 1.45 + Math.PI; // centred at the back
        const back = Math.max(0, -Math.cos(a)); // deeper drape down the back
        const ring = THREE.MathUtils.lerp(0.1, 0.2 + back * 0.04, t);
        const p = new THREE.Vector3(
          neck.x + Math.sin(a) * ring,
          neck.y + 0.02 - t * (0.1 + back * 0.12),
          neck.z - 0.01 + Math.cos(a) * ring,
        );
        hoodB.vert(p, u, 1 - t, transferWeights(p, neckPool));
      }
    }
    hoodB.grid(0, RC, SC + 1);
  }

  // per-bone skinning matrices of the rest pose, in mesh-local space
  const skinMats = bones.map((b, i) =>
    new THREE.Matrix4()
      .copy(skinned.bindMatrixInverse)
      .multiply(b.matrixWorld)
      .multiply(skinned.skeleton.boneInverses[i])
      .multiply(skinned.bindMatrix),
  );
  return { body: bodyB.build(fromRig, skinMats), sleeves: sleeveB.build(fromRig, skinMats), hood: hoodB.build(fromRig, skinMats) };
}

const geoCache = new Map<string, RobeGeometries>();

/** Creates the robe meshes for one character instance and binds them to its skeleton. */
export function dressInRobe(
  key: string,
  meshes: THREE.SkinnedMesh[],
  skinned: THREE.SkinnedMesh,
  rigRoot: THREE.Object3D,
  colors: { velvet: string; sheen: string },
  hoodUp: boolean,
) {
  const cacheKey = key + (hoodUp ? ":up" : ":down");
  let geos = geoCache.get(cacheKey);
  if (!geos) {
    geos = buildRobe(meshes, skinned, rigRoot, hoodUp);
    geoCache.set(cacheKey, geos);
  }
  const robeMeshes: THREE.SkinnedMesh[] = [];
  for (const [part, geo] of Object.entries(geos) as [keyof RobeGeometries, THREE.BufferGeometry][]) {
    const mat = robeMaterial(colors.velvet, colors.sheen, part === "body" ? "body" : part === "sleeves" ? "sleeve" : "hood");
    const m = new THREE.SkinnedMesh(geo, mat);
    m.name = "robe_" + part;
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    m.position.copy(skinned.position);
    m.quaternion.copy(skinned.quaternion);
    m.scale.copy(skinned.scale);
    skinned.parent!.add(m);
    m.bind(skinned.skeleton, skinned.bindMatrix);
    robeMeshes.push(m);
  }
  return robeMeshes;
}
