"use client";

import { RoundedBox, Text, useTexture } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { billboardArt } from "./billboardArt";
import * as THREE from "three";
import { useGame } from "../store";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  ANNEX,
  CANOPY,
  COMPOUND,
  COURT,
  GALLERY,
  GATE,
  HALL,
  SIDE_DOORS,
  GATE_OPENING,
  MAIN_DOOR,
  toWorld,
  CAR_PARK,
  CORRIDOR_H,
  KIOSK,
  LED,
  PAVERS,
  PARKING,
  PED_GATE,
  PLOT,
  AUD,
  AUD_DOOR,
  FOOT_Y,
  AUD_GROUP,
  GALLERY_COLUMNS,
  LOBBY,
  SEAT_LIST,
  SIGN_BLOCK,
  SIGN_BLOCK_BACK,
  SIDE_SCREEN,
  STAGE,
  TENTS,
} from "./compound";
import {
  frondTexture,
  herringbone,
  logoDisc,
  palmBark,
  ribbedCladding,
  roofGraphic,
  roofSheeting,
  terrazzo,
  weatheredWall,
  yardPlan,
} from "./fcTextures";
import { insideBuilding, nearestRoad, type LagosWorld } from "./lagosData";
import { sedan, suv } from "./vehicleModels";
import { Chairs, StageRig } from "./hallRig";
import { hallLight, primeHallLights, showHallLights } from "./hallLights";
import { MerchStore, RegistrationPavilion } from "./BigBooths";
import { Q } from "../quality";

// The New Fusion Centre, Ogba, modelled from the architect's renders (references/fusion-centre):
// sky-blue gable roof with the mark and "THE NEW"; white ribbed cladding; a front of white
// vertical fins over pastel coloured glass in three bays; the round yellow logo on the white
// corner block; a low annex along the main road with rainbow slats and rooftop units; coloured
// glass canopy walkways; car park, basketball half-court and red herringbone forecourt; the
// two-storey container café with palms at the corner; weathered perimeter walls and a steel gate.

function useMats() {
  return useMemo(() => {
    const clad = ribbedCladding();
    const roof = roofSheeting();
    const cladMat = (repeat: [number, number]) => {
      const m = new THREE.MeshStandardMaterial({
        map: clad.map.clone(),
        normalMap: clad.normalMap.clone(),
        normalScale: new THREE.Vector2(0.8, 0.8),
        roughness: 0.55,
        metalness: 0.15,
        side: THREE.DoubleSide,
      });
      m.map!.repeat.set(...repeat);
      m.normalMap!.repeat.set(...repeat);
      m.map!.needsUpdate = m.normalMap!.needsUpdate = true;
      return m;
    };
    const wallTex = weatheredWall();
    return {
      cladMat,
      roof: new THREE.MeshStandardMaterial({
        map: roof.map,
        normalMap: roof.normalMap,
        roughness: 0.55,
        metalness: 0.1,
      }),
      wall: (len: number) => {
        const t = wallTex.clone();
        t.repeat.set(len / 4, 1);
        t.needsUpdate = true;
        return new THREE.MeshStandardMaterial({ map: t, roughness: 0.92 });
      },
      white: new THREE.MeshStandardMaterial({
        color: "#f4f5f6",
        roughness: 0.5,
        metalness: 0.1,
      }),
      fin: new THREE.MeshStandardMaterial({
        color: "#fbfbfb",
        roughness: 0.35,
        metalness: 0.3,
      }),
      steel: new THREE.MeshStandardMaterial({
        color: "#1d2024",
        roughness: 0.45,
        metalness: 0.7,
      }),
      darkGlass: new THREE.MeshPhysicalMaterial({
        color: "#20262d",
        roughness: 0.06,
        metalness: 0.5,
        clearcoat: 1,
      }),
      clearGlass: new THREE.MeshPhysicalMaterial({
        color: "#a9c3cf",
        roughness: 0.04,
        metalness: 0.1,
        transparent: true,
        opacity: 0.32,
      }),
      concrete: new THREE.MeshStandardMaterial({
        color: "#a9a8a3",
        roughness: 0.95,
      }),
      gold: new THREE.MeshStandardMaterial({
        color: "#e0a52a",
        roughness: 0.35,
        metalness: 0.6,
      }),
      wood: new THREE.MeshStandardMaterial({
        color: "#8a5a35",
        roughness: 0.7,
      }),
      black: new THREE.MeshStandardMaterial({
        color: "#16171a",
        roughness: 0.55,
        metalness: 0.2,
      }),
      pillar: new THREE.MeshStandardMaterial({
        color: "#1f3d26",
        roughness: 0.6,
      }),
      leaf: new THREE.MeshStandardMaterial({
        color: "#2f5a26",
        roughness: 0.85,
        flatShading: true,
      }),
      leafRed: new THREE.MeshStandardMaterial({
        color: "#a3173d",
        roughness: 0.7,
        flatShading: true,
      }),
      soil: new THREE.MeshStandardMaterial({ color: "#3a2c22", roughness: 1 }),
      lamp: new THREE.MeshStandardMaterial({
        color: "#fff2cc",
        emissive: "#ffd98a",
        emissiveIntensity: 2.5,
        toneMapped: false,
      }),
    };
  }, []);
}

type Mats = ReturnType<typeof useMats>;

function Box({
  x0,
  x1,
  y0 = 0,
  y1,
  z0,
  z1,
  mat,
  cast = true,
}: {
  x0: number;
  x1: number;
  y0?: number;
  y1: number;
  z0: number;
  z1: number;
  mat: THREE.Material;
  cast?: boolean;
}) {
  return (
    <mesh
      position={[(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]}
      material={mat}
      castShadow={cast}
      receiveShadow
    >
      <boxGeometry
        args={[
          Math.max(0.02, x1 - x0),
          Math.max(0.02, y1 - y0),
          Math.max(0.02, z1 - z0),
        ]}
      />
    </mesh>
  );
}

// ---------------- planting ----------------

const palmMats = {
  bark: null as THREE.Material | null,
  frond: null as THREE.Material | null,
};
function getPalmMats() {
  palmMats.bark ??= new THREE.MeshStandardMaterial({
    map: palmBark(),
    roughness: 1,
  });
  palmMats.frond ??= new THREE.MeshStandardMaterial({
    map: frondTexture(),
    alphaTest: 0.45,
    side: THREE.DoubleSide,
    roughness: 0.8,
  });
  return palmMats as { bark: THREE.Material; frond: THREE.Material };
}

/** A tall Lagos palm: curved, tapering ringed trunk and drooping fronds with leaflets. */
export function Palm({
  x,
  z,
  h = 10,
  lean = 0.06,
  rot = 0,
}: {
  x: number;
  z: number;
  h?: number;
  lean?: number;
  rot?: number;
}) {
  const { trunk, fronds, top } = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(lean * h * 0.3, h * 0.35, 0),
      new THREE.Vector3(lean * h * 0.8, h * 0.7, 0),
      new THREE.Vector3(lean * h, h, 0),
    ]);
    const trunk = new THREE.TubeGeometry(curve, 16, 0.24, 9, false);
    const p = trunk.getAttribute("position");
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const t = Math.min(1, Math.max(0, v.y / h));
      const c = curve.getPoint(t);
      const k = 1.3 - 0.5 * t;
      p.setXYZ(i, c.x + (v.x - c.x) * k, v.y, c.z + (v.z - c.z) * k);
    }
    trunk.computeVertexNormals();
    const frondGeo = new THREE.PlaneGeometry(1.6, 4.8, 1, 12);
    frondGeo.translate(0, 2.4, 0);
    const fp = frondGeo.getAttribute("position");
    for (let i = 0; i < fp.count; i++) {
      const t = fp.getY(i) / 4.8;
      // arch up then droop, folded into a shallow V across the leaf
      fp.setZ(
        i,
        Math.sin(t * Math.PI * 0.8) * 0.7 -
          t * t * 2.6 +
          Math.abs(fp.getX(i)) * 0.3,
      );
    }
    frondGeo.computeVertexNormals();
    const top = curve.getPoint(1);
    // fronds spray out and upward from the crown (positive tilt), then the bend droops their tips
    // all 22 baked into one mesh (one draw, same leaves), each placed as its own frond would be
    const place = new THREE.Matrix4(), spin = new THREE.Matrix4(), bend = new THREE.Matrix4();
    const fronds = mergeGeometries(
      Array.from({ length: 22 }, (_, i) => {
        const rotY = (i / 22) * Math.PI * 2 + (i % 3) * 0.12;
        const tilt = 0.15 + (i % 4) * 0.22;
        place.makeTranslation(top.x, top.y, top.z).multiply(spin.makeRotationY(rotY)).multiply(bend.makeRotationX(tilt - Math.PI / 2));
        return frondGeo.clone().applyMatrix4(place);
      }),
    );
    frondGeo.dispose();
    return { trunk, fronds, top };
  }, [h, lean]);
  const mats = getPalmMats();
  return (
    <group position={[x, 0, z]} rotation-y={rot}>
      <mesh geometry={trunk} material={mats.bark} castShadow />
      <mesh geometry={fronds} material={mats.frond} castShadow />
      <mesh position={[top.x, top.y - 0.2, top.z]} material={mats.bark}>
        <sphereGeometry args={[0.38, 8, 6]} />
      </mesh>
    </group>
  );
}

