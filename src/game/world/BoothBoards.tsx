"use client";

import { Html } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import { useGame } from "../store";
import { BoardContext, BoothPanels } from "../ui/BoothPanels";
import { sheetForms, useSheetForms } from "../ui/useSmallScreen";
import { COMPOUND, TENTS, boothBoard, toWorld, type Booth } from "./compound";

// Each booth's display board: tapping a booth's button flies the camera in to it, and the form
// (register, pre-order, the WEND game, the help desks) is on the board, in the world.

/** Form size on the board, in CSS pixels. */
const PX: Record<string, [number, number]> = { register: [560, 780], merch: [780, 640], game: [660, 780], travel: [720, 760], lodging: [720, 760] };
const px = (id: string) => PX[id] ?? [520, 560];
const BOTTOM = 0.55;

/** The board's size in metres for a booth. */
export function boardSize(id: string): [number, number] {
  const [w, h] = px(id);
  const W = id === "register" || id === "merch" ? 3.4 : 2.9;
  return [W, (W * h) / w];
}

/** Where the camera goes to read a booth's board: centred on it, square on, filling the screen. */
export function boardView(t: Booth, vfov: number, aspect: number) {
  const [bx, bz, face] = boothBoard(t);
  const [W, H] = boardSize(t.id);
  const v = THREE.MathUtils.degToRad(vfov);
  const hf = 2 * Math.atan(Math.tan(v / 2) * aspect);
  const dist = Math.max(H / (2 * Math.tan(v / 2)), W / (2 * Math.tan(hf / 2))) * 1.1;
  const nx = Math.sin(face), nz = Math.cos(face);
  const cy = BOTTOM + H / 2;
  const c = toWorld(bx, bz);
  const e = toWorld(bx + nx * dist, bz + nz * dist);
  return { pos: new THREE.Vector3(e.x, cy + 0.15, e.z), look: new THREE.Vector3(c.x, cy, c.z) };
}

const frame = new THREE.MeshStandardMaterial({ color: "#14151a", roughness: 0.5, metalness: 0.4 });

function boardFace(title: string, sub: string) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 700;
  const g = c.getContext("2d")!;
  // The New's look: flat black, a yellow rule, the title in the serif caps, a mono line under it
  const css = getComputedStyle(document.body);
  const head = css.getPropertyValue("--font-head").trim() || "Georgia, serif";
  const mono = css.getPropertyValue("--font-label").trim() || "monospace";
  g.fillStyle = "#000000";
  g.fillRect(0, 0, 512, 700);
  g.fillStyle = "#ffc634";
  g.fillRect(56, 214, 400, 5);
  g.textAlign = "center";
  g.font = `400 66px ${head}`;
  g.fillText(title.toUpperCase(), 256, 300, 440);
  g.fillStyle = "#ffffff";
  g.font = `500 22px ${mono}`;
  g.fillText(sub.toUpperCase(), 256, 362, 440);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function Board({ t, open: wanted }: { t: Booth; open: boolean }) {
  // on phones the form opens as a sheet over the screen instead (see Game's PhonePanel)
  const small = useSheetForms();
  const open = wanted && !small;
  const [W, H] = boardSize(t.id);
  const [pw, ph] = px(t.id);
  const [bx, bz, facing] = boothBoard(t);
  const face = useMemo(() => boardFace(t.id === "register" ? "REGISTER HERE" : t.id === "merch" ? "PRE-ORDER HERE" : t.label.toUpperCase(), "Tap the button to open"), [t]);
  const big = t.id === "register" || t.id === "merch";
  // the small booths' boards only stand up while their form is open
  if (!big && !open) return null;
  return (
    <group position={[bx, 0, bz]} rotation-y={facing}>
      {[-1, 1].map((k) => (
        <mesh key={k} position={[k * (W / 2 + 0.06), (BOTTOM + H + 0.1) / 2, -0.06]} material={frame} castShadow>
          <boxGeometry args={[0.1, BOTTOM + H + 0.1, 0.1]} />
        </mesh>
      ))}
      <mesh position={[0, BOTTOM + H / 2, -0.08]} material={frame} castShadow>
        <boxGeometry args={[W + 0.18, H + 0.18, 0.08]} />
      </mesh>
      {!open && (
        <mesh position={[0, BOTTOM + H / 2, -0.03]}>
          <planeGeometry args={[W, H]} />
          <meshStandardMaterial map={face} emissiveMap={face} emissive="#ffffff" emissiveIntensity={0.45} toneMapped={false} />
        </mesh>
      )}
      {open && (
        <Html transform position={[0, BOTTOM + H / 2, 0]} scale={(W / pw) * 40} zIndexRange={[30, 20]}>
          <BoardContext.Provider value={true}>
            <div style={{ width: pw, height: ph }}>
              <BoothPanels id={t.id} />
            </div>
          </BoardContext.Provider>
        </Html>
      )}
    </group>
  );
}

