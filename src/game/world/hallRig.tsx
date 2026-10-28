"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { AUD, LED, SIDE_SCREEN, STAGE } from "./compound";
import { useGame } from "../store";
import { chairLogo } from "./fcTextures";

// The main hall's furniture and show kit, after the interior renders (references/fusion-centre
// render-03 to 08): padded stacking chairs in dark bluish-grey leather on black metal frames, and
// a concert rig — moving heads with visible beams and pars on box truss, flown line arrays beside
// the screens, subwoofers on the floor and monitor wedges on the stage. Laid out in the
// auditorium's frame (AUD: the screen at −z), inside the Interior's group.

const tube = (a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 6) => {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
  g.translate(a.x, a.y, a.z);
  return g;
};
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** A stacking church chair facing −z: padded seat and back, thin black frame. */
function chairGeometries() {
  const seat = new RoundedBoxGeometry(0.46, 0.085, 0.45, 2, 0.035);
  seat.translate(0, 0.47, 0);
  const back = new RoundedBoxGeometry(0.46, 0.5, 0.07, 2, 0.03);
  back.rotateX(0.12);
  back.translate(0, 0.8, 0.235);
  const cushion = mergeGeometries([seat.toNonIndexed(), back.toNonIndexed()])!;
  const frame = mergeGeometries(
    [
      // front legs
      tube(v(-0.2, 0, -0.19), v(-0.2, 0.44, -0.18), 0.011),
      tube(v(0.2, 0, -0.19), v(0.2, 0.44, -0.18), 0.011),
      // rear legs running up into the back frame
      tube(v(-0.2, 0, 0.21), v(-0.21, 1.03, 0.3), 0.011),
      tube(v(0.2, 0, 0.21), v(0.21, 1.03, 0.3), 0.011),
      // seat rails
      tube(v(-0.2, 0.43, -0.19), v(-0.2, 0.43, 0.22), 0.01),
      tube(v(0.2, 0.43, -0.19), v(0.2, 0.43, 0.22), 0.01),
      tube(v(-0.2, 0.43, -0.18), v(0.2, 0.43, -0.18), 0.009),
    ].map((g) => g.toNonIndexed()),
  )!;
  // The New's mark embroidered on the backrest: big on the back (what the row behind sees), smaller
  // on the front; planes just off the cushion, tilted with it
  const rear = new THREE.PlaneGeometry(0.24, 0.24);
  rear.rotateX(0.12);
  rear.translate(0, 0.84, 0.279);
  const front = new THREE.PlaneGeometry(0.15, 0.15);
  front.rotateY(Math.PI);
  front.rotateX(0.12);
  front.translate(0, 0.875, 0.2055);
  const logo = mergeGeometries([rear, front])!;
  return { cushion, frame, logo };
}

export function Chairs({ positions }: { positions: THREE.Matrix4[] }) {
  const { geos, mats } = useMemo(
    () => ({
      geos: chairGeometries(),
      mats: {
        leather: new THREE.MeshPhysicalMaterial({ color: "#3a4150", roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.45, sheen: 0.4, sheenColor: new THREE.Color("#6b7690"), sheenRoughness: 0.6 }),
        metal: new THREE.MeshStandardMaterial({ color: "#121316", metalness: 0.65, roughness: 0.35 }),
        logo: (() => {
          const map = chairLogo();
          return new THREE.MeshStandardMaterial({ map, alphaTest: 0.45, roughness: 0.7, emissive: "#f2c230", emissiveMap: map, emissiveIntensity: 0.18, polygonOffset: true, polygonOffsetFactor: -2 });
        })(),
      },
    }),
    [],
  );
  const fill = (im: THREE.InstancedMesh | null) => {
    if (!im) return;
    positions.forEach((m, i) => im.setMatrixAt(i, m));
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
  };
  return (
    <>
      <instancedMesh args={[geos.cushion, mats.leather, positions.length]} receiveShadow castShadow ref={fill} />
      <instancedMesh args={[geos.frame, mats.metal, positions.length]} ref={fill} />
      <instancedMesh args={[geos.logo, mats.logo, positions.length]} ref={fill} />
    </>
  );
}

