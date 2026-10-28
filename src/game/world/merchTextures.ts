"use client";

import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import * as THREE from "three";
import { MERCH, type MerchItem } from "../data/merch";
import { MerchArt } from "../ui/MerchArt";

// The merch panel's product art, drawn into textures for the 3D store, so what hangs on the
// booth's walls is the same tee, hoodie, cap and tote you pre-order.

const cache = new Map<string, THREE.CanvasTexture>();

/** The SVG markup of one product shot. */
function markup(item: MerchItem, color: string, design: number) {
  const host = document.createElement("div");
  const root = createRoot(host);
  flushSync(() => root.render(createElement(MerchArt, { item, color, design })));
  const svg = host.innerHTML.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" ');
  root.unmount();
  return svg;
}

/** A transparent texture of `id` in `color` (filled in a moment later, once the image has drawn). */
export function merchTexture(id: MerchItem["id"], color: string, design = 0) {
  const key = id + color + design;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  cache.set(key, tex);
  const img = new Image();
  img.onload = () => {
    c.getContext("2d")!.drawImage(img, 0, 0, 512, 512);
    tex.needsUpdate = true;
  };
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(markup(MERCH.find((m) => m.id === id)!, color, design));
  return tex;
}

/** The top of a folded tee on a stack: the collar, the fold lines and the chest print. */
export function foldedTeeTexture(color: string) {
  const key = "folded" + color;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 224;
  const g = c.getContext("2d")!;
  g.fillStyle = color;
  g.fillRect(0, 0, 256, 224);
  // light across the fabric, darker at the folded edges
  const sh = g.createLinearGradient(0, 0, 256, 0);
  sh.addColorStop(0, "rgba(0,0,0,0.3)");
  sh.addColorStop(0.12, "rgba(0,0,0,0)");
  sh.addColorStop(0.88, "rgba(0,0,0,0)");
  sh.addColorStop(1, "rgba(0,0,0,0.3)");
  g.fillStyle = sh;
  g.fillRect(0, 0, 256, 224);
  const hl = g.createRadialGradient(100, 70, 10, 100, 70, 200);
  hl.addColorStop(0, "rgba(255,255,255,0.18)");
  hl.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = hl;
  g.fillRect(0, 0, 256, 224);
  // collar
  g.strokeStyle = "rgba(0,0,0,0.35)";
  g.lineWidth = 9;
  g.beginPath();
  g.ellipse(128, 0, 46, 30, 0, 0, Math.PI);
  g.stroke();
  // sleeves folded in behind
  g.strokeStyle = "rgba(0,0,0,0.18)";
  g.lineWidth = 3;
  for (const x of [34, 222]) {
    g.beginPath();
    g.moveTo(x, 8);
    g.lineTo(x, 216);
    g.stroke();
  }
  // the gold print
  const gold = g.createLinearGradient(0, 60, 0, 190);
  gold.addColorStop(0, "#ffe08a");
  gold.addColorStop(1, "#c08412");
  g.fillStyle = gold;
  g.beginPath();
  g.moveTo(128, 62);
  g.bezierCurveTo(146, 82, 148, 100, 140, 114);
  g.bezierCurveTo(134, 124, 122, 124, 116, 114);
  g.bezierCurveTo(108, 100, 118, 86, 128, 62);
  g.fill();
  g.fillRect(122, 118, 12, 30);
  g.font = "900 26px system-ui, sans-serif";
  g.textAlign = "center";
  g.fillText("THE TORCH", 128, 184);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  cache.set(key, tex);
  return tex;
}