/** Tap targets over the booths: tapping a booth, its board or its sign opens its form. */
const tapMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });

export function BoothBoards() {
  const panel = useGame((s) => s.panel);
  const stage = useGame((s) => s.stage);
  const inHall = useGame((s) => s.zone === "hall");
  const set = useGame((s) => s.set);
  if (stage !== "title" && stage !== "venue") return null;
  return (
    <group position={[COMPOUND.center[0], 0, COMPOUND.center[1]]} rotation-y={COMPOUND.rotation}>
      {TENTS.map((t) => (
        <Board key={t.id} t={t} open={panel === t.id} />
      ))}
      {/* the booths themselves, tappable (not while a form's open, nor from inside the hall) */}
      {!panel &&
        !inHall &&
        TENTS.map((t) => {
          const along = Math.abs(Math.sin(t.face)) > 0.5;
          const [bx, bz] = boothBoard(t);
          const big = t.id === "register" || t.id === "merch";
          return (
            <group key={"tap-" + t.id}>
              <mesh
                position={[t.x, (big ? 7 : 4) / 2, t.z]}
                material={tapMat}
                onClick={(e) => {
                  // a tap, not the end of a drag to look around
                  if (e.delta > 8) return;
                  e.stopPropagation();
                  set({ panel: t.id });
                }}
                onPointerOver={() => (document.body.style.cursor = "pointer")}
                onPointerOut={() => (document.body.style.cursor = "")}
              >
                <boxGeometry args={[(along ? t.d : t.w) + 0.6, big ? 7 : 4, (along ? t.w : t.d) + 0.6]} />
              </mesh>
              {big && (
                <mesh
                  position={[bx, BOTTOM + boardSize(t.id)[1] / 2, bz]}
                  rotation-y={boothBoard(t)[2]}
                  material={tapMat}
                  onClick={(e) => {
                    if (e.delta > 8) return;
                    e.stopPropagation();
                    set({ panel: t.id });
                  }}
                  onPointerOver={() => (document.body.style.cursor = "pointer")}
                  onPointerOut={() => (document.body.style.cursor = "")}
                >
                  <boxGeometry args={[boardSize(t.id)[0] + 0.3, boardSize(t.id)[1] + BOTTOM, 0.4]} />
                </mesh>
              )}
            </group>
          );
        })}
    </group>
  );
}

/** Ease the camera from wherever the scene wants it to a booth's board while a form is open. */
export function useBoardZoom() {
  const state = useMemo(() => ({ k: 0, pos: new THREE.Vector3(), look: new THREE.Vector3() }), []);
  return (camera: THREE.PerspectiveCamera, dt: number, wantPos: THREE.Vector3, wantLook: THREE.Vector3) => {
    const id = useGame.getState().panel;
    const t = sheetForms() ? undefined : TENTS.find((b) => b.id === id);
    state.k = THREE.MathUtils.clamp(state.k + (t ? dt : -dt) * 1.4, 0, 1);
    if (t) {
      const v = boardView(t, camera.fov, camera.aspect);
      state.pos.copy(v.pos);
      state.look.copy(v.look);
    }
    if (state.k <= 0) return;
    const e = state.k * state.k * (3 - 2 * state.k);
    wantPos.lerp(state.pos, e);
    wantLook.lerp(state.look, e);
  };
}
