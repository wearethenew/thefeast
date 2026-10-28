"use client";

import { useMemo } from "react";
import * as THREE from "three";
import type { Booth } from "./compound";
import { Text } from "@react-three/drei";
import { MERCH } from "../data/merch";
import { foldedTeeTexture, merchTexture } from "./merchTextures";

// The two big booths on the forecourt, built like real event structures: a branded registration
// pavilion with four counters and queue lanes, and a merch store with racks, tables and a till.
// Local frame: +z is the booth's front (toward the people), x runs across its width.

function backdrop(title: string, sub: string, from: string, to: string) {
  const c = document.createElement("canvas");
  c.width = 2048;
  c.height = 640;
  const g = c.getContext("2d")!;
  const grd = g.createLinearGradient(0, 0, 2048, 640);
  grd.addColorStop(0, from);
  grd.addColorStop(1, to);
  g.fillStyle = grd;
  g.fillRect(0, 0, 2048, 640);
  // soft flame glow
  const glow = g.createRadialGradient(1024, 700, 40, 1024, 700, 760);
  glow.addColorStop(0, "rgba(255,170,60,0.55)");
  glow.addColorStop(1, "rgba(255,170,60,0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, 2048, 640);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "#f6d06a";
  g.font = "900 190px sans-serif";
  g.fillText(title, 1024, 280, 1900);
  g.fillStyle = "#ffffff";
  g.font = "700 64px sans-serif";
  g.fillText(sub, 1024, 470, 1900);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const black = new THREE.MeshStandardMaterial({ color: "#16171b", roughness: 0.5, metalness: 0.4 });
const white = new THREE.MeshStandardMaterial({ color: "#f4f2ec", roughness: 0.6 });
const gold = new THREE.MeshStandardMaterial({ color: "#e0a92e", roughness: 0.35, metalness: 0.6 });
const deck = new THREE.MeshStandardMaterial({ color: "#3a2e28", roughness: 0.8 });

function Frame({ w, d, h }: { w: number; d: number; h: number }) {
  return (
    <>
      <mesh position={[0, 0.12, 0]} material={deck} receiveShadow castShadow>
        <boxGeometry args={[w, 0.24, d]} />
      </mesh>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={sx + "," + sz} position={[sx * (w / 2 - 0.15), h / 2, sz * (d / 2 - 0.15)]} material={black} castShadow>
            <boxGeometry args={[0.22, h, 0.22]} />
          </mesh>
        )),
      )}
      {/* roof canopy */}
      <mesh position={[0, h + 0.1, 0]} material={white} castShadow receiveShadow>
        <boxGeometry args={[w + 0.8, 0.22, d + 0.8]} />
      </mesh>
    </>
  );
}

function Flag({ x, z, color }: { x: number; z: number; color: string }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position-y={2.6} material={black}>
        <cylinderGeometry args={[0.035, 0.035, 5.2, 6]} />
      </mesh>
      <mesh position={[0.32, 3.3, 0]}>
        <boxGeometry args={[0.62, 3.2, 0.02]} />
        <meshStandardMaterial color={color} roughness={0.7} emissive={color} emissiveIntensity={0.25} />
      </mesh>
    </group>
  );
}

/** Get your Torch: the registration pavilion. */
export function RegistrationPavilion({ t }: { t: Booth }) {
  const { w, d } = t;
  const h = 4.4;
  const back = useMemo(() => backdrop("GET YOUR TORCH", "Register for The Feast 2026 · 11–13 December", "#0d1f8a", "#7d0f22"), []);
  const counters = [-4.6, -1.55, 1.55, 4.6];
  return (
    <group position={[t.x, 0, t.z]} rotation-y={t.face}>
      <Frame w={w} d={d} h={h} />
      {/* the branded back wall */}
      <mesh position={[0, 2.5, -d / 2 + 0.2]} material={black} castShadow>
        <boxGeometry args={[w - 0.3, 4.2, 0.25]} />
      </mesh>
      <mesh position={[0, 2.6, -d / 2 + 0.34]}>
        <planeGeometry args={[w - 0.8, (w - 0.8) * (640 / 2048)]} />
        <meshStandardMaterial map={back} emissiveMap={back} emissive="#ffffff" emissiveIntensity={0.55} toneMapped={false} />
      </mesh>
      {/* the sign across the roof edge */}
      <group position={[0, h + 0.75, d / 2 + 0.38]}>
        <mesh material={black}>
          <boxGeometry args={[w * 0.7, 1.1, 0.18]} />
        </mesh>
        <Text position={[0, 0, 0.1]} fontSize={0.62} anchorX="center" anchorY="middle" letterSpacing={0.08}>
          🔥 GET YOUR TORCH
          <meshBasicMaterial color={[2.4, 1.9, 0.9]} toneMapped={false} />
        </Text>
      </group>
      {/* four counters, gold fronts, a screen on each */}
      {counters.map((x) => (
        <group key={x} position={[x, 0, d / 2 - 0.55]}>
          <mesh position-y={0.62} material={white} castShadow>
            <boxGeometry args={[2.3, 1.0, 0.7]} />
          </mesh>
          <mesh position={[0, 0.62, 0.36]} material={gold}>
            <boxGeometry args={[2.32, 0.8, 0.02]} />
          </mesh>
          <mesh position={[0, 1.35, -0.1]} rotation-x={-0.35} material={black}>
            <boxGeometry args={[0.7, 0.45, 0.04]} />
          </mesh>
        </group>
      ))}
      {/* queue lanes: stanchions and red ropes out from each counter */}
      {counters.map((x) =>
        [-0.75, 0.75].map((dx) =>
          [0.8, 2.4, 4.0].map((z) => (
            <mesh key={x + "," + dx + "," + z} position={[x + dx, 0.5, d / 2 + z]} material={gold}>
              <cylinderGeometry args={[0.04, 0.06, 1.0, 8]} />
            </mesh>
          )),
        ),
      )}
      {counters.map((x) =>
        [-0.75, 0.75].map((dx) => (
          <mesh key={"r" + x + dx} position={[x + dx, 0.9, d / 2 + 2.4]} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.025, 0.025, 3.2, 6]} />
            <meshStandardMaterial color="#b3121f" roughness={0.6} />
          </mesh>
        )),
      )}
      {[-w / 2 - 0.6, w / 2 + 0.6].map((x, i) => (
        <Flag key={x} x={x} z={d / 2 + 0.6} color={i ? "#f4c21a" : "#1438b8"} />
      ))}
    </group>
  );
}

