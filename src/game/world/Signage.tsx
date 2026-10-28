"use client";

import { Text } from "@react-three/drei";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { Torch } from "../fx/Torch";
import { useGame } from "../store";
import { billboardArt, type ArtKind } from "./billboardArt";
import { busStops, insideBuilding, nearestRoad, routeAt, type LagosWorld, type Route } from "./lagosData";

// Roadside furniture along the route: overhead direction gantries before every turn and on long
// straights, LAMATA-style bus stops, wide LED billboards and "3D" corner billboards with a giant
// torch bursting out of the screen.

const GREEN = "#0b6b3a";

type Placement = { x: number; z: number; rot: number; width: number; s: number };

/** Point on the route at distance s, with its heading and the carriageway width there. */
function placeAt(world: LagosWorld, route: Route, s: number): Placement {
  const p = routeAt(route, s);
  const near = nearestRoad(world, p.x, p.z);
  return { x: p.x, z: p.z, rot: Math.atan2(p.dx, p.dz), width: near.road?.width ?? 8, s };
}

type Turn = { s: number; left: boolean; street: string };

function findTurns(world: LagosWorld, route: Route): Turn[] {
  const turns: Turn[] = [];
  for (let s = 60; s < route.length - 60; s += 10) {
    const a = routeAt(route, s - 25);
    const b = routeAt(route, s + 25);
    const turn = Math.atan2(a.dx * b.dz - a.dz * b.dx, a.dx * b.dx + a.dz * b.dz);
    if (Math.abs(turn) > 0.6 && (!turns.length || s - turns[turns.length - 1].s > 150)) {
      const after = routeAt(route, s + 60);
      const name = nearestRoad(world, after.x, after.z).road?.name ?? "";
      // left of travel is (dz, −dx): a positive cross means the road bends that way
      turns.push({ s, left: turn < 0, street: name });
    }
  }
  return turns;
}

function Arrow({ kind, ...props }: { kind: "up" | "left" | "right" } & React.ComponentProps<"group">) {
  const geo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-0.14, -0.6);
    s.lineTo(0.14, -0.6);
    s.lineTo(0.14, 0.1);
    s.lineTo(0.38, 0.1);
    s.lineTo(0, 0.6);
    s.lineTo(-0.38, 0.1);
    s.lineTo(-0.14, 0.1);
    s.closePath();
    return new THREE.ShapeGeometry(s);
  }, []);
  return (
    <group {...props}>
      <mesh geometry={geo} rotation-z={kind === "left" ? Math.PI / 4 : kind === "right" ? -Math.PI / 4 : 0}>
        <meshBasicMaterial color="#ffffff" toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/** Lagos sign style: short, upper-case road names. */
function signName(name: string) {
  return name
    .replace(/\bAvenue\b/i, "Ave")
    .replace(/\bRoad\b/i, "Rd")
    .replace(/\bStreet\b/i, "St")
    .replace(/\bExpressway\b/i, "Expy")
    .replace(/\bInternational\b/i, "Intl")
    .toUpperCase();
}

/** Overhead sign gantry spanning the carriageway. Faces the oncoming driver. */
function Gantry({ at, title, sub, arrow }: { at: Placement; title: string; sub: string; arrow: "up" | "left" | "right" }) {
  const half = at.width / 2 + 1.4;
  const panelW = Math.min(9, Math.max(6.5, at.width * 0.95));
  const textW = panelW - 2.3; // room right of the arrow
  // single line, shrunk to fit: bold caps are roughly 0.62 em wide
  const titleSize = Math.min(0.62, textW / (title.length * 0.62));
  const subSize = Math.min(0.4, textW / (sub.length * 0.56));
  return (
    <group position={[at.x, 0, at.z]} rotation-y={at.rot}>
      {[-half, half].map((x) => (
        <mesh key={x} position={[x, 3.6, 0]} castShadow>
          <cylinderGeometry args={[0.18, 0.22, 7.2, 10]} />
          <meshStandardMaterial color="#8f969e" metalness={0.8} roughness={0.35} />
        </mesh>
      ))}
      <mesh position={[0, 7.0, 0.25]} castShadow>
        <boxGeometry args={[half * 2 + 0.4, 0.35, 0.35]} />
        <meshStandardMaterial color="#8f969e" metalness={0.8} roughness={0.35} />
      </mesh>
      {/* panel over the carriageway, front facing −z (toward approaching traffic) */}
      <group position={[0, 6.55, 0]} rotation-y={Math.PI}>
        <mesh>
          <boxGeometry args={[panelW, 2.3, 0.12]} />
          <meshStandardMaterial color={GREEN} roughness={0.6} emissive={GREEN} emissiveIntensity={0.25} />
        </mesh>
        <mesh position-z={0.065}>
          <planeGeometry args={[panelW - 0.16, 2.14]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        <mesh position-z={0.07}>
          <planeGeometry args={[panelW - 0.32, 1.98]} />
          <meshStandardMaterial color={GREEN} emissive={GREEN} emissiveIntensity={0.3} />
        </mesh>
        <Arrow kind={arrow} position={[-panelW / 2 + 0.95, 0, 0.09]} scale={1.25} />
        <Text position={[-panelW / 2 + 1.9, 0.38, 0.09]} fontSize={titleSize} color="#ffffff" anchorX="left" anchorY="middle" fontWeight={700} whiteSpace="nowrap">
          {title}
        </Text>
        <Text position={[-panelW / 2 + 1.9, -0.45, 0.09]} fontSize={subSize} color="#ffe28a" anchorX="left" anchorY="middle" whiteSpace="nowrap">
          {sub}
        </Text>
      </group>
    </group>
  );
}

function BusStop({ at, name }: { at: Placement; name: string }) {
  const off = at.width / 2 + 3.2;
  return (
    <group position={[at.x, 0, at.z]} rotation-y={at.rot}>
      <group position={[-off, 0, 0]} rotation-y={-Math.PI / 2}>
        {[-1.8, 1.8].map((x) => (
          <mesh key={x} position={[x, 1.3, -0.6]}>
            <boxGeometry args={[0.1, 2.6, 0.1]} />
            <meshStandardMaterial color="#2b2f38" metalness={0.6} />
          </mesh>
        ))}
        <mesh position={[0, 2.65, -0.2]} castShadow>
          <boxGeometry args={[4.2, 0.12, 1.8]} />
          <meshStandardMaterial color="#f2b705" />
        </mesh>
        <mesh position={[0, 1.4, -0.95]}>
          <boxGeometry args={[4, 2.4, 0.05]} />
          <meshPhysicalMaterial color="#9fc3d8" transparent opacity={0.4} roughness={0.1} />
        </mesh>
        <mesh position={[0, 0.48, -0.6]}>
          <boxGeometry args={[3.2, 0.08, 0.45]} />
          <meshStandardMaterial color="#5a5f66" />
        </mesh>
        <group position={[2.4, 0, 0.3]}>
          <mesh position-y={1.6}>
            <cylinderGeometry args={[0.05, 0.05, 3.2, 8]} />
            <meshStandardMaterial color="#2b2f38" />
          </mesh>
          <mesh position={[0, 3.0, 0.03]}>
            <boxGeometry args={[1.3, 0.7, 0.05]} />
            <meshStandardMaterial color="#f2b705" />
          </mesh>
          <Text position={[0, 3.12, 0.07]} fontSize={0.2} color="#111" anchorX="center">
            BUS STOP
          </Text>
          <Text position={[0, 2.88, 0.07]} fontSize={0.11} color="#111" anchorX="center" maxWidth={1.2}>
            {name || "LAMATA"}
          </Text>
        </group>
      </group>
    </group>
  );
}

function useArt(kind: ArtKind) {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let live = true;
    billboardArt(kind).then((t) => live && setTex(t));
    return () => {
      live = false;
    };
  }, [kind]);
  return tex;
}

