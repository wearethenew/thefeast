import * as THREE from "three";
import { drawMarkCanvas } from "../brand";
import { COURT, HALL, MAIN_DOOR, PAVERS, PLOT } from "./compound";

// Procedural surfaces for the Fusion Centre, matched to the architect's renders.

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
}

function tex(c: HTMLCanvasElement, repeat: [number, number] = [1, 1], srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 16;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Height canvas → tangent-space normal map. */
function normalFrom(h: HTMLCanvasElement, strength: number) {
  const { width: W, height: H } = h;
  const d = h.getContext("2d")!.getImageData(0, 0, W, H).data;
  const [c, g] = canvas(W, H);
  const img = g.createImageData(W, H);
  const at = (x: number, y: number) => d[(((y + H) % H) * W + ((x + W) % W)) * 4] / 255;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * W + x) * 4;
      img.data[i] = ((-dx / l) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((dy / l) * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / l) * 255;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  return c;
}

/** Vertical trapezoidal metal cladding (one tile = 1 m wide × 1 m tall). */
export function ribbedCladding(color = "#f1f2f3") {
  const [c, g] = canvas(256, 256);
  g.fillStyle = color;
  g.fillRect(0, 0, 256, 256);
  const [h, hg] = canvas(256, 256);
  hg.fillStyle = "#000";
  hg.fillRect(0, 0, 256, 256);
  // 4 ribs per metre
  for (let x = 0; x < 256; x += 64) {
    const grad = hg.createLinearGradient(x, 0, x + 64, 0);
    grad.addColorStop(0, "#000");
    grad.addColorStop(0.15, "#fff");
    grad.addColorStop(0.35, "#fff");
    grad.addColorStop(0.5, "#000");
    grad.addColorStop(1, "#000");
    hg.fillStyle = grad;
    hg.fillRect(x, 0, 64, 256);
    g.fillStyle = "rgba(0,0,0,0.05)";
    g.fillRect(x + 30, 0, 34, 256);
  }
  return { map: tex(c), normalMap: tex(normalFrom(h, 3), [1, 1], false) };
}

/** Sky-blue corrugated roof sheeting (tile = 1 m). */
export function roofSheeting() {
  const [c, g] = canvas(128, 128);
  g.fillStyle = "#7cc6f2";
  g.fillRect(0, 0, 128, 128);
  const [h, hg] = canvas(128, 128);
  for (let x = 0; x < 128; x++) {
    const v = Math.sin((x / 128) * Math.PI * 2 * 5) * 0.5 + 0.5;
    hg.fillStyle = `rgb(${v * 255},${v * 255},${v * 255})`;
    hg.fillRect(x, 0, 1, 128);
    g.fillStyle = `rgba(255,255,255,${v * 0.08})`;
    g.fillRect(x, 0, 1, 128);
  }
  return { map: tex(c), normalMap: tex(normalFrom(h, 2), [1, 1], false) };
}

/** White render on block walls with rain streaks and grime near the coping (tile = 4 m × 3 m). */
export function weatheredWall() {
  const [c, g] = canvas(512, 384);
  g.fillStyle = "#e9e8e3";
  g.fillRect(0, 0, 512, 384);
  for (let i = 0; i < 2500; i++) {
    const v = 200 + Math.random() * 40;
    g.fillStyle = `rgba(${v},${v},${v - 6},0.25)`;
    g.fillRect(Math.random() * 512, Math.random() * 384, 2, 2);
  }
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * 512;
    const len = 30 + Math.random() * 160;
    const grad = g.createLinearGradient(0, 0, 0, len);
    grad.addColorStop(0, "rgba(70,75,60,0.45)");
    grad.addColorStop(1, "rgba(70,75,60,0)");
    g.fillStyle = grad;
    g.fillRect(x, 0, 3 + Math.random() * 10, len);
  }
  const base = g.createLinearGradient(0, 300, 0, 384);
  base.addColorStop(0, "rgba(120,100,80,0)");
  base.addColorStop(1, "rgba(120,100,80,0.35)");
  g.fillStyle = base;
  g.fillRect(0, 300, 512, 84);
  return tex(c);
}

