"use client";

import { useMemo } from "react";
import * as THREE from "three";

// Scenery for the title screen: a sand floor with wind ripples and a high-rise skyline at dusk.

function sandTextures() {
  const S = 1024;
  const col = document.createElement("canvas");
  const hgt = document.createElement("canvas");
  col.width = col.height = hgt.width = hgt.height = S;
  const c = col.getContext("2d")!;
  const h = hgt.getContext("2d")!;
  const img = c.createImageData(S, S);
  const himg = h.createImageData(S, S);
  // seamless value noise
  const R = 64;
  const grid = Array.from({ length: R * R }, () => Math.random());
  const noise = (x: number, y: number, f: number) => {
    const gx = (x / S) * f, gy = (y / S) * f;
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    const tx = gx - x0, ty = gy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const at = (i: number, j: number) => grid[(((j % f) + f) % f) * R + (((i % f) + f) % f)];
    const a = at(x0, y0), b = at(x0 + 1, y0), cc = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    return a + (b - a) * sx + (cc - a) * sy + (a - b - cc + d) * sx * sy;
  };
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const n = noise(x, y, 8) * 0.5 + noise(x, y, 16) * 0.3 + noise(x, y, 32) * 0.2;
      // wind ripples running across, wobbling with the noise
      const ripple = Math.sin((y / S) * Math.PI * 2 * 22 + n * 9) * 0.5 + 0.5;
      const grain = Math.random();
      const v = 0.55 * n + 0.3 * ripple + 0.15 * grain;
      const i = (y * S + x) * 4;
      img.data[i] = 196 + v * 46;
      img.data[i + 1] = 160 + v * 40;
      img.data[i + 2] = 112 + v * 30;
      img.data[i + 3] = 255;
      const hv = (ripple * 0.7 + n * 0.3) * 255;
      himg.data[i] = himg.data[i + 1] = himg.data[i + 2] = hv;
      himg.data[i + 3] = 255;
    }
  c.putImageData(img, 0, 0);
  h.putImageData(himg, 0, 0);
  // height → normal
  const nrm = document.createElement("canvas");
  nrm.width = nrm.height = S;
  const nctx = nrm.getContext("2d")!;
  const nimg = nctx.createImageData(S, S);
  const H = (x: number, y: number) => himg.data[(((y + S) % S) * S + ((x + S) % S)) * 4] / 255;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * 2.2;
      const dy = (H(x, y + 1) - H(x, y - 1)) * 2.2;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * S + x) * 4;
      nimg.data[i] = ((-dx / l) * 0.5 + 0.5) * 255;
      nimg.data[i + 1] = ((dy / l) * 0.5 + 0.5) * 255;
      nimg.data[i + 2] = (1 / l) * 255;
      nimg.data[i + 3] = 255;
    }
  nctx.putImageData(nimg, 0, 0);
  const map = new THREE.CanvasTexture(col);
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = new THREE.CanvasTexture(nrm);
  for (const t of [map, normalMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(160, 160);
    t.anisotropy = 16;
  }
  return { map, normalMap };
}

export function SandFloor({ size = 600 }: { size?: number }) {
  const tex = useMemo(sandTextures, []);
  return (
    <mesh rotation-x={-Math.PI / 2} receiveShadow>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial map={tex.map} normalMap={tex.normalMap} normalScale={new THREE.Vector2(0.9, 0.9)} roughness={0.96} metalness={0} />
    </mesh>
  );
}

/** Skyscraper silhouettes with lit windows, arranged in an arc behind the scene. */
export function Skyline({ radius = 140, count = 70, center = [0, 0, -20] as [number, number, number] }) {
  const { geo, mat } = useMemo(() => {
    let seed = 5;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < count; i++) {
      // spread across the back half of a circle, taller toward the middle
      const a = Math.PI + (rnd() - 0.5) * Math.PI * 1.25;
      const r = radius * (0.8 + rnd() * 0.5);
      const mid = 1 - Math.abs(a - Math.PI) / (Math.PI * 0.62);
      const h = 25 + rnd() * 60 + mid * 70 * rnd();
      const w = 12 + rnd() * 18;
      const d = 12 + rnd() * 16;
      const g = new THREE.BoxGeometry(w, h, d);
      // uv in metres: x across each face, y up, for the window shader
      const uv = g.getAttribute("uv");
      const pos = g.getAttribute("position");
      for (let k = 0; k < uv.count; k++) {
        const px = pos.getX(k), py = pos.getY(k), pz = pos.getZ(k);
        uv.setXY(k, Math.abs(px) > w / 2 - 0.01 ? pz + d : px + w * 2, py + h / 2);
      }
      g.translate(Math.sin(a) * r + center[0], h / 2, Math.cos(a) * r + center[2]);
      g.rotateY(0);
      const sd = new Float32Array(pos.count).fill(rnd());
      g.setAttribute("seed", new THREE.BufferAttribute(sd, 1));
      parts.push(g);
      // a glass crown on some of the tallest
      if (h > 95 && rnd() < 0.6) {
        const c = new THREE.CylinderGeometry(w * 0.25, w * 0.4, 14, 8);
        c.translate(Math.sin(a) * r + center[0], h + 7, Math.cos(a) * r + center[2]);
        c.setAttribute("seed", new THREE.BufferAttribute(new Float32Array(c.getAttribute("position").count).fill(-1), 1));
        parts.push(c);
      }
    }
    const geo = mergeAll(parts);
    const mat = new THREE.MeshStandardMaterial({ color: "#1c2340", roughness: 0.4, metalness: 0.6 });
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float seed;\nvarying vec2 vFac;\nvarying float vSeed;")
        .replace("#include <uv_vertex>", "#include <uv_vertex>\nvFac = uv;\nvSeed = seed;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec2 vFac;\nvarying float vSeed;\nfloat h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}")
        .replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
          if (vSeed >= 0.0) {
            vec2 cell = floor(vFac / vec2(2.2, 3.4));
            vec2 f = fract(vFac / vec2(2.2, 3.4));
            float win = step(0.18, f.x) * step(f.x, 0.82) * step(0.25, f.y) * step(f.y, 0.8);
            float lit = step(0.55, h21(cell + vSeed * 31.0));
            vec3 warm = mix(vec3(1.0, 0.72, 0.4), vec3(0.75, 0.85, 1.0), step(0.7, h21(cell * 1.7 + vSeed)));
            totalEmissiveRadiance += warm * win * lit * 1.4;
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.06, 0.09, 0.16), win * (1.0 - lit));
          } else {
            totalEmissiveRadiance += vec3(0.9, 0.5, 0.2) * 0.5;
          }`,
        );
    };
    return { geo, mat };
  }, [radius, count, center]);
  return <mesh geometry={geo} material={mat} />;
}

function mergeAll(list: THREE.BufferGeometry[]) {
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const seed: number[] = [];
  const idx: number[] = [];
  for (const g0 of list) {
    const g = g0.index ? g0 : g0;
    const base = pos.length / 3;
    pos.push(...(g.getAttribute("position").array as Float32Array));
    nrm.push(...(g.getAttribute("normal").array as Float32Array));
    uv.push(...(g.getAttribute("uv").array as Float32Array));
    seed.push(...(g.getAttribute("seed").array as Float32Array));
    for (const i of g.getIndex()!.array) idx.push(i + base);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  out.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  out.setAttribute("seed", new THREE.Float32BufferAttribute(seed, 1));
  out.setIndex(idx);
  return out;
}