/** A strip of planting: low shrubs with red cordyline spikes and bollard lights. */
function Planter({
  x0,
  x1,
  z0,
  z1,
  mats,
  lights = true,
}: {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  mats: Mats;
  lights?: boolean;
}) {
  const items = useMemo(() => {
    const out: { x: number; z: number; s: number; red: boolean }[] = [];
    let seed = Math.abs(Math.floor((x0 * 31 + z0 * 17) * 100)) + 7;
    const rnd = () => (seed = (seed * 16807 + 11) % 2147483647) / 2147483647;
    const horiz = x1 - x0 >= z1 - z0;
    const along = horiz ? x1 - x0 : z1 - z0;
    for (let t = 0.4; t < along - 0.2; t += 0.7 + rnd() * 0.5)
      out.push({
        x: horiz ? x0 + t : (x0 + x1) / 2 + (rnd() - 0.5) * 0.3,
        z: horiz ? (z0 + z1) / 2 + (rnd() - 0.5) * 0.3 : z0 + t,
        s: 0.3 + rnd() * 0.3,
        red: rnd() < 0.22,
      });
    return out;
  }, [x0, x1, z0, z1]);
  return (
    <group>
      <Box
        x0={x0}
        x1={x1}
        y1={0.3}
        z0={z0}
        z1={z1}
        mat={mats.concrete}
        cast={false}
      />
      <Box
        x0={x0 + 0.08}
        x1={x1 - 0.08}
        y0={0.3}
        y1={0.32}
        z0={z0 + 0.08}
        z1={z1 - 0.08}
        mat={mats.soil}
        cast={false}
      />
      {items.map((it, i) =>
        it.red ? (
          <group key={i} position={[it.x, 0.3, it.z]}>
            {[0, 1, 2, 3, 4].map((k) => (
              <mesh
                key={k}
                position-y={0.35}
                rotation={[0.5, (k / 5) * Math.PI * 2, 0]}
                material={mats.leafRed}
              >
                <coneGeometry args={[0.07, 0.8, 4]} />
              </mesh>
            ))}
          </group>
        ) : (
          <mesh
            key={i}
            position={[it.x, 0.3 + it.s * 0.6, it.z]}
            scale={[it.s * 1.3, it.s, it.s * 1.3]}
            material={mats.leaf}
            castShadow
          >
            <icosahedronGeometry args={[1, 1]} />
          </mesh>
        ),
      )}
      {lights &&
        items
          .filter((_, i) => i % 6 === 3)
          .map((it, i) => (
            <group key={"l" + i} position={[it.x, 0.3, it.z]}>
              <mesh position-y={0.35} material={mats.black}>
                <cylinderGeometry args={[0.05, 0.05, 0.7, 8]} />
              </mesh>
              <mesh position-y={0.72} material={mats.lamp}>
                <cylinderGeometry args={[0.06, 0.06, 0.06, 8]} />
              </mesh>
            </group>
          ))}
    </group>
  );
}

// ---------------- ground ----------------

function Grounds({ mats }: { mats: Mats }) {
  const yard = useMemo(yardPlan, []);
  const pavers = useMemo(() => {
    const t = herringbone();
    t.repeat.set((PAVERS.x1 - PAVERS.x0) / 2, (PAVERS.z1 - PAVERS.z0) / 2);
    return t;
  }, []);
  const terrMat = useMemo(() => {
    const base = terrazzo();
    return (w: number, d: number) => {
      const t = base.clone();
      t.repeat.set(w / 1.5, d / 1.5);
      t.needsUpdate = true;
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 });
    };
  }, []);
  const asphalt = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#5a5b5d", roughness: 0.95 }),
    [],
  );
  return (
    <group>
      <mesh
        rotation-x={-Math.PI / 2}
        position={[(PLOT.x0 + PLOT.x1) / 2, 0.06, (PLOT.z0 + PLOT.z1) / 2]}
        receiveShadow
        material={asphalt}
      >
        <planeGeometry args={[PLOT.x1 - PLOT.x0, PLOT.z1 - PLOT.z0]} />
      </mesh>
      <mesh
        rotation-x={-Math.PI / 2}
        position={[(PLOT.x0 + PLOT.x1) / 2, 0.07, (HALL.z1 + PLOT.z1) / 2]}
        receiveShadow
      >
        <planeGeometry args={[PLOT.x1 - PLOT.x0, PLOT.z1 - HALL.z1]} />
        <meshStandardMaterial map={yard} roughness={0.92} />
      </mesh>
      <mesh
        rotation-x={-Math.PI / 2}
        position={[
          (PAVERS.x0 + PAVERS.x1) / 2,
          0.08,
          (PAVERS.z0 + PAVERS.z1) / 2,
        ]}
        receiveShadow
      >
        <planeGeometry args={[PAVERS.x1 - PAVERS.x0, PAVERS.z1 - PAVERS.z0]} />
        <meshStandardMaterial map={pavers} roughness={0.85} />
      </mesh>
      {/* terrazzo aprons: along the front, the annex walkway and under the west canopy */}
      <mesh
        rotation-x={-Math.PI / 2}
        position={[(SIGN_BLOCK.x0 + HALL.x1) / 2, 0.085, HALL.z1 + 1.4]}
        receiveShadow
        material={terrMat(HALL.x1 - SIGN_BLOCK.x0, 2.8)}
      >
        <planeGeometry args={[HALL.x1 - SIGN_BLOCK.x0, 2.8]} />
      </mesh>
      <mesh
        rotation-x={-Math.PI / 2}
        position={[ANNEX.x0 - 1.4, 0.085, (PLOT.z0 + HALL.z1) / 2]}
        receiveShadow
        material={terrMat(2.8, HALL.z1 - PLOT.z0)}
      >
        <planeGeometry args={[2.8, HALL.z1 - PLOT.z0]} />
      </mesh>
      <mesh
        rotation-x={-Math.PI / 2}
        position={[
          (CANOPY.x0 + CANOPY.x1) / 2,
          0.085,
          (CANOPY.z0 + CANOPY.z1) / 2,
        ]}
        receiveShadow
        material={terrMat(CANOPY.x1 - CANOPY.x0, CANOPY.z1 - CANOPY.z0)}
      >
        <planeGeometry args={[CANOPY.x1 - CANOPY.x0, CANOPY.z1 - CANOPY.z0]} />
      </mesh>
      <Planter
        x0={-6}
        x1={1.6}
        z0={HALL.z1 + 2.8}
        z1={HALL.z1 + 3.6}
        mats={mats}
      />
      <Planter
        x0={7.2}
        x1={22}
        z0={HALL.z1 + 2.8}
        z1={HALL.z1 + 3.6}
        mats={mats}
      />
      {/* planter behind the closed half of the sliding gate only: the open half stays clear */}
      <Planter
        x0={PAVERS.x0 + 1}
        x1={GATE_OPENING.x0 - 0.6}
        z0={PLOT.z1 - 1.3}
        z1={PLOT.z1 - 0.3}
        mats={mats}
        lights={false}
      />
      <Planter
        x0={PLOT.x1 - 0.9}
        x1={PLOT.x1 - 0.2}
        z0={-14}
        z1={23}
        mats={mats}
      />
      <Planter
        x0={-14}
        x1={22.5}
        z0={PLOT.z0 + 0.2}
        z1={PLOT.z0 + 0.9}
        mats={mats}
        lights={false}
      />
    </group>
  );
}

// ---------------- the hall ----------------

const PASTEL = [
  "#6fdc6a",
  "#b08cf0",
  "#f29bbd",
  "#8fe0a6",
  "#c3a8ff",
  "#ffbf9a",
  "#7fe8c0",
  "#dfe7ee",
  "#a8f05a",
  "#9f86e8",
];
const VIVID = [
  "#38c7d6",
  "#9a5cff",
  "#ff6fb5",
  "#44d07e",
  "#5b8cff",
  "#c55cff",
];

/** Front of the hall: white fins over pastel glass in three bays, with a white frame. */
/**
 * One of the two entrances: a corridor through the annex from the lane, a lit portal on the
 * annex front, and double doors in the hall's left wall swung open into the hall.
 */
function SideEntrance({
  door,
  mats,
}: {
  door: (typeof SIDE_DOORS)[number];
  mats: Mats;
}) {
  const w = door.w;
  const leaf = w / 2;
  const len = HALL.x0 - ANNEX.x0;
  return (
    <group>
      {/* corridor: floor, ceiling and warm downlights */}
      <mesh
        rotation-x={-Math.PI / 2}
        position={[(ANNEX.x0 + HALL.x0) / 2, 0.06, door.z]}
        material={mats.concrete}
      >
        <planeGeometry args={[len + 0.6, w + 0.5]} />
      </mesh>
      <Box
        x0={ANNEX.x0}
        x1={HALL.x0}
        y0={CORRIDOR_H}
        y1={CORRIDOR_H + 0.12}
        z0={door.z - w / 2 - 0.25}
        z1={door.z + w / 2 + 0.25}
        mat={mats.white}
        cast={false}
      />
      {[0.25, 0.75].map((f) => (
        <mesh
          key={f}
          position={[ANNEX.x0 + len * f, CORRIDOR_H - 0.02, door.z]}
          rotation-x={Math.PI / 2}
        >
          <circleGeometry args={[0.22, 16]} />
          <meshBasicMaterial color={[3, 2.5, 1.8]} toneMapped={false} />
        </mesh>
      ))}
      <pointLight
        position={[ANNEX.x0 + len / 2, CORRIDOR_H - 0.4, door.z]}
        intensity={6}
        distance={7}
        color="#ffd59a"
      />
      {/* plain steel portal on the annex front */}
      <group position={[ANNEX.x0 - 0.3, 0, door.z]}>
        <Box
          x0={-0.1}
          x1={0.1}
          y1={CORRIDOR_H + 0.2}
          z0={-w / 2 - 0.4}
          z1={-w / 2 - 0.25}
          mat={mats.steel}
        />
        <Box
          x0={-0.1}
          x1={0.1}
          y1={CORRIDOR_H + 0.2}
          z0={w / 2 + 0.25}
          z1={w / 2 + 0.4}
          mat={mats.steel}
        />
        <Box
          x0={-0.1}
          x1={0.1}
          y0={CORRIDOR_H}
          y1={CORRIDOR_H + 0.2}
          z0={-w / 2 - 0.4}
          z1={w / 2 + 0.4}
          mat={mats.steel}
        />
      </group>
      {/* double doors in the hall wall, open inward */}
      <group position={[HALL.x0, 0, door.z]}>
        <Box
          x0={-0.12}
          x1={0.12}
          y1={3.0}
          z0={-w / 2 - 0.12}
          z1={-w / 2}
          mat={mats.steel}
        />
        <Box
          x0={-0.12}
          x1={0.12}
          y1={3.0}
          z0={w / 2}
          z1={w / 2 + 0.12}
          mat={mats.steel}
        />
        <Box
          x0={-0.12}
          x1={0.12}
          y0={2.9}
          y1={3.05}
          z0={-w / 2 - 0.12}
          z1={w / 2 + 0.12}
          mat={mats.steel}
        />
        {[-1, 1].map((side) => (
          <group
            key={side}
            position={[0.1, 0, side * (w / 2)]}
            rotation-y={side * 1.2}
          >
            <group position={[0, 0, -side * (leaf / 2)]}>
              <Box
                x0={-0.03}
                x1={0.03}
                y0={0.02}
                y1={2.85}
                z0={-leaf / 2}
                z1={leaf / 2}
                mat={mats.darkGlass}
                cast={false}
              />
              <Box
                x0={-0.04}
                x1={0.04}
                y0={0.02}
                y1={0.12}
                z0={-leaf / 2}
                z1={leaf / 2}
                mat={mats.steel}
              />
              <Box
                x0={0.04}
                x1={0.09}
                y0={0.9}
                y1={1.8}
                z0={-side * (leaf / 2 - 0.12) - 0.02}
                z1={-side * (leaf / 2 - 0.12) + 0.02}
                mat={mats.steel}
              />
            </group>
          </group>
        ))}
      </group>
    </group>
  );
}