/** Red clay pavers laid in herringbone (tile = 2 m). */
export function herringbone() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = "#6e2a1f";
  g.fillRect(0, 0, 256, 256);
  const bw = 32, bh = 16;
  for (let y = -256; y < 512; y += bh)
    for (let x = -256; x < 512; x += bh * 2) {
      const ox = x + (((y / bh) | 0) % 2) * bh;
      for (const vert of [false, true]) {
        const tone = 150 + Math.random() * 40;
        g.fillStyle = `rgb(${tone},${tone * 0.42},${tone * 0.3})`;
        if (vert) g.fillRect(ox + bh, y - bh, bh - 1.5, bw - 1.5);
        else g.fillRect(ox, y, bw - 1.5, bh - 1.5);
      }
    }
  return tex(c);
}

/** Terrazzo: light concrete with coloured chips (tile = 1.5 m). */
export function terrazzo() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = "#e7e3dc";
  g.fillRect(0, 0, 256, 256);
  const chips = ["#9a8d80", "#c47c5a", "#6e6a66", "#d9b79a", "#4f5a63", "#b5a99b"];
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = chips[i % chips.length];
    g.beginPath();
    g.ellipse(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 3, 1 + Math.random() * 2, Math.random() * 3, 0, Math.PI * 2);
    g.fill();
  }
  return tex(c);
}

/** The New's mark: two hearts drawn as one stroke that turns into a W, as on the signage. */
/** The church mark (see brand.tsx), sized like the old hand-drawn one: r is about the heart's radius. */
export function drawMark(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  drawMarkCanvas(g, cx, cy, r * 1.75, color);
}