/** Wide LED billboard on a unipole, angled toward the road. */
function MegaBoard({ at, side, kind }: { at: Placement; side: 1 | -1; kind: ArtKind }) {
  const tex = useArt(kind);
  const tall = kind === "joy-tall";
  const W = tall ? 9 : 22;
  const H = tall ? 11.2 : 7.3;
  const off = at.width / 2 + 13;
  return (
    <group position={[at.x, 0, at.z]} rotation-y={at.rot}>
      <group position={[side * off, 0, 0]} rotation-y={Math.PI + side * 0.42}>
        <mesh position-y={7} castShadow>
          <cylinderGeometry args={[0.6, 0.8, 14, 14]} />
          <meshStandardMaterial color="#6b7078" metalness={0.7} roughness={0.4} />
        </mesh>
        <group position-y={14 + H / 2}>
          <mesh castShadow>
            <boxGeometry args={[W + 0.8, H + 0.8, 0.9]} />
            <meshStandardMaterial color="#111318" metalness={0.5} roughness={0.5} />
          </mesh>
          {tex && (
            <mesh position-z={0.46}>
              <planeGeometry args={[W, H]} />
              <meshStandardMaterial map={tex} emissive="#ffffff" emissiveMap={tex} emissiveIntensity={1.15} toneMapped={false} />
            </mesh>
          )}
          {/* catwalk + floodlights */}
          <mesh position={[0, -H / 2 - 0.55, 0.9]}>
            <boxGeometry args={[W, 0.12, 1.2]} />
            <meshStandardMaterial color="#2b2f38" />
          </mesh>
        </group>
      </group>
    </group>
  );
}