const beamMaterial = (color: string) =>
  new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    vertexShader: "varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = uv.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }",
    fragmentShader:
      "uniform vec3 uColor; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float edge = pow(abs(dot(vN, vV)), 1.5); float fade = pow(vY, 1.6); gl_FragColor = vec4(uColor * edge * fade * 0.55, 1.0); }",
  });

/** A moving head hanging from the truss: yoke, head, glowing lens and a sweeping beam of light. */
function MovingHead({ x, color, seed }: { x: number; color: string; seed: number }) {
  const pan = useRef<THREE.Group>(null);
  const tilt = useRef<THREE.Group>(null);
  const beam = useMemo(() => {
    // open cone, apex at the lens, 11 m long, uv.y = 1 at the lens
    const g = new THREE.CylinderGeometry(0.06, 1.1, 11, 20, 1, true);
    g.translate(0, -5.5, 0);
    return g;
  }, []);
  const mat = useMemo(() => beamMaterial(color), [color]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 0.45 + seed;
    if (pan.current) pan.current.rotation.y = Math.sin(t) * 0.7;
    // tilted out over the people (+z) and sweeping the front of the stage: never back onto the screen
    if (tilt.current) tilt.current.rotation.x = -0.6 + Math.sin(t * 1.3 + seed) * 0.42;
  });
  return (
    <group position={[x, -0.25, 0]}>
      <mesh position={[0, -0.06, 0]}>
        <boxGeometry args={[0.34, 0.12, 0.28]} />
        <meshStandardMaterial color="#17181c" metalness={0.5} roughness={0.4} />
      </mesh>
      <group ref={pan} position={[0, -0.14, 0]}>
        <mesh position={[0, -0.12, 0]}>
          <boxGeometry args={[0.32, 0.22, 0.06]} />
          <meshStandardMaterial color="#17181c" metalness={0.5} roughness={0.4} />
        </mesh>
        <group ref={tilt} position={[0, -0.26, 0]}>
          <mesh rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[0.13, 0.13, 0.26, 14]} />
            <meshStandardMaterial color="#1c1d22" metalness={0.5} roughness={0.35} />
          </mesh>
          <mesh position={[0, -0.14, 0]} rotation-x={Math.PI / 2}>
            <circleGeometry args={[0.09, 16]} />
            <meshBasicMaterial color={new THREE.Color(color).multiplyScalar(4)} toneMapped={false} side={THREE.DoubleSide} />
          </mesh>
          <mesh geometry={beam} material={mat} position={[0, -0.15, 0]} renderOrder={4} />
        </group>
      </group>
    </group>
  );
}

/** Box truss: four chords and cross rungs. */
function Truss({ length }: { length: number }) {
  const geo = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [];
    const s = 0.18;
    for (const [y, z] of [[s, s], [s, -s], [-s, s], [-s, -s]]) parts.push(tube(v(-length / 2, y, z), v(length / 2, y, z), 0.025, 6));
    for (let x = -length / 2; x <= length / 2 + 0.01; x += 0.5) {
      parts.push(tube(v(x, -s, s), v(x + 0.25, s, s), 0.012, 4));
      parts.push(tube(v(x, -s, -s), v(x + 0.25, s, -s), 0.012, 4));
      parts.push(tube(v(x, s, -s), v(x, s, s), 0.012, 4));
      parts.push(tube(v(x, -s, -s), v(x, -s, s), 0.012, 4));
    }
    return mergeGeometries(parts.map((g) => g.toNonIndexed()))!;
  }, [length]);
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial color="#9ea2a8" metalness={0.85} roughness={0.3} />
    </mesh>
  );
}