/** The main doors in the glass front: a steel frame, two glass leaves swung open, a lit sign. */
function MainDoors({ z, mats }: { z: number; mats: Mats }) {
  const w = MAIN_DOOR.w;
  const leaf = w / 2;
  return (
    <group position={[MAIN_DOOR.x, 0, z - 0.6]}>
      <Box
        x0={-w / 2 - 0.15}
        x1={-w / 2}
        y1={3.2}
        z0={-0.1}
        z1={0.1}
        mat={mats.steel}
      />
      <Box
        x0={w / 2}
        x1={w / 2 + 0.15}
        y1={3.2}
        z0={-0.1}
        z1={0.1}
        mat={mats.steel}
      />
      <Box
        x0={-w / 2 - 0.15}
        x1={w / 2 + 0.15}
        y0={3.2}
        y1={3.5}
        z0={-0.1}
        z1={0.1}
        mat={mats.steel}
      />
      {[-1, 1].map((side) => (
        <group
          key={side}
          position={[side * (w / 2), 0, 0.1]}
          rotation-y={side * 1.25}
        >
          <group position={[-side * (leaf / 2), 0, 0]}>
            <Box
              x0={-leaf / 2}
              x1={leaf / 2}
              y0={0.02}
              y1={3.1}
              z0={-0.03}
              z1={0.03}
              mat={mats.clearGlass}
              cast={false}
            />
            <Box
              x0={-leaf / 2}
              x1={leaf / 2}
              y0={0.02}
              y1={0.14}
              z0={-0.04}
              z1={0.04}
              mat={mats.steel}
            />
            <Box
              x0={-leaf / 2}
              x1={leaf / 2}
              y0={2.98}
              y1={3.1}
              z0={-0.04}
              z1={0.04}
              mat={mats.steel}
            />
          </group>
        </group>
      ))}
      <Text
        position={[0, 3.35, 0.12]}
        fontSize={0.2}
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.22}
      >
        MAIN HALL
        <meshBasicMaterial color={[2.4, 1.9, 1.1]} toneMapped={false} />
      </Text>
      <pointLight
        position={[0, 2.8, 2.2]}
        intensity={10}
        distance={9}
        color="#ffcf8a"
      />
    </group>
  );
}

