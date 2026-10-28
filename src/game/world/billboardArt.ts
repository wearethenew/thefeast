import * as THREE from "three";

// Artwork for the big roadside boards, drawn on canvas in the Feast's poster style.

const cache = new Map<string, Promise<THREE.CanvasTexture>>();

function fontFamily() {
  const v = getComputedStyle(document.body).getPropertyValue("--font-display").trim();
  return v || "Montserrat, system-ui, sans-serif";
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
}

function bg(g: CanvasRenderingContext2D, W: number, H: number) {
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "#0a1f8f");
  grad.addColorStop(0.55, "#1c46d8");
  grad.addColorStop(1, "#071460");
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // warm flare, like the posters
  const flare = g.createRadialGradient(W * 0.72, H * 0.05, 0, W * 0.72, H * 0.05, W * 0.45);
  flare.addColorStop(0, "rgba(255,200,120,0.75)");
  flare.addColorStop(1, "rgba(255,150,60,0)");
  g.fillStyle = flare;
  g.fillRect(0, 0, W, H);
}

function gold(g: CanvasRenderingContext2D, y0: number, y1: number) {
  const grad = g.createLinearGradient(0, y0, 0, y1);
  grad.addColorStop(0, "#fff3c4");
  grad.addColorStop(0.4, "#f6c35a");
  grad.addColorStop(0.65, "#c98a22");
  grad.addColorStop(1, "#f8d785");
  return grad;
}

export type ArtKind = "joy" | "feast-wide" | "torch" | "joy-tall";

async function draw(kind: ArtKind) {
  await document.fonts.ready;
  const F = fontFamily();
  const wide = kind !== "joy-tall";
  const W = wide ? 2048 : 1024;
  const H = wide ? 680 : 1280;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  bg(g, W, H);
  g.textBaseline = "alphabetic";

  if (kind === "joy" || kind === "joy-tall") {
    g.fillStyle = "rgba(255,255,255,0.85)";
    g.font = `600 ${wide ? 44 : 46}px ${F}`;
    g.textAlign = "center";
    g.fillText("THE NEW CHURCH", W / 2, wide ? 110 : 170);
    const lines = wide ? ["WE BRING GREAT JOY", "TO THE CITY"] : ["WE BRING", "GREAT JOY", "TO THE", "CITY"];
    const size = wide ? 190 : 170;
    lines.forEach((l, i) => {
      const y = (wide ? 300 : 400) + i * size * 1.02;
      g.fillStyle = gold(g, y - size, y);
      g.font = `900 ${size}px ${F}`;
      g.fillText(l, W / 2, y);
    });
    g.fillStyle = "#ffffff";
    g.font = `700 ${wide ? 40 : 42}px ${F}`;
    g.fillText("THE FEAST 2026 · DEC 11–13 · THE FUSION CENTRE, OGBA", W / 2, H - (wide ? 60 : 90));
  } else if (kind === "feast-wide") {
    const posters = await Promise.all(["/posters/shola.jpg", "/posters/sunmisola.jpg", "/posters/kaestrings.jpg"].map(loadImage));
    // three minister cut-outs on the right, title on the left
    posters.forEach((p, i) => {
      const w = 420;
      const x = W - (3 - i) * (w - 40) - 30;
      g.save();
      g.beginPath();
      g.rect(x, 0, w - 50, H);
      g.clip();
      g.drawImage(p, 0, p.height * 0.28, p.width, p.height * 0.72, x - 60, 40, (p.width / p.height) * (H - 40) * 1.4, (H - 40) * 1.4 * 0.72);
      g.restore();
    });
    g.textAlign = "left";
    g.fillStyle = "#ffffff";
    g.font = `600 52px ${F}`;
    g.fillText("T H E   F E A S T", 80, 140);
    g.fillStyle = gold(g, 180, 400);
    g.font = `900 250px ${F}`;
    g.fillText("TORCH", 70, 390);
    g.fillStyle = "#ffffff";
    g.font = `800 62px ${F}`;
    g.fillText("Dec 11th – 13th, 2026", 84, 500);
    g.font = `600 40px ${F}`;
    g.fillText("The Fusion Centre · 60A Surulere Industrial Ave, Ogba", 84, 570);
  } else {
    g.textAlign = "center";
    g.fillStyle = gold(g, 120, 360);
    g.font = `900 220px ${F}`;
    g.fillText("LIGHT YOUR", W * 0.38, 300);
    g.fillText("TORCH", W * 0.38, 520);
    g.fillStyle = "#ffffff";
    g.font = `700 46px ${F}`;
    g.fillText("THE FEAST 2026 · THE FUSION CENTRE, OGBA", W * 0.38, 620);
  }
  // LED pixel grid for close-up realism
  g.fillStyle = "rgba(0,0,0,0.12)";
  for (let x = 0; x < W; x += 4) g.fillRect(x, 0, 1, H);
  for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function billboardArt(kind: ArtKind) {
  if (!cache.has(kind)) cache.set(kind, draw(kind));
  return cache.get(kind)!;
}