/**
 * A fixed beam that slowly changes colour (each one a little out of step with the next), hung
 * from a truss and aimed down at the people in front of the stage.
 */
function ColourBeam({ x, seed, aim = -0.75, length = 13 }: { x: number; seed: number; aim?: number; length?: number }) {
  const beam = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.07, 1.3, length, 20, 1, true);
    g.translate(0, -length / 2, 0);
    return g;
  }, [length]);
  const mat = useMemo(() => beamMaterial("#ffffff"), []);
  const lens = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false, side: THREE.DoubleSide }), []);
  const swing = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const hue = (seed * 0.137 + t * 0.06) % 1;
    (mat.uniforms.uColor.value as THREE.Color).setHSL(hue, 1, 0.55);
    lens.color.setHSL(hue, 1, 0.6).multiplyScalar(4);
    // a slow breathing sway, not a sweep
    if (swing.current) swing.current.rotation.z = Math.sin(t * 0.35 + seed) * 0.12;
  });
  return (
    <group position={[x, -0.3, 0]}>
      <mesh>
        <cylinderGeometry args={[0.12, 0.14, 0.3, 12]} />
        <meshStandardMaterial color="#141417" metalness={0.6} roughness={0.35} />
      </mesh>
      <group ref={swing} rotation-x={aim}>
        <mesh position={[0, -0.16, 0]} rotation-x={Math.PI / 2} material={lens}>
          <circleGeometry args={[0.1, 14]} />
        </mesh>
        <mesh geometry={beam} material={mat} position={[0, -0.16, 0]} renderOrder={4} />
      </group>
    </group>
  );
}

const BEAMS = ["#ff3bd2", "#5b7bff", "#ffffff", "#ff3bd2", "#7d5bff", "#ffd27a", "#5b7bff", "#ff3bd2", "#ffffff", "#7d5bff"];