function FinFacade({ mats }: { mats: Mats }) {
  const x0 = SIGN_BLOCK.x1;
  const x1 = HALL.x1;
  const top = HALL.h - 1.2;
  const z = HALL.z1;
  const { glass, fins, glassMats, vivid } = useMemo(() => {
    const glass: { x: number; y: number; c: number }[] = [];
    let k = 0;
    for (let x = x0 + 0.6; x < x1 - 1.6; x += 1.25)
      for (let y = 0.2; y < top - 1.2; y += 1.45) {
        if (Math.abs(x + 0.6 - MAIN_DOOR.x) < MAIN_DOOR.w / 2 + 0.7 && y < 3.4)
          continue;
        glass.push({ x, y, c: (k * 7 + Math.floor(y * 2.3)) % PASTEL.length });
        k++;
      }
    const fins: number[] = [];
    for (let x = x0 + 0.3; x < x1 - 0.2; x += 0.46)
      if (Math.abs(x - MAIN_DOOR.x) > MAIN_DOOR.w / 2 + 0.2) fins.push(x);
    const glassMats = PASTEL.map(
      (c) =>
        new THREE.MeshPhysicalMaterial({
          color: c,
          roughness: 0.08,
          metalness: 0.1,
          transparent: true,
          opacity: 0.92,
          emissive: c,
          emissiveIntensity: 0.22,
        }),
    );
    const vivid = VIVID.map(
      (c) =>
        new THREE.MeshPhysicalMaterial({
          color: c,
          roughness: 0.06,
          transparent: true,
          opacity: 0.85,
          emissive: c,
          emissiveIntensity: 0.25,
        }),
    );
    return { glass, fins, glassMats, vivid };
  }, [x0, x1, top]);
  const finGeo = useMemo(
    () => new THREE.BoxGeometry(0.07, top - 0.4, 0.38),
    [top],
  );
  const thirds = [x0, x0 + (x1 - x0) / 3, x0 + ((x1 - x0) * 2) / 3, x1 - 0.2];
  return (
    <group>
      {/* dark backing behind the glass, open at the main doors */}
      <Box
        x0={x0}
        x1={MAIN_DOOR.x - MAIN_DOOR.w / 2 - 0.3}
        y1={top}
        z0={z - 0.95}
        z1={z - 0.75}
        mat={mats.black}
        cast={false}
      />
      <Box
        x0={MAIN_DOOR.x + MAIN_DOOR.w / 2 + 0.3}
        x1={x1}
        y1={top}
        z0={z - 0.95}
        z1={z - 0.75}
        mat={mats.black}
        cast={false}
      />
      <Box
        x0={MAIN_DOOR.x - MAIN_DOOR.w / 2 - 0.3}
        x1={MAIN_DOOR.x + MAIN_DOOR.w / 2 + 0.3}
        y0={3.5}
        y1={top}
        z0={z - 0.95}
        z1={z - 0.75}
        mat={mats.black}
        cast={false}
      />
      <MainDoors z={z} mats={mats} />
      {glass.map((g, i) => (
        <mesh
          key={i}
          position={[g.x + 0.61, g.y + 0.71, z - 0.55]}
          material={glassMats[g.c]}
        >
          <boxGeometry args={[1.18, 1.38, 0.04]} />
        </mesh>
      ))}
      <instancedMesh
        args={[finGeo, mats.fin, fins.length]}
        castShadow
        ref={(im) => {
          if (!im) return;
          const m = new THREE.Matrix4();
          fins.forEach((x, i) =>
            im.setMatrixAt(
              i,
              m.makeTranslation(x, (top - 0.4) / 2 + 0.2, z - 0.1),
            ),
          );
          im.instanceMatrix.needsUpdate = true;
          im.computeBoundingSphere();
        }}
      />
      {thirds.map((x) => (
        <Box
          key={x}
          x0={x - 0.18}
          x1={x + 0.18}
          y1={top}
          z0={z - 0.4}
          z1={z + 0.05}
          mat={mats.steel}
        />
      ))}
      <Box
        x0={x0}
        x1={x1}
        y0={top}
        y1={HALL.h}
        z0={z - 0.6}
        z1={z + 0.3}
        mat={mats.white}
      />
      {/* bright ground-floor glass box at the west end (saturated colours) */}
      <group position={[x1 - 4.6, 0, z]}>
        {[0, 1, 2, 3, 4, 5].map((i) =>
          [0, 1].map((j) => (
            <mesh
              key={i + "-" + j}
              position={[-3.6 + i * 1.45, 0.75 + j * 1.45, 1.05]}
              material={vivid[(i + j * 2) % 6]}
            >
              <boxGeometry args={[1.4, 1.4, 0.05]} />
            </mesh>
          )),
        )}
        <Box
          x0={-4.4}
          x1={4.4}
          y0={2.95}
          y1={3.1}
          z0={-0.4}
          z1={1.15}
          mat={mats.white}
        />
      </group>
      {/* coloured-glass canopy over the entrance walk */}
      <group position={[0, 3.5, z + 1.25]}>
        {Array.from({ length: Math.floor((x1 - x0 - 9.5) / 1.2) }, (_, i) => (
          <mesh
            key={i}
            position={[x0 + 0.6 + i * 1.2, 0, 0]}
            material={glassMats[(i * 3) % glassMats.length]}
          >
            <boxGeometry args={[1.15, 0.04, 2.3]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** White corner block with the round yellow logo and "THE NEW / FUSION CENTER". */
function SignBlock({ mats }: { mats: Mats }) {
  const logo = useMemo(logoDisc, []);
  const b = SIGN_BLOCK;
  const h = HALL.h + 0.6;
  // the block is the facade's corner: it stops at the lobby wall, so it never stands in the hall
  // (where the screen wall runs straight to the corner)
  const z0 = SIGN_BLOCK_BACK;
  const mat = useMemo(() => mats.cladMat([b.x1 - b.x0, h]), [mats, b, h]);
  return (
    <group>
      <mesh
        position={[(b.x0 + b.x1) / 2, h / 2, (z0 + b.z1) / 2]}
        castShadow
        receiveShadow
        material={mat}
      >
        <boxGeometry args={[b.x1 - b.x0, h, b.z1 - z0]} />
      </mesh>
      <group position={[(b.x0 + b.x1) / 2, 0, b.z1 + 0.02]}>
        <mesh position={[-2.2, 8.2, 0.03]}>
          <circleGeometry args={[1.25, 64]} />
          <meshStandardMaterial map={logo} roughness={0.4} />
        </mesh>
        <Text
          position={[0.75, 8.55, 0.06]}
          fontSize={0.95}
          color="#151515"
          anchorX="center"
          anchorY="middle"
          fontWeight={900}
        >
          THE NEW
        </Text>
        <Text
          position={[0.75, 7.75, 0.06]}
          fontSize={0.36}
          color="#151515"
          anchorX="center"
          anchorY="middle"
          letterSpacing={0.18}
          fontWeight={700}
        >
          FUSION CENTER
        </Text>
      </group>
      {/* the same sign facing the main road, above the annex roof */}
      <group
        position={[b.x0 - 0.02, 0, (b.z0 + b.z1) / 2]}
        rotation-y={-Math.PI / 2}
      >
        <mesh position={[-1.4, 9.2, 0.03]}>
          <circleGeometry args={[0.9, 64]} />
          <meshStandardMaterial map={logo} roughness={0.4} />
        </mesh>
        <Text
          position={[0.9, 9.45, 0.06]}
          fontSize={0.7}
          color="#151515"
          anchorX="center"
          anchorY="middle"
          fontWeight={900}
        >
          THE NEW
        </Text>
        <Text
          position={[0.9, 8.85, 0.06]}
          fontSize={0.26}
          color="#151515"
          anchorX="center"
          anchorY="middle"
          letterSpacing={0.18}
        >
          FUSION CENTER
        </Text>
      </group>
    </group>
  );
}

/** Sky-blue gable roof running front to back, with the mark and "THE NEW" painted across it. */
function Roof({ mats }: { mats: Mats }) {
  const graphic = useMemo(roofGraphic, []);
  const w = HALL.x1 - HALL.x0;
  const d = HALL.z1 - HALL.z0;
  const half = w / 2;
  const rise = HALL.ridge - HALL.h;
  const slope = Math.atan2(rise, half);
  const len = Math.hypot(half, rise);
  const cx = (HALL.x0 + HALL.x1) / 2;
  const sheet = useMemo(() => {
    const m = mats.roof.clone();
    m.map = mats.roof.map!.clone();
    m.normalMap = mats.roof.normalMap!.clone();
    for (const t of [m.map, m.normalMap]) {
      t.repeat.set(len, d);
      t.needsUpdate = true;
    }
    return m;
  }, [mats, len, d]);
  // the graphic is drawn as one portrait sheet: the mark on the main-road slope (−x), the name on the other
  const halves = useMemo(
    () =>
      [0.5, 0].map((offset) => {
        const t = graphic.clone();
        t.repeat.set(1, 0.5);
        t.offset.set(0, offset);
        t.needsUpdate = true;
        return new THREE.MeshStandardMaterial({
          map: t,
          transparent: true,
          roughness: 0.5,
          polygonOffset: true,
          polygonOffsetFactor: -2,
        });
      }),
    [graphic],
  );
  const shapeGeo = useMemo(
    () =>
      new THREE.ShapeGeometry(
        new THREE.Shape([
          new THREE.Vector2(-half, 0),
          new THREE.Vector2(half, 0),
          new THREE.Vector2(0, rise),
        ]),
      ),
    [half, rise],
  );
  return (
    <group>
      {[-1, 1].map((s, i) => (
        <group
          key={s}
          position={[
            cx + (s * half) / 2,
            HALL.h + rise / 2,
            (HALL.z0 + HALL.z1) / 2,
          ]}
          rotation-z={-s * slope}
        >
          <mesh material={sheet} castShadow receiveShadow>
            <boxGeometry args={[len + 0.5, 0.14, d + 0.6]} />
          </mesh>
          <mesh
            position-y={0.08}
            rotation-x={-Math.PI / 2}
            rotation-z={s < 0 ? Math.PI / 2 : -Math.PI / 2}
            material={halves[i]}
          >
            <planeGeometry args={[d * 0.5, len * 0.85]} />
          </mesh>
        </group>
      ))}
      <Box
        x0={cx - 0.25}
        x1={cx + 0.25}
        y0={HALL.ridge - 0.05}
        y1={HALL.ridge + 0.18}
        z0={HALL.z0 - 0.3}
        z1={HALL.z1 + 0.3}
        mat={mats.white}
      />
      <Box
        x0={HALL.x0 - 0.3}
        x1={HALL.x0}
        y0={HALL.h - 0.5}
        y1={HALL.h + 0.2}
        z0={HALL.z0 - 0.3}
        z1={HALL.z1 + 0.3}
        mat={mats.white}
      />
      <Box
        x0={HALL.x1}
        x1={HALL.x1 + 0.3}
        y0={HALL.h - 0.5}
        y1={HALL.h + 0.2}
        z0={HALL.z0 - 0.3}
        z1={HALL.z1 + 0.3}
        mat={mats.white}
      />
      {[HALL.z0, HALL.z1].map((z) => (
        <mesh
          key={z}
          position={[cx, HALL.h, z]}
          geometry={shapeGeo}
          material={mats.white}
        />
      ))}
    </group>
  );
}

function Hall({ mats }: { mats: Mats }) {
  const w = HALL.x1 - HALL.x0;
  const d = HALL.z1 - HALL.z0;
  const side = useMemo(() => mats.cladMat([d, HALL.h]), [mats, d]);
  const back = useMemo(() => mats.cladMat([w, HALL.h]), [mats, w]);
  const upper = useMemo(() => mats.cladMat([d, HALL.h - ANNEX.h]), [mats, d]);
  const canopyGlass = useMemo(
    () =>
      PASTEL.map(
        (c) =>
          new THREE.MeshPhysicalMaterial({
            color: c,
            transparent: true,
            opacity: 0.55,
            roughness: 0.1,
          }),
      ),
    [],
  );
  const bays = Math.floor((CANOPY.z1 - CANOPY.z0) / 1.1);
  return (
    <group>
      <mesh
        position={[HALL.x1, HALL.h / 2, (HALL.z0 + HALL.z1) / 2]}
        rotation-y={Math.PI / 2}
        castShadow
        receiveShadow
        material={side}
      >
        <planeGeometry args={[d, HALL.h]} />
      </mesh>
      <mesh
        position={[(HALL.x0 + HALL.x1) / 2, HALL.h / 2, HALL.z0]}
        rotation-y={Math.PI}
        castShadow
        receiveShadow
        material={back}
      >
        <planeGeometry args={[w, HALL.h]} />
      </mesh>
      <mesh
        position={[HALL.x0, (ANNEX.h + HALL.h) / 2, (HALL.z0 + HALL.z1) / 2]}
        rotation-y={-Math.PI / 2}
        castShadow
        receiveShadow
        material={upper}
      >
        <planeGeometry args={[d, HALL.h - ANNEX.h]} />
      </mesh>
      <FinFacade mats={mats} />
      {SIDE_DOORS.map((d) => (
        <SideEntrance key={d.z} door={d} mats={mats} />
      ))}
      <SignBlock mats={mats} />
      <Roof mats={mats} />
      {/* west canopy walkway: black steel frame, pastel glass squares */}
      {Array.from(
        { length: 9 },
        (_, i) => CANOPY.z0 + 0.4 + i * ((CANOPY.z1 - CANOPY.z0 - 0.8) / 8),
      ).map((z) => (
        <Box
          key={z}
          x0={CANOPY.x1 - 0.12}
          x1={CANOPY.x1}
          y1={CANOPY.h}
          z0={z - 0.06}
          z1={z + 0.06}
          mat={mats.steel}
        />
      ))}
      {Array.from({ length: bays }, (_, i) =>
        [0, 1, 2].map((j) => (
          <mesh
            key={i + "-" + j}
            position={[
              CANOPY.x0 + 0.57 + j * 1.12,
              CANOPY.h + 0.1,
              CANOPY.z0 + 0.55 + i * 1.1,
            ]}
            material={canopyGlass[(i * 2 + j) % canopyGlass.length]}
          >
            <boxGeometry args={[1.08, 0.03, 1.06]} />
          </mesh>
        )),
      )}
      {Array.from({ length: bays + 1 }, (_, i) => (
        <Box
          key={"b" + i}
          x0={CANOPY.x0}
          x1={CANOPY.x1}
          y0={CANOPY.h + 0.05}
          y1={CANOPY.h + 0.12}
          z0={CANOPY.z0 + i * 1.1 - 0.03}
          z1={CANOPY.z0 + i * 1.1 + 0.03}
          mat={mats.steel}
          cast={false}
        />
      ))}
    </group>
  );
}

/** The low annex along the main road: rooms, rainbow slats outside, rooftop units on top. */
function Annex({ mats }: { mats: Mats }) {
  const d = ANNEX.z1 - ANNEX.z0;
  const { slats, slatMats } = useMemo(() => {
    const cols = [
      "#e8336d",
      "#ff7a2f",
      "#ffc62a",
      "#7ac943",
      "#26b5a6",
      "#2c8ff0",
      "#6a4fe0",
      "#c13be0",
      "#ff5fa2",
      "#40d1f0",
      "#f04a3a",
      "#9ad03a",
    ];
    const slats: { z: number; c: number }[] = [];
    let k = 0;
    for (let z = ANNEX.z0 + 0.2; z < ANNEX.z1 - 0.1; z += 0.27) {
      // leave the two corridor mouths open
      if (SIDE_DOORS.some((d) => Math.abs(z - d.z) < d.w / 2 + 0.55)) continue;
      slats.push({ z, c: k++ % cols.length });
    }
    return {
      slats,
      slatMats: cols.map(
        (c) =>
          new THREE.MeshStandardMaterial({
            color: c,
            roughness: 0.45,
            metalness: 0.2,
          }),
      ),
    };
  }, []);
  const rooms = [
    "TREASUREVILLE",
    "THE NEW TEENS",
    "PRAYER ROOM",
    "MEDIA",
    "SERVICE TEAMS",
  ];
  return (
    <group>
      {/* the annex block, with the two corridors through to the hall's doors */}
      {(() => {
        const runs: [number, number][] = [];
        let from = ANNEX.z0;
        for (const d of SIDE_DOORS) {
          runs.push([from, d.z - d.w / 2 - 0.25]);
          from = d.z + d.w / 2 + 0.25;
        }
        runs.push([from, ANNEX.z1]);
        return (
          <>
            {runs.map(([z0, z1]) => (
              <Box
                key={z0}
                x0={ANNEX.x0}
                x1={ANNEX.x1}
                y1={ANNEX.h}
                z0={z0}
                z1={z1}
                mat={mats.white}
              />
            ))}
            {SIDE_DOORS.map((d) => (
              <Box
                key={d.z}
                x0={ANNEX.x0}
                x1={ANNEX.x1}
                y0={CORRIDOR_H + 0.12}
                y1={ANNEX.h}
                z0={d.z - d.w / 2 - 0.25}
                z1={d.z + d.w / 2 + 0.25}
                mat={mats.white}
              />
            ))}
          </>
        );
      })()}
      {slats.map((s, i) => (
        <mesh
          key={i}
          position={[ANNEX.x0 - 0.12, (ANNEX.h - 0.6) / 2, s.z]}
          material={slatMats[s.c]}
          castShadow
        >
          <boxGeometry args={[0.14, ANNEX.h - 0.6, 0.18]} />
        </mesh>
      ))}
      <Box
        x0={ANNEX.x0 - 0.3}
        x1={ANNEX.x0 + 0.05}
        y0={ANNEX.h - 0.6}
        y1={ANNEX.h - 0.25}
        z0={ANNEX.z0}
        z1={ANNEX.z1}
        mat={mats.gold}
      />
      {rooms.map((r, i) => {
        const z = [-19.5, -12, -4.5, 3, 10.5][i];
        return (
          <group key={r} position={[ANNEX.x0 - 0.22, 0, z]}>
            <Box
              x0={-0.06}
              x1={0.02}
              y1={2.6}
              z0={-0.75}
              z1={0.75}
              mat={mats.darkGlass}
              cast={false}
            />
            <Text
              position={[-0.1, 3.0, 0]}
              rotation-y={-Math.PI / 2}
              fontSize={0.26}
              color="#ffffff"
              anchorX="center"
              outlineWidth={0.015}
              outlineColor="#000"
            >
              {r}
            </Text>
          </group>
        );
      })}
      <Box
        x0={ANNEX.x0}
        x1={ANNEX.x1}
        y0={ANNEX.h}
        y1={ANNEX.h + 0.05}
        z0={ANNEX.z0}
        z1={ANNEX.z1}
        mat={mats.concrete}
        cast={false}
      />
      <Box
        x0={ANNEX.x0 - 0.3}
        x1={ANNEX.x0}
        y0={ANNEX.h - 0.25}
        y1={ANNEX.h + 0.6}
        z0={ANNEX.z0}
        z1={ANNEX.z1}
        mat={mats.white}
      />
      {Array.from(
        { length: 6 },
        (_, i) => ANNEX.z0 + 4 + i * ((d - 8) / 5),
      ).map((z) => (
        <group key={z}>
          <RoundedBox
            args={[1.6, 1.0, 3.0]}
            radius={0.12}
            position={[ANNEX.x0 + 1.9, ANNEX.h + 0.55, z]}
            material={mats.white}
            castShadow
          />
          {[-0.9, 0, 0.9].map((dz) => (
            <mesh
              key={dz}
              position={[ANNEX.x0 + 2.71, ANNEX.h + 0.6, z + dz]}
              rotation-z={Math.PI / 2}
              material={mats.steel}
            >
              <cylinderGeometry args={[0.28, 0.28, 0.02, 16]} />
            </mesh>
          ))}
          <mesh
            position={[ANNEX.x1 - 2.3, ANNEX.h + 0.75, z]}
            material={mats.concrete}
            castShadow
          >
            <boxGeometry args={[1.8, 1.5, 1.8]} />
          </mesh>
          <mesh
            position={[ANNEX.x1 - 2.3, ANNEX.h + 1.51, z]}
            rotation-x={-Math.PI / 2}
            material={mats.steel}
          >
            <circleGeometry args={[0.65, 20]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ---------------- the corner café ----------------

function Kiosk({ mats }: { mats: Mats }) {
  return (
    <group position={[KIOSK.x, 0, KIOSK.z]} rotation-y={KIOSK.rot}>
      {/* ground floor: black container with a glass shopfront */}
      <Box x0={-3} x1={1.6} y1={2.8} z0={-1.3} z1={1.3} mat={mats.black} />
      <Box
        x0={-2.8}
        x1={1.2}
        y0={0.2}
        y1={2.6}
        z0={1.29}
        z1={1.33}
        mat={mats.clearGlass}
        cast={false}
      />
      <Box
        x0={-2.6}
        x1={1.0}
        y0={0.9}
        y1={1.0}
        z0={1.33}
        z1={1.7}
        mat={mats.wood}
      />
      {/* upper floor: glass room in a thick yellow frame, cantilevered, with balcony and pergola */}
      <group position={[-1.4, 2.8, 0.3]}>
        <Box x0={-1.8} x1={2.2} y1={0.25} z0={-1.6} z1={1.6} mat={mats.gold} />
        <Box
          x0={-1.8}
          x1={2.2}
          y0={2.65}
          y1={2.9}
          z0={-1.6}
          z1={1.6}
          mat={mats.gold}
        />
        <Box x0={-1.8} x1={-1.55} y1={2.9} z0={-1.6} z1={1.6} mat={mats.gold} />
        <Box x0={1.95} x1={2.2} y1={2.9} z0={-1.6} z1={1.6} mat={mats.gold} />
        <Box
          x0={-1.5}
          x1={1.9}
          y0={0.25}
          y1={2.65}
          z0={-1.4}
          z1={-1.36}
          mat={mats.clearGlass}
          cast={false}
        />
        <Box
          x0={-1.5}
          x1={0.3}
          y0={0.25}
          y1={2.65}
          z0={-0.4}
          z1={0.6}
          mat={mats.black}
        />
        <Box
          x0={-1.5}
          x1={1.9}
          y0={1.0}
          y1={1.06}
          z0={1.45}
          z1={1.52}
          mat={mats.steel}
        />
        {Array.from({ length: 12 }, (_, i) => -1.4 + i * 0.29).map((x) => (
          <Box
            key={x}
            x0={x}
            x1={x + 0.03}
            y0={0.25}
            y1={1.0}
            z0={1.47}
            z1={1.5}
            mat={mats.steel}
            cast={false}
          />
        ))}
        {Array.from({ length: 10 }, (_, i) => -1.4 + i * 0.36).map((x) => (
          <Box
            key={"p" + x}
            x0={x}
            x1={x + 0.12}
            y0={2.45}
            y1={2.6}
            z0={-1.4}
            z1={1.4}
            mat={mats.wood}
          />
        ))}
        <Box
          x0={0.6}
          x1={1.4}
          y0={0.95}
          y1={1.0}
          z0={0.2}
          z1={0.9}
          mat={mats.wood}
        />
      </group>
      {/* the second black container upstairs */}
      <Box
        x0={0.9}
        x1={3.4}
        y0={2.8}
        y1={5.4}
        z0={-1.3}
        z1={1.0}
        mat={mats.black}
      />
      <Box
        x0={1.2}
        x1={3.1}
        y0={3.3}
        y1={5.0}
        z0={1.0}
        z1={1.03}
        mat={mats.darkGlass}
        cast={false}
      />
      {/* terrazzo roof slab with planters */}
      <Box
        x0={-3.4}
        x1={3.6}
        y0={5.7}
        y1={5.95}
        z0={-1.9}
        z1={2.0}
        mat={mats.white}
      />
      {/* external stair: steel stringers, timber treads */}
      <group position={[2.5, 0, 1.7]}>
        {Array.from({ length: 15 }, (_, i) => (
          <Box
            key={i}
            x0={-0.2 - i * 0.26}
            x1={0.06 - i * 0.26}
            y0={0.18 * (i + 1) - 0.04}
            y1={0.18 * (i + 1)}
            z0={0}
            z1={1.0}
            mat={mats.wood}
          />
        ))}
        {[0, 1.0].map((z) => (
          <mesh
            key={z}
            position={[-1.85, 1.4, z]}
            rotation-z={-Math.atan2(2.7, 3.9)}
            material={mats.steel}
          >
            <boxGeometry args={[4.8, 0.12, 0.05]} />
          </mesh>
        ))}
      </group>
      <Text
        position={[-0.7, 2.2, 1.36]}
        fontSize={0.28}
        color="#ffffff"
        anchorX="center"
        fontWeight={800}
      >
        COFFEE TIME
      </Text>
      <Planter x0={-3.4} x1={1.8} z0={1.9} z1={2.6} mats={mats} />
    </group>
  );
}

// ---------------- walls, gates and fences ----------------

function WallRun({
  x0,
  z0,
  x1,
  z1,
  mats,
}: {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  mats: Mats;
}) {
  const H = 3;
  const len = Math.hypot(x1 - x0, z1 - z0);
  const mat = useMemo(() => mats.wall(len), [mats, len]);
  const rot = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2;
  return (
    <group>
      <mesh
        position={[(x0 + x1) / 2, H / 2, (z0 + z1) / 2]}
        rotation-y={rot}
        castShadow
        receiveShadow
        material={mat}
      >
        <boxGeometry args={[len, H, 0.25]} />
      </mesh>
      <mesh
        position={[(x0 + x1) / 2, H + 0.06, (z0 + z1) / 2]}
        rotation-y={rot}
        material={mats.concrete}
      >
        <boxGeometry args={[len + 0.1, 0.12, 0.38]} />
      </mesh>
    </group>
  );
}

/** How far the Acme Road sliding gate is rolled back along the fence: half its width. */
const GATE_SLIDE = (GATE.x1 - GATE.x0) / 2;

/** One gate leaf of black vertical bars between top and bottom rails, hinged at its origin, along +x. */
function GateLeaf({
  length,
  height = 2.4,
  mats,
}: {
  length: number;
  height?: number;
  mats: Mats;
}) {
  const geo = useMemo(() => {
    const h = height;
    const bars: THREE.BufferGeometry[] = [];
    for (let x = 0.12; x <= length; x += 0.14)
      bars.push(
        new THREE.BoxGeometry(0.035, h - 0.1, 0.035).translate(
          x,
          h / 2 + 0.05,
          0,
        ),
      );
    bars.push(
      new THREE.BoxGeometry(length, 0.1, 0.07).translate(
        length / 2,
        h - 0.05,
        0,
      ),
    );
    bars.push(
      new THREE.BoxGeometry(length, 0.1, 0.07).translate(length / 2, 0.15, 0),
    );
    bars.push(new THREE.BoxGeometry(0.08, h, 0.08).translate(0.04, h / 2, 0));
    bars.push(new THREE.BoxGeometry(0.08, h, 0.08).translate(length, h / 2, 0));
    return mergeGeometries(bars.map((g) => g.toNonIndexed()))!;
  }, [length, height]);
  return <mesh geometry={geo} material={mats.black} castShadow />;
}

function Perimeter({ mats }: { mats: Mats }) {
  return (
    <group>
      <WallRun
        x0={PLOT.x0}
        z0={PLOT.z0}
        x1={PLOT.x1}
        z1={PLOT.z0}
        mats={mats}
      />
      <WallRun
        x0={PLOT.x1}
        z0={PLOT.z0}
        x1={PLOT.x1}
        z1={PLOT.z1}
        mats={mats}
      />
      <WallRun
        x0={PLOT.x0}
        z0={PLOT.z0}
        x1={PLOT.x0}
        z1={PED_GATE.z0}
        mats={mats}
      />
      <WallRun
        x0={PLOT.x0}
        z0={PED_GATE.z1}
        x1={PLOT.x0}
        z1={PLOT.z1 - 9}
        mats={mats}
      />
      <WallRun
        x0={GATE.x1}
        z0={PLOT.z1}
        x1={PLOT.x1}
        z1={PLOT.z1}
        mats={mats}
      />
      <WallRun
        x0={PLOT.x0 + 9}
        z0={PLOT.z1}
        x1={GATE.x0}
        z1={PLOT.z1}
        mats={mats}
      />
      {/* the café corner, walled to the same height as the rest */}
      <WallRun
        x0={PLOT.x0}
        z0={PLOT.z1 - 9}
        x1={PLOT.x0}
        z1={PLOT.z1}
        mats={mats}
      />
      <WallRun
        x0={PLOT.x0}
        z0={PLOT.z1}
        x1={PLOT.x0 + 9}
        z1={PLOT.z1}
        mats={mats}
      />
      {/* the wide black bar gate on Acme Road: one sliding leaf on a ground track, rolled halfway
          open along the inside of the fence (it slides sideways, never swings) */}
      <group position={[GATE.x0 - GATE_SLIDE, 0, PLOT.z1 - 0.35]}>
        <GateLeaf length={GATE.x1 - GATE.x0} height={2.9} mats={mats} />
        {[0.6, GATE.x1 - GATE.x0 - 0.6].map((x) => (
          <mesh key={x} position={[x, 0.09, 0]} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.09, 0.09, 0.08, 12]} />
            <meshStandardMaterial
              color="#222"
              metalness={0.6}
              roughness={0.4}
            />
          </mesh>
        ))}
      </group>
      <Box
        x0={GATE.x0 - GATE_SLIDE - 0.2}
        x1={GATE.x1}
        y1={0.03}
        z0={PLOT.z1 - 0.4}
        z1={PLOT.z1 - 0.3}
        mat={mats.steel}
        cast={false}
      />
      {[GATE.x0, GATE.x1].map((x) => (
        <Box
          key={x}
          x0={x - 0.3}
          x1={x + 0.3}
          y1={3.0}
          z0={PLOT.z1 - 0.3}
          z1={PLOT.z1 + 0.3}
          mat={mats.pillar}
        />
      ))}
      {/* the pedestrian gate on the main road, standing open */}
      <group position={[PLOT.x0, 0, PED_GATE.z0 + 0.3]} rotation-y={1.25}>
        <group rotation-y={-Math.PI / 2}>
          <GateLeaf
            length={PED_GATE.z1 - PED_GATE.z0 - 0.6}
            height={2.9}
            mats={mats}
          />
        </group>
      </group>
      {[PED_GATE.z0, PED_GATE.z1].map((z) => (
        <Box
          key={z}
          x0={PLOT.x0 - 0.3}
          x1={PLOT.x0 + 0.3}
          y1={3.2}
          z0={z - 0.3}
          z1={z + 0.3}
          mat={mats.white}
        />
      ))}
      {/* creepers spilling over the back wall */}
      {Array.from({ length: 14 }, (_, i) => PLOT.x0 + 3 + i * 4.2).map(
        (x, i) => (
          <mesh
            key={x}
            position={[x, 2.7, PLOT.z0 + 0.15]}
            scale={[1.4, 0.7 + (i % 3) * 0.25, 0.4]}
            material={mats.leaf}
          >
            <icosahedronGeometry args={[1, 1]} />
          </mesh>
        ),
      )}
    </group>
  );
}

// ---------------- props ----------------

function ParkedCars() {
  const { geos, list, mats } = useMemo(() => {
    const geos = [sedan(), suv()];
    const cols = [
      "#c2121c",
      "#e9ecf0",
      "#1c1f26",
      "#8a8f96",
      "#2c4a7a",
      "#b98a4a",
      "#f2f2f2",
      "#7a1616",
    ];
    const list: { k: number; x: number; z: number; r: number; c: string }[] =
      [];
    let n = 0;
    // the car park in the back-left corner, by the second gate: one row nose to the back wall
    for (let x = CAR_PARK.x0 + 1.4; x < CAR_PARK.x1 - 0.8; x += 2.6)
      list.push({
        k: n % 3 === 0 ? 1 : 0,
        x,
        z: CAR_PARK.z0 + 2.5,
        r: Math.PI,
        c: cols[n++ % cols.length],
      });
    const mats = new Map<string, THREE.Material>();
    for (const c of cols)
      mats.set(
        c,
        new THREE.MeshPhysicalMaterial({
          vertexColors: true,
          color: c,
          roughness: 0.3,
          metalness: 0.4,
          clearcoat: 1,
        }),
      );
    return { geos, list, mats };
  }, []);
  return (
    <group>
      {list.map((c, i) => (
        <mesh
          key={i}
          geometry={geos[c.k]}
          material={mats.get(c.c)}
          position={[c.x, 0, c.z]}
          rotation-y={c.r}
          castShadow
          receiveShadow
        />
      ))}
    </group>
  );
}

function Hoop({ mats }: { mats: Mats }) {
  // post against the west wall, board facing back across the court (−x)
  return (
    <group
      position={[COURT.x1 - 0.2, 0, (COURT.z0 + COURT.z1) / 2]}
      rotation-y={-Math.PI / 2}
    >
      <Box
        x0={-0.12}
        x1={0.12}
        y1={3.6}
        z0={-0.12}
        z1={0.12}
        mat={mats.black}
      />
      <Box
        x0={-0.12}
        x1={0.12}
        y0={3.4}
        y1={3.55}
        z0={0}
        z1={1.2}
        mat={mats.black}
      />
      <mesh position={[0, 3.35, 1.25]}>
        <boxGeometry args={[1.8, 1.05, 0.05]} />
        <meshPhysicalMaterial color="#1f3d8a" roughness={0.3} />
      </mesh>
      <mesh position={[0, 3.3, 1.28]}>
        <boxGeometry args={[0.62, 0.46, 0.02]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0, 3.05, 1.55]} rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.23, 0.018, 6, 24]} />
        <meshStandardMaterial color="#ff5a1f" />
      </mesh>
      <mesh position={[0, 2.85, 1.55]}>
        <cylinderGeometry args={[0.23, 0.15, 0.4, 12, 1, true]} />
        <meshBasicMaterial
          color="#ffffff"
          wireframe
          transparent
          opacity={0.6}
        />
      </mesh>
    </group>
  );
}

function Tent({
  x,
  z,
  face,
  label,
  color,
  mats,
}: {
  x: number;
  z: number;
  face: number;
  label: string;
  color: string;
  mats: Mats;
}) {
  return (
    <group position={[x, 0, z]} rotation-y={face}>
      {[
        [-1.4, -1.4],
        [1.4, -1.4],
        [-1.4, 1.4],
        [1.4, 1.4],
      ].map(([px, pz], i) => (
        <mesh key={i} position={[px, 1.2, pz]} material={mats.steel}>
          <cylinderGeometry args={[0.04, 0.04, 2.4, 6]} />
        </mesh>
      ))}
      <mesh position-y={2.9} rotation-y={Math.PI / 4} castShadow>
        <coneGeometry args={[2.15, 1.1, 4]} />
        <meshStandardMaterial color="#f7f4ee" roughness={0.8} />
      </mesh>
      <mesh position-y={2.25}>
        <boxGeometry args={[3, 0.35, 3]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      <Text
        position={[0, 2.25, 1.52]}
        fontSize={0.24}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
      >
        {label.toUpperCase()}
      </Text>
      <mesh position={[0, 0.5, 0.9]} castShadow>
        <boxGeometry args={[2.2, 1, 0.6]} />
        <meshStandardMaterial color="#fafafa" roughness={0.6} />
      </mesh>
    </group>
  );
}

// ---------------- inside the hall ----------------

/** What the LED wall shows when no video is playing: the Feast banner, glowing. */
function LedArt() {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let live = true;
    billboardArt("feast-wide").then((t) => live && setTex(t));
    return () => {
      live = false;
    };
  }, []);
  if (!tex) return null;
  return (
    <mesh position={[LED.x, LED.y, LED.z - 0.03]}>
      <planeGeometry args={[LED.w, LED.h]} />
      <meshStandardMaterial
        map={tex}
        emissive="#ffffff"
        emissiveMap={tex}
        emissiveIntensity={1.1}
        toneMapped={false}
      />
    </mesh>
  );
}

/** The hall's coloured washes: always there (adding lights later would stall every material's shader), lit only inside. */
const WASH = [
  { at: [0, 7, STAGE.z1 + 3] as const, intensity: 110, distance: 34, hue: 0.9 },
  { at: [-14, 7, 2] as const, intensity: 60, distance: 28, hue: 0.72 },
  { at: [14, 7, 2] as const, intensity: 60, distance: 28, hue: 0.6 },
  { at: [0, 6, 10] as const, intensity: 40, distance: 26, hue: 0.08 },
];

/** The house lights: colour washes that drift through the hues, and warm spots on the pulpit. */
function HallLights() {
  const zone = useGame((s) => s.zone);
  const warm = useGame((s) => s.warm);
  const lit = zone === "hall";
  const lights = useRef<(THREE.PointLight | null)[]>([]);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  // (until the first compile is done they stay in, so it builds the hall's versions too)
  useEffect(() => {
    if (warm) showHallLights(lit);
  }, [warm, lit]);
  // whichever way you're about to go (in from the yard, out from the hall), its shaders are ready
  useEffect(() => {
    if (warm) primeHallLights(gl, scene, camera, zone !== "hall");
  }, [warm, zone, gl, scene, camera]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    WASH.forEach((w, i) => {
      const l = lights.current[i];
      if (!l) return;
      l.intensity = lit ? w.intensity : 0;
      l.color.setHSL((w.hue + t * 0.03 + Math.sin(t * 0.4 + i) * 0.05) % 1, 0.85, 0.6);
    });
  });
  return (
    <>
      {WASH.map((w, i) => (
        <pointLight
          key={i}
          ref={(l) => {
            lights.current[i] = l;
            hallLight(l);
          }}
          position={[...w.at]}
          intensity={0}
          distance={w.distance}
        />
      ))}
      <spotLight
        ref={hallLight}
        position={[0, AUD.h - 2.5, STAGE.z1 + 4]}
        angle={0.25}
        penumbra={0.5}
        intensity={lit ? 140 : 0}
        distance={20}
        color="#ffe2b0"
        target-position={[0, STAGE.h, STAGE.z1 - 2]}
      />
    </>
  );
}

/**
 * The auditorium, laid out in its own frame (see AUD in compound.ts) and placed with AUD_GROUP:
 * the screen along the wall on the annex side, seats right across the room facing it, and a
 * U-shaped gallery round the other three walls. You come in on the audience's left.
 */
function Interior({ mats }: { mats: Mats }) {
  const posters = useTexture([
    "/posters/shola.jpg",
    "/posters/sunmisola.jpg",
    "/posters/kaestrings.jpg",
  ]);
  posters.forEach((t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    // the 3:4 posters fill the square side screens: keep the upper, face-and-title part
    t.repeat.set(1, 0.75);
    t.offset.set(0, 0.22);
  });
  // floor chairs stand on the carpet (FOOT_Y, like the people sitting in them); the gallery's on its deck
  const chairs = useMemo(() => SEAT_LIST.map((p) => new THREE.Matrix4().makeTranslation(p.x, p.y || FOOT_Y, p.z)), []);
  const m = useMemo(
    () => ({
      truss: new THREE.MeshStandardMaterial({ color: "#2b2d33", metalness: 0.7, roughness: 0.4 }),
      duct: new THREE.MeshStandardMaterial({ color: "#3a3c42", metalness: 0.8, roughness: 0.35 }),
      purple: new THREE.MeshStandardMaterial({ color: "#c34dff", emissive: "#b13cff", emissiveIntensity: 3.2, toneMapped: false }),
      carpet: new THREE.MeshStandardMaterial({ color: "#2e2f33", roughness: 1 }),
      lining: new THREE.MeshStandardMaterial({ color: "#2b2730", roughness: 0.92 }),
      acrylic: new THREE.MeshPhysicalMaterial({ color: "#e8f1ff", transparent: true, opacity: 0.35, roughness: 0.05 }),
    }),
    [],
  );
  const W = AUD.x1 - AUD.x0;
  const D = AUD.z1 - AUD.z0;
  const gd = GALLERY.depth;
  const gin = { x0: AUD.x0 + gd, x1: AUD.x1 - gd, z: AUD.z1 - gd };
  const door = { z0: AUD_DOOR.z - AUD_DOOR.w / 2 - 0.3, z1: AUD_DOOR.z + AUD_DOOR.w / 2 + 0.3 };
  const lx = AUD.x0 + LOBBY;
  /** A run of glass rail with a steel cap, from (x0, z0) to (x1, z1) on the gallery's edge. */
  const rail = (x0: number, z0: number, x1: number, z1: number, key: string) => (
    <group key={key}>
      <Box x0={x0 - 0.02} x1={x1 + 0.02} y0={GALLERY.h} y1={GALLERY.h + 1.0} z0={z0 - 0.02} z1={z1 + 0.02} mat={mats.clearGlass} cast={false} />
      <Box x0={x0 - 0.05} x1={x1 + 0.05} y0={GALLERY.h + 1.0} y1={GALLERY.h + 1.06} z0={z0 - 0.05} z1={z1 + 0.05} mat={mats.steel} cast={false} />
    </group>
  );
  return (
    <group position={AUD_GROUP.position} rotation-y={AUD_GROUP.rotation}>
      {/* floor: one dark grey rug wall to wall, aisles and all */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.09, 0]} receiveShadow material={m.carpet}>
        <planeGeometry args={[W, D]} />
      </mesh>
      {/* dark lining inside the shell so daylight doesn't wash the room */}
      <mesh position={[0, AUD.h / 2, AUD.z0 + 0.08]} material={m.lining}>
        <planeGeometry args={[W, AUD.h]} />
      </mesh>
      <mesh position={[0, AUD.h / 2, AUD.z1 - 0.06]} rotation-y={Math.PI} material={m.lining}>
        <planeGeometry args={[W, AUD.h]} />
      </mesh>
      <mesh position={[AUD.x1 - 0.06, AUD.h / 2, 0]} rotation-y={-Math.PI / 2} material={m.lining}>
        <planeGeometry args={[D, AUD.h]} />
      </mesh>
      {/* the lobby wall behind the glass front, open at the main doors */}
      <Box x0={lx - 0.05} x1={lx + 0.05} y1={AUD.h} z0={AUD.z0} z1={door.z0} mat={m.lining} cast={false} />
      <Box x0={lx - 0.05} x1={lx + 0.05} y1={AUD.h} z0={door.z1} z1={AUD.z1} mat={m.lining} cast={false} />
      <Box x0={lx - 0.05} x1={lx + 0.05} y0={3.3} y1={AUD.h} z0={door.z0} z1={door.z1} mat={m.lining} cast={false} />
      {/* fire exits: the right wall and the left wall in front of the gallery */}
      {(
        [
          [AUD.x1 - 0.1, -9, -Math.PI / 2],
          [AUD.x1 - 0.1, 5, -Math.PI / 2],
          [lx + 0.06, -9.5, Math.PI / 2],
        ] as const
      ).map(([x, z, r]) => (
        <group key={x + "-" + z} position={[x, 0, z]} rotation-y={r}>
          <Box x0={-0.95} x1={0.95} y1={2.5} z0={0} z1={0.06} mat={mats.black} cast={false} />
          <Box x0={-0.85} x1={0.85} y1={2.4} z0={0.04} z1={0.08} mat={mats.steel} cast={false} />
          <mesh position={[0, 2.8, 0.1]}>
            <planeGeometry args={[0.7, 0.24]} />
            <meshBasicMaterial color={[0.1, 2.2, 0.6]} toneMapped={false} />
          </mesh>
        </group>
      ))}
      {/* dark ceiling with a steel beam grid and big round ducts */}
      <Box x0={AUD.x0} x1={AUD.x1} y0={AUD.h - 0.6} y1={AUD.h - 0.5} z0={AUD.z0} z1={AUD.z1} mat={mats.black} cast={false} />
      {Array.from({ length: 12 }, (_, i) => AUD.x0 + 1.9 + i * ((W - 3.8) / 11)).map((x) => (
        <Box key={"bx" + x} x0={x - 0.12} x1={x + 0.12} y0={AUD.h - 1.2} y1={AUD.h - 0.6} z0={AUD.z0} z1={AUD.z1} mat={m.truss} cast={false} />
      ))}
      {Array.from({ length: 6 }, (_, i) => AUD.z0 + 3 + i * ((D - 6) / 5)).map((z) => (
        <Box key={"bz" + z} x0={AUD.x0} x1={AUD.x1} y0={AUD.h - 1.0} y1={AUD.h - 0.65} z0={z - 0.1} z1={z + 0.1} mat={m.truss} cast={false} />
      ))}
      {[AUD.z0 + 10, AUD.z1 - 8].map((z) => (
        <mesh key={"d" + z} position={[0, AUD.h - 1.6, z]} rotation-z={Math.PI / 2} material={m.duct}>
          <cylinderGeometry args={[0.45, 0.45, W - 1, 16]} />
        </mesh>
      ))}
      <StageRig />
      <HallLights />
      {/* stage with steps at both front corners and in the middle, a clear pulpit */}
      <Box x0={STAGE.x0} x1={STAGE.x1} y1={STAGE.h} z0={STAGE.z0} z1={STAGE.z1} mat={mats.black} />
      <Box x0={STAGE.x0} x1={STAGE.x1} y0={STAGE.h - 0.06} y1={STAGE.h} z0={STAGE.z1 - 0.02} z1={STAGE.z1 + 0.04} mat={m.purple} cast={false} />
      {[STAGE.x0 + 1.2, STAGE.x1 - 1.2].map((x) =>
        [0, 1, 2].map((k) => (
          <Box key={x + "-" + k} x0={x - 1.2} x1={x + 1.2} y1={STAGE.h - k * 0.4} z0={STAGE.z1} z1={STAGE.z1 + 0.45 * (3 - k)} mat={mats.black} />
        )),
      )}
      <mesh position={[0, STAGE.h + 0.6, STAGE.z1 - 2]} material={m.acrylic}>
        <boxGeometry args={[0.8, 1.2, 0.5]} />
      </mesh>
      <LedArt />
      {/* the wide LED wall (its picture is HTML, placed by Venue) and a square screen at each end */}
      <Box x0={LED.x - LED.w / 2 - 0.25} x1={LED.x + LED.w / 2 + 0.25} y0={LED.y - LED.h / 2 - 0.25} y1={LED.y + LED.h / 2 + 0.25} z0={AUD.z0 + 0.15} z1={AUD.z0 + 0.4} mat={mats.black} />
      {[-1, 1].map((side, i) => {
        const x = LED.x + side * (LED.w / 2 + SIDE_SCREEN.gap + SIDE_SCREEN.size / 2);
        const tex = posters[i === 0 ? 1 : 2];
        return (
          <group key={side} position={[x, LED.y, AUD.z0 + 0.45]}>
            <Box x0={-SIDE_SCREEN.size / 2 - 0.2} x1={SIDE_SCREEN.size / 2 + 0.2} y0={-SIDE_SCREEN.size / 2 - 0.2} y1={SIDE_SCREEN.size / 2 + 0.2} z0={-0.3} z1={-0.05} mat={mats.black} />
            <mesh>
              <planeGeometry args={[SIDE_SCREEN.size, SIDE_SCREEN.size]} />
              <meshStandardMaterial map={tex} emissive="#ffffff" emissiveMap={tex} emissiveIntensity={0.9} toneMapped={false} />
            </mesh>
          </group>
        );
      })}
      <Chairs positions={chairs} />
      {/* the U-shaped gallery on black columns: left arm, back, right arm, glass rail along its edge */}
      <Box x0={lx} x1={gin.x0} y0={GALLERY.h - 0.3} y1={GALLERY.h} z0={GALLERY.z0} z1={AUD.z1} mat={mats.black} />
      <Box x0={gin.x0} x1={gin.x1} y0={GALLERY.h - 0.3} y1={GALLERY.h} z0={gin.z} z1={AUD.z1} mat={mats.black} />
      <Box x0={gin.x1} x1={AUD.x1} y0={GALLERY.h - 0.3} y1={GALLERY.h} z0={GALLERY.z0} z1={AUD.z1} mat={mats.black} />
      {GALLERY_COLUMNS.map(([x, z]) => (
        <Box key={"c" + x + "," + z} x0={x - 0.15} x1={x + 0.15} y1={GALLERY.h - 0.3} z0={z - 0.15} z1={z + 0.15} mat={mats.black} />
      ))}
      {rail(gin.x0, GALLERY.z0, gin.x0, gin.z, "rl")}
      {rail(gin.x0, gin.z, gin.x1, gin.z, "rb")}
      {rail(gin.x1, GALLERY.z0, gin.x1, gin.z, "rr")}
      {rail(lx, GALLERY.z0, gin.x0, GALLERY.z0, "el")}
      {rail(gin.x1, GALLERY.z0, AUD.x1, GALLERY.z0, "er")}
    </group>
  );
}

/** Dense tree canopy around the plot, as in the aerial renders. */
function SurroundingTrees({ world }: { world: LagosWorld }) {
  const { list, trunk, crown, mats } = useMemo(() => {
    let seed = 99;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const list: THREE.Matrix4[] = [];
    const q = new THREE.Quaternion();
    const place = (x: number, z: number) => {
      const s = 0.8 + rnd() * 0.6;
      // only on open ground: never on (or against) a building
      const w = toWorld(x, z);
      for (const [dx, dz] of [
        [0, 0],
        [3, 0],
        [-3, 0],
        [0, 3],
        [0, -3],
      ])
        if (insideBuilding(world, w.x + dx, w.z + dz)) return;
      // never over a road (the crown spreads ~6 m), nor on the car park
      const r = nearestRoad(world, w.x, w.z);
      if (r.road && r.road.type !== "service" && r.dist < r.road.width / 2 + 6.5) return;
      if (x > PARKING.x0 - 4 && x < PARKING.x1 + 4 && z > PARKING.z0 - 4 && z < PARKING.z1 + 4) return;
      list.push(
        new THREE.Matrix4().compose(
          new THREE.Vector3(x + (rnd() - 0.5) * 3, 0, z + (rnd() - 0.5) * 3),
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6),
          new THREE.Vector3(s, s, s),
        ),
      );
    };
    // behind (south) and along the west side, outside the walls
    for (let x = PLOT.x0 - 4; x < PLOT.x1 + 14; x += 5.5)
      for (let k = 0; k < 3; k++) place(x, PLOT.z0 - 4 - k * 6);
    for (let z = PLOT.z0; z < PLOT.z1 + 4; z += 5.5)
      for (let k = 0; k < 3; k++) place(PLOT.x1 + 4 + k * 6, z);
    const trunk = new THREE.CylinderGeometry(0.25, 0.35, 5, 7).translate(
      0,
      2.5,
      0,
    );
    const crown = new THREE.IcosahedronGeometry(4.2, 1)
      .scale(1, 0.8, 1)
      .translate(0, 7, 0);
    const mats = {
      bark: new THREE.MeshStandardMaterial({ color: "#4f3d2c", roughness: 1 }),
      leaf: new THREE.MeshStandardMaterial({
        color: "#2e5a24",
        roughness: 0.9,
        flatShading: true,
      }),
    };
    return { list, trunk, crown, mats };
  }, [world]);
  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material) => (
    <instancedMesh
      args={[geo, mat, list.length]}
      castShadow
      receiveShadow
      ref={(im) => {
        if (!im) return;
        list.forEach((m, i) => im.setMatrixAt(i, m));
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
      }}
    />
  );
  return (
    <group>
      {inst(trunk, mats.bark)}
      {inst(crown, mats.leaf)}
    </group>
  );
}

// ---------------- assembly ----------------

export function FusionCentre({ world }: { world: LagosWorld }) {
  void world;
  const mats = useMats();
  // phones build the hall's insides only once you're walking the venue (the aerial never sees
  // through the roof): thousands of chairs and the stage rig are a lot to carry for nothing
  const inVenue = useGame((s) => s.stage === "venue");
  return (
    <group
      position={[COMPOUND.center[0], 0, COMPOUND.center[1]]}
      rotation-y={COMPOUND.rotation}
    >
      <Grounds mats={mats} />
      <Perimeter mats={mats} />
      <Hall mats={mats} />
      <Annex mats={mats} />
      {/* the hall's insides only exist once you're in the compound (never in the opening film) */}
      {/* always there on computers, so the hall is full seen through the doors and nothing compiles as you walk in */}
      {(!Q.lite || inVenue) && <Interior mats={mats} />}
      <Kiosk mats={mats} />
      <Hoop mats={mats} />
      <ParkedCars />
      <SurroundingTrees world={world} />
      <RegistrationPavilion t={TENTS.find((t) => t.id === "register")!} />
      <MerchStore t={TENTS.find((t) => t.id === "merch")!} />
      {TENTS.filter((t) => t.id !== "register" && t.id !== "merch").map((t) => (
        <Tent
          key={t.id}
          x={t.x}
          z={t.z}
          face={t.face}
          label={t.label}
          color={t.color}
          mats={mats}
        />
      ))}
      {/* palms around the café corner and at the front, as in the renders */}
      <Palm x={KIOSK.x - 3.6} z={KIOSK.z - 4.6} h={11} lean={0.05} />
      <Palm
        x={KIOSK.x + 3.4}
        z={KIOSK.z - 4.2}
        h={9.5}
        lean={-0.07}
        rot={1.2}
      />
      <Palm x={KIOSK.x + 3.0} z={KIOSK.z + 4.2} h={12} lean={0.04} rot={2.4} />
      <Palm x={-8.6} z={HALL.z1 + 4.4} h={8} lean={0.05} rot={0.6} />
      <Palm x={PLOT.x1 - 1.6} z={PLOT.z1 - 2} h={9} lean={-0.05} rot={3.3} />
    </group>
  );
}