/** Round yellow logo disc (black mark) for the façade sign. */
export function logoDisc() {
  const [c, g] = canvas(512, 512);
  g.fillStyle = "#f4c21a";
  g.beginPath();
  g.arc(256, 256, 250, 0, Math.PI * 2);
  g.fill();
  drawMarkCanvas(g, 256, 256, 250, "#1a1a1a");
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** The mark and "THE NEW" in yellow on clear, as embroidered on the back of every hall chair. */
export function chairLogo() {
  const [c, g] = canvas(256, 256);
  drawMarkCanvas(g, 128, 104, 84, "#f2c230");
  g.fillStyle = "#f2c230";
  g.font = "800 34px sans-serif";
  g.textAlign = "center";
  g.fillText("THE NEW", 128, 232);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Yellow roof graphic: the mark and "THE NEW", painted on the blue sheeting. */
export function roofGraphic() {
  const [c, g] = canvas(1024, 2048);
  drawMark(g, 512, 620, 330, "#f6d23a");
  g.fillStyle = "#f6d23a";
  g.font = "900 230px sans-serif";
  g.textAlign = "center";
  g.save();
  g.translate(512, 1450);
  g.fillText("THE NEW", 0, 80);
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  return t;
}

const PX = 34; // pixels per metre for the yard plan

/**
 * Asphalt for the whole front yard (x across the plot, z from the façade to the Acme Road
 * wall) with bay lines, the basketball half-court, painted logo and yellow walk lines.
 */
export function yardPlan() {
  const W = Math.round((PLOT.x1 - PLOT.x0) * PX);
  const H = Math.round((PLOT.z1 - HALL.z1) * PX);
  const [c, g] = canvas(W, H);
  const X = (x: number) => (x - PLOT.x0) * PX;
  const Z = (z: number) => (z - HALL.z1) * PX;
  g.fillStyle = "#57585a";
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < W * H * 0.02; i++) {
    const v = 70 + Math.random() * 40;
    g.fillStyle = `rgba(${v},${v},${v},0.5)`;
    g.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }
  for (let i = 0; i < 18; i++) {
    g.fillStyle = `rgba(30,30,30,${0.06 + Math.random() * 0.1})`;
    g.beginPath();
    g.ellipse(Math.random() * W, Math.random() * H, 20 + Math.random() * 80, 10 + Math.random() * 40, Math.random() * 3, 0, Math.PI * 2);
    g.fill();
  }
  // the forecourt walk: from the vehicle gate straight to the main doors, edged in yellow
  g.fillStyle = "rgba(150,40,46,0.85)";
  g.fillRect(X(MAIN_DOOR.x - 3), Z(HALL.z1), 6 * PX, (43.5 - HALL.z1) * PX);
  g.strokeStyle = "#f2c230";
  g.lineWidth = 0.14 * PX;
  g.strokeRect(X(MAIN_DOOR.x - 3), Z(HALL.z1), 6 * PX, (43.5 - HALL.z1) * PX);
  // basketball half-court against the west wall: concrete, yellow lines, the logo mid-court
  g.fillStyle = "rgba(170,172,175,0.55)";
  g.fillRect(X(COURT.x0), Z(COURT.z0), (COURT.x1 - COURT.x0) * PX, (COURT.z1 - COURT.z0) * PX);
  g.strokeStyle = "#f2c230";
  g.lineWidth = 0.1 * PX;
  g.strokeRect(X(COURT.x0), Z(COURT.z0), (COURT.x1 - COURT.x0) * PX, (COURT.z1 - COURT.z0) * PX);
  const midZ = Z((COURT.z0 + COURT.z1) / 2);
  const hoopX = X(COURT.x1 - 1.6);
  g.strokeRect(X(COURT.x1 - 5.8), midZ - 2.45 * PX, 5.8 * PX, 4.9 * PX);
  g.beginPath();
  g.arc(hoopX, midZ, 6.75 * PX, Math.PI / 2 + 0.12, Math.PI * 1.5 - 0.12);
  g.stroke();
  g.beginPath();
  g.arc(X(COURT.x1 - 5.8), midZ, 1.8 * PX, Math.PI / 2, Math.PI * 1.5);
  g.stroke();
  g.beginPath();
  g.arc(X(COURT.x0), midZ, 1.8 * PX, -Math.PI / 2, Math.PI / 2);
  g.stroke();
  drawMark(g, X(COURT.x0 + 3.4), midZ - 1.2 * PX, 1.3 * PX, "#f2c230");
  g.save();
  g.translate(X(COURT.x0 + 3.4), midZ + 1.5 * PX);
  g.fillStyle = "#f2c230";
  g.font = `900 ${0.9 * PX}px sans-serif`;
  g.textAlign = "center";
  g.fillText("THE NEW", 0, 0.3 * PX);
  g.restore();
  // yellow pedestrian walk lines from the gate to the doors
  g.strokeStyle = "#f2c230";
  g.lineWidth = 0.15 * PX;
  for (const off of [-1.2, 1.2]) {
    g.beginPath();
    g.moveTo(X(4.35 + off), Z(PAVERS.z0));
    g.lineTo(X(4.35 + off), Z(26));
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  return t;
}

/** Leaf texture for palm fronds: a midrib with leaflets, alpha-cut. */
export function frondTexture() {
  const [c, g] = canvas(128, 512);
  g.clearRect(0, 0, 128, 512);
  g.strokeStyle = "#5d6b2a";
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(64, 512);
  g.lineTo(64, 0);
  g.stroke();
  for (let y = 10; y < 500; y += 9) {
    const t = y / 512;
    const len = 58 * Math.sin(t * Math.PI) + 6;
    for (const s of [-1, 1]) {
      const shade = 70 + Math.random() * 40;
      g.strokeStyle = `rgb(${shade * 0.55},${shade + 30},${shade * 0.35})`;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(64, y);
      g.quadraticCurveTo(64 + s * len * 0.6, y - 6, 64 + s * len, y + 14);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Palm trunk bark with growth rings (tile = 1 m). */
export function palmBark() {
  const [c, g] = canvas(64, 128);
  g.fillStyle = "#7a6a55";
  g.fillRect(0, 0, 64, 128);
  for (let y = 0; y < 128; y += 10) {
    g.fillStyle = "rgba(40,30,20,0.45)";
    g.fillRect(0, y, 64, 3);
    g.fillStyle = "rgba(255,240,220,0.08)";
    g.fillRect(0, y + 3, 64, 2);
  }
  return tex(c, [2, 6]);
}
