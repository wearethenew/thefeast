import * as THREE from "three";
import { BREAKOUTS, breakoutName } from "../data/breakouts";

// The paper on the ushers' clipboards (and on the breakout table): a printed breakout consent form,
// drawn once and shared.

let tex: THREE.CanvasTexture | null = null;

export function BREAKOUT_FORM() {
  if (tex) return tex;
  const W = 400, H = 540;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const x = c.getContext("2d")!;
  x.fillStyle = "#f6f3ea";
  x.fillRect(0, 0, W, H);
  const ink = "#23232b";
  // heading
  x.fillStyle = "#e0a21f";
  x.fillRect(28, 26, W - 56, 6);
  x.fillStyle = ink;
  x.textAlign = "center";
  x.font = "bold 15px Arial, sans-serif";
  x.fillText("THE FEAST 2026 · THE TORCH", W / 2, 58);
  x.font = "bold 27px Arial, sans-serif";
  x.fillText("BREAKOUT CONSENT FORM", W / 2, 92);
  x.font = "15px Arial, sans-serif";
  x.fillStyle = "#555";
  x.fillText("Saturday 12 December · Onsite only", W / 2, 116);
  // fields
  x.textAlign = "left";
  x.fillStyle = ink;
  x.font = "bold 16px Arial, sans-serif";
  const field = (label: string, y: number) => {
    x.fillText(label, 32, y);
    const w = x.measureText(label).width;
    x.fillRect(32 + w + 8, y + 3, W - 64 - w - 8, 1.5);
  };
  field("Name", 156);
  field("Ticket ID", 190);
  // the sessions, to tick one
  x.font = "bold 15px Arial, sans-serif";
  x.fillText("Tick ONE session:", 32, 230);
  x.font = "16px Arial, sans-serif";
  BREAKOUTS.forEach((b, i) => {
    const y = 262 + i * 30;
    x.strokeStyle = ink;
    x.lineWidth = 2;
    x.strokeRect(36, y - 14, 16, 16);
    x.fillText(b.tag === b.name || b.ages ? breakoutName(b) : `${b.name} (${b.tag})`, 62, y);
  });
  // a tick in one of them, already filled in
  x.strokeStyle = "#1d3fb8";
  x.lineWidth = 3;
  x.beginPath();
  x.moveTo(38, 288);
  x.lineTo(44, 295);
  x.lineTo(55, 279);
  x.stroke();
  // consent and signature
  x.fillStyle = "#444";
  x.font = "13px Arial, sans-serif";
  const lines = ["I agree to attend the session I have chosen and", "consent to The New Church contacting me about it."];
  lines.forEach((l, i) => x.fillText(l, 32, 432 + i * 18));
  x.fillStyle = ink;
  x.font = "bold 16px Arial, sans-serif";
  field("Signature", 492);
  x.fillText("Date", 32, 522);
  x.fillRect(80, 525, 120, 1.5);
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