/** Corner "3D" LED billboard on a building with a giant torch breaking out of the screen. */
function TorchBillboard({ at, side }: { at: Placement; side: 1 | -1 }) {
  const tex = useArt("torch");
  const off = at.width / 2 + 18;
  const S = 14;
  return (
    <group position={[at.x, 0, at.z]} rotation-y={at.rot}>
      <group position={[side * off, 0, 0]} rotation-y={Math.PI + side * 0.785}>
        {/* the building it sits on */}
        <mesh position={[0, 6, -S / 2]} castShadow receiveShadow>
          <boxGeometry args={[S * 1.4, 12, S * 1.4]} />
          <meshStandardMaterial color="#d7cbb6" roughness={0.85} />
        </mesh>
        {/* two LED faces meeting at the corner */}
        {[-1, 1].map((f) => (
          <group key={f} position={[f * S * 0.35, 12 + S * 0.32, -S * 0.35]} rotation-y={f * Math.PI / 4}>
            <mesh>
              <boxGeometry args={[S, S * 0.62, 0.5]} />
              <meshStandardMaterial color="#0c0d12" />
            </mesh>
            {tex && (
              <mesh position-z={0.26}>
                <planeGeometry args={[S - 0.4, S * 0.62 - 0.4]} />
                <meshStandardMaterial map={tex} emissive="#ffffff" emissiveMap={tex} emissiveIntensity={1.1} toneMapped={false} />
              </mesh>
            )}
          </group>
        ))}
        {/* the torch bursts out of the corner toward the road */}
        <group position={[0, 12 + S * 0.25, 1.5]} rotation={[0.55, 0, side * 0.15]}>
          <Torch scale={26} lightIntensity={0} light={false} />
          <pointLight position={[0, 9, 1]} intensity={900} distance={70} color="#ff9a3c" decay={1.6} />
        </group>
      </group>
    </group>
  );
}

export function Signage({ world }: { world: LagosWorld }) {
  const routeKey = useGame((s) => s.route);
  const route = world.routes[routeKey];
  const items = useMemo(() => {
    const turns = findTurns(world, route);
    const gantries: { at: Placement; title: string; sub: string; arrow: "up" | "left" | "right" }[] = [];
    const fmt = (m: number) => (m < 1000 ? `${Math.round(m / 50) * 50} m` : `${(m / 1000).toFixed(1)} km`);
    const clear = (s: number) => gantries.every((g) => Math.abs(g.at.s - s) > 280);
    for (const t of turns) {
      const s = t.s - 170;
      if (s < 80 || !clear(s)) continue;
      const remaining = route.length - t.s;
      gantries.push({
        at: placeAt(world, route, s),
        title: signName(t.street || (remaining < 900 ? "Surulere Industrial Ave" : "Ogba")),
        sub: `200 m · Fusion Centre ${fmt(remaining)}`,
        arrow: t.left ? "left" : "right",
      });
    }
    // reassurance signs on the straights
    for (let s = 400; s < route.length - 400; s += 850) {
      if (!clear(s)) continue;
      const remaining = route.length - s;
      const toward = remaining > 3200 ? "IKEJA · ALLEN AVE" : remaining > 1600 ? "OGBA · ACME RD" : "OGBA";
      gantries.push({ at: placeAt(world, route, s), title: toward, sub: `Fusion Centre ${fmt(remaining)}`, arrow: "up" });
    }
    const stops: { at: Placement; name: string }[] = [];
    for (const s of busStops(route)) {
      const at = placeAt(world, route, s);
      stops.push({ at, name: nearestRoad(world, at.x, at.z).road?.name ?? "" });
    }
    const boards: { at: Placement; side: 1 | -1; kind: ArtKind }[] = [];
    const kinds: ArtKind[] = ["feast-wide", "joy", "torch", "joy-tall", "feast-wide", "joy"];
    let k = 0;
    for (let s = 220; s < route.length - 300; s += 480) {
      const at = placeAt(world, route, s);
      const side = (k % 2 ? 1 : -1) as 1 | -1;
      // keep the board's foot out of buildings
      const off = at.width / 2 + 13;
      const fx = Math.sin(at.rot), fz = Math.cos(at.rot);
      const bx = at.x - fz * off * side * -1, bz = at.z + fx * off * side * -1;
      if (insideBuilding(world, bx, bz)) {
        k++;
        continue;
      }
      boards.push({ at, side, kind: kinds[k % kinds.length] });
      k++;
    }
    const torches = [Math.min(900, route.length * 0.25), route.length * 0.62].map((s, i) => ({ at: placeAt(world, route, s), side: (i % 2 ? -1 : 1) as 1 | -1 }));
    return { gantries, stops, boards, torches };
  }, [world, route]);

  return (
    <group>
      {items.gantries.map((g, i) => (
        <Gantry key={"g" + i} {...g} />
      ))}
      {items.stops.map((b, i) => (
        <BusStop key={"b" + i} {...b} />
      ))}
      {items.boards.map((b, i) => (
        <MegaBoard key={"m" + i} {...b} />
      ))}
      {items.torches.map((t, i) => (
        <TorchBillboard key={"t" + i} {...t} />
      ))}
    </group>
  );
}