/** Pars, moving heads, flown line arrays, subwoofers and stage monitors. */
export function StageRig() {
  const lit = useGame((s) => s.zone === "hall");
  const cx = 0;
  const span = AUD.x1 - AUD.x0 - 4;
  const cab = useMemo(() => new THREE.MeshStandardMaterial({ color: "#121214", roughness: 0.7, metalness: 0.2 }), []);
  const grille = useMemo(() => new THREE.MeshStandardMaterial({ color: "#26272b", roughness: 0.95, metalness: 0.1 }), []);
  const lineArrayX = [-1, 1].map((side) => LED.x + side * (LED.w / 2 + SIDE_SCREEN.gap / 2));
  return (
    <group>
      {/* front truss with moving heads, back truss with warm pars */}
      <group position={[cx, AUD.h - 2.3, STAGE.z1 + 1.2]}>
        <Truss length={span} />
        {[...BEAMS, ...BEAMS].map((c, i, all) => (
          <MovingHead key={i} x={-span / 2 + 1.5 + (i * (span - 3)) / (all.length - 1)} color={c} seed={i * 1.7} />
        ))}
      </group>
      {/* colour-changing beams over the people: across the middle of the room and the back */}
      {[STAGE.z1 + 13, STAGE.z1 + 21].map((z, row) => (
        <group key={z} position={[cx, AUD.h - 1.9, z]}>
          <Truss length={span - 6} />
          {Array.from({ length: 12 }, (_, i) => -(span - 6) / 2 + 1 + (i * (span - 8)) / 11).map((x, i) => (
            <ColourBeam key={x} x={x} seed={i + row * 5} aim={row ? 0.5 : -0.55} length={11} />
          ))}
        </group>
      ))}
      <group position={[cx, AUD.h - 2.3, STAGE.z1 + 8]}>
        <Truss length={span} />
        {Array.from({ length: 14 }, (_, i) => -span / 2 + 1 + (i * (span - 2)) / 13).map((x, i) => (
          <group key={x} position={[x, -0.32, 0]} rotation-x={-0.7}>
            <mesh>
              <cylinderGeometry args={[0.11, 0.13, 0.32, 12]} />
              <meshStandardMaterial color="#141417" metalness={0.6} roughness={0.35} />
            </mesh>
            <mesh position={[0, -0.165, 0]} rotation-x={Math.PI / 2}>
              <circleGeometry args={[0.1, 14]} />
              <meshBasicMaterial color={i % 3 === 1 ? [4, 2.6, 1.2] : [4.5, 0.5, 0.6]} toneMapped={false} side={THREE.DoubleSide} />
            </mesh>
          </group>
        ))}
      </group>
      {/* flown line arrays beside the screens, curving down toward the seats */}
      {lineArrayX.map((x) => (
        <group key={x} position={[x, 9.4, AUD.z0 + 1.3]}>
          <mesh position={[0, 0.2, 0]}>
            <boxGeometry args={[0.8, 0.08, 0.6]} />
            <meshStandardMaterial color="#1a1b1f" metalness={0.6} roughness={0.4} />
          </mesh>
          {Array.from({ length: 9 }, (_, i) => {
            let y = 0, z = 0, a = 0;
            for (let k = 0; k < i; k++) {
              a += 0.03 + k * 0.012;
              y -= 0.3 * Math.cos(a);
              z += 0.3 * Math.sin(a);
            }
            return (
              <group key={i} position={[0, y - 0.15, z]} rotation-x={a}>
                <mesh material={cab}>
                  <boxGeometry args={[0.74, 0.28, 0.52]} />
                </mesh>
                <mesh position={[0, 0, 0.262]} material={grille}>
                  <planeGeometry args={[0.7, 0.24]} />
                </mesh>
              </group>
            );
          })}
        </group>
      ))}
      {/* subwoofers on the floor in front of the stage */}
      {[-15, -9, -3.5, 3.5, 9, 15].map((dx) => (
        <group key={dx} position={[cx + dx, 0.32, STAGE.z1 + 0.45]}>
          <mesh material={cab} castShadow>
            <boxGeometry args={[1.1, 0.62, 0.7]} />
          </mesh>
          <mesh position={[0, 0, 0.352]} material={grille}>
            <planeGeometry args={[1.02, 0.54]} />
          </mesh>
        </group>
      ))}
      {/* monitor wedges along the stage edge */}
      {[-12, -7, -2.4, 2.4, 7, 12].map((dx) => (
        <group key={dx} position={[cx + dx, STAGE.h, STAGE.z1 - 0.45]} rotation-x={-0.55}>
          <mesh position={[0, 0.17, 0]} material={cab}>
            <boxGeometry args={[0.62, 0.36, 0.42]} />
          </mesh>
          <mesh position={[0, 0.17, 0.212]} material={grille}>
            <planeGeometry args={[0.56, 0.3]} />
          </mesh>
        </group>
      ))}
      {/* side-fill stacks at the stage wings */}
      {[STAGE.x0 + 0.7, STAGE.x1 - 0.7].map((x) => (
        <group key={x} position={[x, STAGE.h, STAGE.z1 - 1.2]}>
          {[0, 1].map((k) => (
            <group key={k} position={[0, 0.45 + k * 0.92, 0]}>
              <mesh material={cab} castShadow>
                <boxGeometry args={[0.7, 0.9, 0.6]} />
              </mesh>
              <mesh position={[0, 0, 0.302]} material={grille}>
                <planeGeometry args={[0.64, 0.82]} />
              </mesh>
            </group>
          ))}
        </group>
      ))}
      {/* front-of-house washes onto the stage (always there, lit only inside: see HallLights) */}
      {[-6, 6].map((dx) => (
        <spotLight key={dx} position={[cx + dx, AUD.h - 2.4, STAGE.z1 + 8]} angle={0.42} penumbra={0.6} intensity={lit ? 90 : 0} distance={26} color="#ffe6c4" target-position={[cx + dx * 0.4, STAGE.h, STAGE.z1 - 2]} />
      ))}
    </group>
  );
}