/** Feast Merch: the store, with the range face-out on gridwalls, folded stacks, caps and a till. */
export function MerchStore({ t }: { t: Booth }) {
  const { w, d } = t;
  const h = 4.0;
  const back = useMemo(() => backdrop("FEAST MERCH", "The Torch collection · pre-order now", "#7d0f22", "#e8336d"), []);
  const wall = -d / 2 + 0.5;
  // what hangs on the two gridwalls either side of the banner: [item, colour, row]
  const hung = useMemo(() => {
    const [tee, hoodie, cap, tote] = MERCH;
    return [
      // every tee print, in each colour, and the hoodies under them
      { x: -4.1, items: [[tee, 0, 0], [tee, 1, 1], [tee, 2, 2], [hoodie, 0, 0], [hoodie, 1, 0], [hoodie, 0, 0]] },
      { x: 4.1, items: [[tee, 2, 1], [tote, 0, 0], [tee, 0, 2], [cap, 0, 0], [cap, 1, 0], [cap, 2, 0]] },
    ].map((g) =>
      g.items.map(([item, c, design], i) => {
        const m = item as (typeof MERCH)[number];
        const small = m.id === "cap";
        // life size: a tee is about 0.75 m across (its art fills ~70% of the square), so it reads
        // right next to the people and their torches
        const size = small ? 0.62 : m.id === "hoodie" ? 1.3 : m.id === "tote" ? 1.0 : 1.15;
        return { x: g.x + ((i % 3) - 1) * 1.02, y: i < 3 ? 2.25 : 1.05, size, tex: merchTexture(m.id, m.colors[c as number].hex, design as number) };
      }),
    ).flat();
  }, []);
  const stacks = useMemo(() => MERCH[0].colors.map((c) => foldedTeeTexture(c.hex)), []);
  return (
    <group position={[t.x, 0, t.z]} rotation-y={t.face}>
      <Frame w={w} d={d} h={h} />
      <mesh position={[0, 2.3, -d / 2 + 0.2]} material={black} castShadow>
        <boxGeometry args={[w - 0.3, 3.8, 0.25]} />
      </mesh>
      <mesh position={[0, 2.5, -d / 2 + 0.34]}>
        <planeGeometry args={[4.6, 4.6 * (640 / 2048)]} />
        <meshStandardMaterial map={back} emissiveMap={back} emissive="#ffffff" emissiveIntensity={0.55} toneMapped={false} />
      </mesh>
      <group position={[0, h + 0.7, d / 2 + 0.38]}>
        <mesh material={black}>
          <boxGeometry args={[w * 0.6, 1.0, 0.18]} />
        </mesh>
        <Text position={[0, 0, 0.1]} fontSize={0.55} anchorX="center" anchorY="middle" letterSpacing={0.08}>
          PRE-ORDER YOUR MERCH
          <meshBasicMaterial color={[2.4, 1.9, 0.9]} toneMapped={false} />
        </Text>
      </group>
      {/* gridwalls: a white wire grid on legs, the range hung face-out on it */}
      {[-4.1, 4.1].map((x) => (
        <group key={x} position={[x, 0, wall]}>
          {[-1.55, 1.55].map((dx) => (
            <mesh key={dx} position={[dx, 1.45, 0]} material={white}>
              <boxGeometry args={[0.05, 2.9, 0.05]} />
            </mesh>
          ))}
          <Grid w={3.1} h={2.5} y={1.6} />
          {/* the store's own lights over each wall */}
          <mesh position={[0, 3.05, 0.25]} material={black}>
            <boxGeometry args={[3.0, 0.08, 0.12]} />
          </mesh>
          <pointLight position={[0, 2.9, 0.9]} intensity={3} distance={4} color="#fff2dc" />
        </group>
      ))}
      {hung.map((g, i) => (
        <group key={i} position={[g.x, g.y, wall + 0.06]}>
          {/* the hook it hangs from */}
          <mesh position={[0, g.size / 2 - 0.02, 0.02]} material={gold}>
            <boxGeometry args={[0.02, 0.02, 0.1]} />
          </mesh>
          <mesh>
            <planeGeometry args={[g.size, g.size]} />
            <meshStandardMaterial map={g.tex} transparent alphaTest={0.05} roughness={0.9} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
      {/* display tables: folded tee stacks on one, caps and wristbands on the other */}
      {[-1.9, 1.9].map((x) => (
        <mesh key={x} position={[x, 0.45, 0.6]} material={white} castShadow receiveShadow>
          <boxGeometry args={[1.8, 0.9, 0.9]} />
        </mesh>
      ))}
      {stacks.map((tex, i) => (
        <FoldedStack key={i} x={-1.9 + (i - 1) * 0.55} z={0.6} color={MERCH[0].colors[i].hex} tex={tex} n={4 + i} />
      ))}
      {MERCH[2].colors.flatMap((c, i) => [0, 1].map((k) => <CapModel key={i + "-" + k} x={1.45 + i * 0.36} z={0.42 + k * 0.38} color={c.hex} />))}
      {MERCH[4].colors.flatMap((c, i) => [0, 1, 2].map((k) => (
        <mesh key={i + "-" + k} position={[2.55 + (k - 1) * 0.11, 0.915 + i * 0.012, 0.55 + i * 0.16]} rotation-x={Math.PI / 2}>
          <torusGeometry args={[0.04, 0.008, 8, 24]} />
          <meshStandardMaterial color={c.hex} roughness={0.35} emissive={c.hex} emissiveIntensity={0.15} />
        </mesh>
      )))}
      <group position={[0, 0, d / 2 - 0.55]}>
        <mesh position-y={0.6} material={white} castShadow>
          <boxGeometry args={[2.2, 1.0, 0.7]} />
        </mesh>
        <mesh position={[0, 0.6, 0.36]} material={gold}>
          <boxGeometry args={[2.22, 0.8, 0.02]} />
        </mesh>
      </group>
      {[-w / 2 - 0.6, w / 2 + 0.6].map((x, i) => (
        <Flag key={x} x={x} z={d / 2 + 0.6} color={i ? "#e8336d" : "#f4c21a"} />
      ))}
    </group>
  );
}

/** A white wire gridwall panel. */
function Grid({ w, h, y }: { w: number; h: number; y: number }) {
  const geo = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let x = -w / 2; x <= w / 2 + 1e-3; x += 0.1) pts.push(new THREE.Vector3(x, -h / 2, 0), new THREE.Vector3(x, h / 2, 0));
    for (let v = -h / 2; v <= h / 2 + 1e-3; v += 0.1) pts.push(new THREE.Vector3(-w / 2, v, 0), new THREE.Vector3(w / 2, v, 0));
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [w, h]);
  return (
    <lineSegments geometry={geo} position-y={y}>
      <lineBasicMaterial color="#d8d8d8" />
    </lineSegments>
  );
}

/** A stack of folded tees, the top one showing its print. */
function FoldedStack({ x, z, color, tex, n }: { x: number; z: number; color: string; tex: THREE.Texture; n: number }) {
  const t = 0.035;
  return (
    <group position={[x, 0.9, z]}>
      {Array.from({ length: n }, (_, i) => (
        <mesh key={i} position={[(((i * 7) % 3) - 1) * 0.006, t / 2 + i * t, (((i * 5) % 3) - 1) * 0.005]} castShadow>
          <boxGeometry args={[0.42, t * 0.96, 0.36]} />
          <meshStandardMaterial color={color} roughness={0.95} />
        </mesh>
      ))}
      <mesh position-y={n * t + 0.001} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[0.42, 0.36]} />
        <meshStandardMaterial map={tex} roughness={0.95} />
      </mesh>
    </group>
  );
}

/** A six-panel cap sitting on the table, peak forward, with the gold mark on the front. */
function CapModel({ x, z, color }: { x: number; z: number; color: string }) {
  return (
    <group position={[x, 0.9, z]} rotation-y={0.25}>
      <mesh position-y={0.005} scale={[1, 0.82, 1.08]} castShadow>
        <sphereGeometry args={[0.1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={color} roughness={0.85} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.008, 0.13]} scale={[1, 1, 0.75]} rotation-x={0.12}>
        <cylinderGeometry args={[0.095, 0.095, 0.008, 20, 1, false, -Math.PI / 2, Math.PI]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.088, 0]}>
        <sphereGeometry args={[0.009, 8, 6]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.045, 0.104]} rotation-x={-0.35}>
        <planeGeometry args={[0.07, 0.025]} />
        <meshStandardMaterial color="#f2b81f" metalness={0.4} roughness={0.4} />
      </mesh>
    </group>
  );
}
