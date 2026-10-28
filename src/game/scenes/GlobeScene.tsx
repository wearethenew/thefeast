"use client";

import { Line, OrbitControls, Stars } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { CITIES } from "../data/cities";
import { FUSION_CENTRE, INSTALLATIONS, distanceKm } from "../data/places";
import { Torch } from "../fx/Torch";
import { useGame } from "../store";
import { Airliner } from "../world/Airliner";
import { GLOBE_R, flightArc, getLandDots, latLonToVec } from "../world/geo";
import { CityLights, Clouds, LabelLayer, MapSkin, useAltitude, type GlobeLabel } from "../world/globeLayers";

// The globe: gold land dots from space; zoom in and they give way to a real map with borders,
// highways, city lights and labels, passing through a cloud deck on the way down.

/** How close each kind of origin is framed (altitude in globe units; R = 100 ≈ 6371 km). */
const KM = GLOBE_R / 6371;
function focusAltitude(o: { installationId?: string; lat: number; lon: number }) {
  if (o.installationId && ["ikeja", "island", "yaba"].includes(o.installationId)) return 55 * KM; // whole of Lagos
  if (o.installationId && ["ibadan", "ife", "akure"].includes(o.installationId)) return 260 * KM; // south-west Nigeria
  if (o.installationId) return 420 * KM; // a UK city and its neighbours
  return 900 * KM;
}

function Earth() {
  const dots = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(getLandDots(), 3));
    return g;
  }, []);
  const dotMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uColor: { value: new THREE.Color("#ffcf73") }, uFade: { value: 1 } },
        vertexShader: /* glsl */ `
          varying float vFacing;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vec3 n = normalize(normalMatrix * normalize(position));
            vFacing = dot(n, normalize(-mv.xyz));
            gl_PointSize = clamp(2.6 * (300.0 / -mv.z), 1.0, 9.0);
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor; uniform float uFade;
          varying float vFacing;
          void main() {
            vec2 c = gl_PointCoord - 0.5;
            if (dot(c, c) > 0.25) discard;
            float a = smoothstep(-0.05, 0.25, vFacing) * uFade;
            gl_FragColor = vec4(uColor * (0.55 + 0.6 * vFacing), a * 0.95);
          }
        `,
      }),
    [],
  );
  const atmo = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
          varying vec3 vN; varying vec3 vV;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          varying vec3 vN; varying vec3 vV;
          void main() {
            float f = pow(1.0 - abs(dot(vN, vV)), 3.0);
            gl_FragColor = vec4(mix(vec3(0.25, 0.4, 1.0), vec3(1.0, 0.6, 0.25), 0.25) * f * 1.6, f);
          }
        `,
      }),
    [],
  );
  const atmoRef = useRef<THREE.Mesh>(null);
  const alt = useAltitude();
  useFrame(() => {
    // the halo is a from-space effect; drop it once we're near the ground
    if (atmoRef.current) atmoRef.current.visible = alt() > GLOBE_R * 0.08;
  });
  return (
    <group>
      <mesh>
        <sphereGeometry args={[GLOBE_R * 0.995, 128, 96]} />
        <meshStandardMaterial color="#071560" roughness={0.75} metalness={0.15} emissive="#040b38" />
      </mesh>
      <points geometry={dots} material={dotMat} />
      <MapSkin onFade={(t) => (dotMat.uniforms.uFade.value = 1 - 0.92 * t)} />
      <CityLights />
      <Clouds />
      <mesh ref={atmoRef} material={atmo} scale={1.12}>
        <sphereGeometry args={[GLOBE_R, 64, 32]} />
      </mesh>
    </group>
  );
}

/** A pin standing on the globe at lat/lon; its size follows the camera altitude so it reads at any zoom. */
function Pin({ lat, lon, color, active, big, onClick }: { lat: number; lon: number; color: string; active?: boolean; big?: boolean; onClick?: () => void }) {
  const { pos, quat } = useMemo(() => {
    const p = latLonToVec(lat, lon, GLOBE_R);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.clone().normalize());
    return { pos: p, quat: q };
  }, [lat, lon]);
  const ref = useRef<THREE.Group>(null);
  const alt = useAltitude();
  useFrame(() => ref.current?.scale.setScalar(THREE.MathUtils.clamp(alt() * 0.028, 0.0008, 1.4)));
  const h = big ? 4 : active ? 3.2 : 2.2;
  return (
    <group position={pos} quaternion={quat}>
      <group ref={ref}>
        <mesh position-y={h / 2} onClick={onClick}>
          <cylinderGeometry args={[0.08, 0.08, h, 8]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
        <mesh position-y={h} onClick={onClick}>
          <sphereGeometry args={[active || big ? 0.55 : 0.4, 16, 16]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

function LagosBeacon() {
  const { pos, quat } = useMemo(() => {
    const p = latLonToVec(FUSION_CENTRE.lat, FUSION_CENTRE.lon, GLOBE_R);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.clone().normalize());
    return { pos: p, quat: q };
  }, []);
  const ref = useRef<THREE.Group>(null);
  const alt = useAltitude();
  useFrame(() => ref.current?.scale.setScalar(THREE.MathUtils.clamp(alt() * 0.04, 0.004, 1)));
  return (
    <group position={pos} quaternion={quat}>
      <group ref={ref}>
        <Torch scale={9} position-y={1.5} lightIntensity={0} light={false} />
      </group>
    </group>
  );
}

/** Flies the camera to look straight down on a lat/lon from a given altitude (slerp, never through the earth). */
function useFocus(controls: React.RefObject<OrbitControlsImpl | null>) {
  const camera = useThree((s) => s.camera);
  const target = useRef<{ dir: THREE.Vector3; alt: number } | null>(null);
  useFrame((_, dt) => {
    const t = target.current;
    if (!t) return;
    const k = 1 - Math.exp(-dt * 2.4);
    const dir = camera.position.clone().normalize();
    const alt = camera.position.length() - GLOBE_R;
    const q = new THREE.Quaternion().setFromUnitVectors(dir, t.dir);
    dir.applyQuaternion(new THREE.Quaternion().slerp(q, k));
    // stay high while travelling across the globe, then descend onto the target
    const along = dir.angleTo(t.dir);
    const cruise = Math.max(t.alt, Math.min(GLOBE_R * 1.6, along * GLOBE_R * 1.8));
    const nextAlt = Math.exp(THREE.MathUtils.lerp(Math.log(alt), Math.log(cruise), k));
    camera.position.copy(dir.multiplyScalar(GLOBE_R + nextAlt));
    camera.lookAt(0, 0, 0);
    if (along < 0.0005 && Math.abs(nextAlt - t.alt) / t.alt < 0.02) target.current = null;
    controls.current?.update();
  });
  return {
    focus: (lat: number, lon: number, alt: number) => {
      target.current = { dir: latLonToVec(lat, lon, 1), alt };
    },
    cancel: () => {
      target.current = null;
    },
  };
}

/** Rotation slows down near the ground, and the near plane follows the altitude. */
function AdaptiveControls({ controls }: { controls: React.RefObject<OrbitControlsImpl | null> }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const alt = useAltitude();
  useFrame(() => {
    const a = alt();
    if (controls.current) controls.current.rotateSpeed = THREE.MathUtils.clamp(a / (GLOBE_R * 2.2), 0.0015, 0.6);
    const near = THREE.MathUtils.clamp(a * 0.05, 0.002, 1);
    if (Math.abs(camera.near - near) / near > 0.2) {
      camera.near = near;
      camera.updateProjectionMatrix();
    }
  });
  return null;
}

function ArcPreview({ from }: { from: { lat: number; lon: number } }) {
  const pts = useMemo(() => flightArc(from, FUSION_CENTRE).getPoints(120), [from]);
  return <Line points={pts} color="#ffb347" lineWidth={2} dashed dashSize={1.2} gapSize={0.8} transparent opacity={0.9} />;
}

function OriginPicker() {
  const origin = useGame((s) => s.origin);
  const setOrigin = useGame((s) => s.setOrigin);
  const controls = useRef<OrbitControlsImpl>(null);
  const { focus, cancel } = useFocus(controls);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    camera.position.copy(latLonToVec(15, 0, GLOBE_R * 3.4));
    camera.lookAt(0, 0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (origin) focus(origin.lat, origin.lon, focusAltitude(origin));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin?.lat, origin?.lon]);

  const labels = useMemo<GlobeLabel[]>(() => {
    const out: GlobeLabel[] = [{ id: "feast", lat: FUSION_CENTRE.lat, lon: FUSION_CENTRE.lon, text: "The Feast 2026 · Fusion Centre", kind: "feast" }];
    for (const i of INSTALLATIONS) {
      if (i.id === "ikeja") continue; // that's the Fusion Centre itself
      out.push({
        id: "c-" + i.id,
        lat: i.lat,
        lon: i.lon,
        text: i.name,
        kind: "campus",
        active: origin?.installationId === i.id,
        onClick: () => setOrigin({ lat: i.lat, lon: i.lon, label: i.name, detail: `${i.venue}, ${i.address}`, installationId: i.id }),
      });
    }
    if (origin && !origin.installationId) out.push({ id: "origin", lat: origin.lat, lon: origin.lon, text: origin.label, kind: "origin", active: true });
    for (const c of CITIES) out.push({ id: "city-" + c.name, lat: c.lat, lon: c.lon, text: c.name, kind: "city", tier: c.tier });
    return out;
  }, [origin, setOrigin]);

  return (
    <>
      {INSTALLATIONS.filter((i) => i.id !== "ikeja").map((i) => (
        <Pin
          key={i.id}
          lat={i.lat}
          lon={i.lon}
          color={origin?.installationId === i.id ? "#ffcf5a" : "#9fb4ff"}
          active={origin?.installationId === i.id}
          onClick={() => setOrigin({ lat: i.lat, lon: i.lon, label: i.name, detail: `${i.venue}, ${i.address}`, installationId: i.id })}
        />
      ))}
      {origin && !origin.installationId && <Pin lat={origin.lat} lon={origin.lon} color="#ffcf5a" active />}
      {origin && distanceKm(origin, FUSION_CENTRE) > 60 && <ArcPreview from={origin} />}
      <LabelLayer labels={labels} />
      <OrbitControls
        ref={controls}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={GLOBE_R + 18 * KM}
        maxDistance={GLOBE_R * 4}
        zoomSpeed={0.9}
        onStart={cancel}
      />
      <AdaptiveControls controls={controls} />
    </>
  );
}

function Flight() {
  const origin = useGame((s) => s.origin)!;
  const set = useGame((s) => s.set);
  const curve = useMemo(() => flightArc(origin, FUSION_CENTRE, 200), [origin]);
  const km = distanceKm(origin, FUSION_CENTRE);
  const duration = THREE.MathUtils.clamp(6 + km / 900, 7, 16);
  const plane = useRef<THREE.Group>(null);
  const t = useRef(0);
  const trail = useMemo(() => curve.getPoints(200), [curve]);
  const trailRef = useRef<{ geometry: THREE.InstancedBufferGeometry } | null>(null);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const camPos = useRef(new THREE.Vector3());
  const done = useRef(false);
  const labels = useMemo<GlobeLabel[]>(
    () => [
      { id: "feast", lat: FUSION_CENTRE.lat, lon: FUSION_CENTRE.lon, text: "The Feast 2026 · Lagos", kind: "feast" },
      { id: "from", lat: origin.lat, lon: origin.lon, text: origin.label, kind: "origin", active: true },
      ...CITIES.filter((c) => c.tier === 1).map((c) => ({ id: "city-" + c.name, lat: c.lat, lon: c.lon, text: c.name, kind: "city" as const, tier: c.tier })),
    ],
    [origin],
  );

  useEffect(() => {
    camPos.current.copy(curve.getPoint(0)).multiplyScalar(1.6);
    camera.position.copy(camPos.current);
    camera.near = 0.1;
    camera.updateProjectionMatrix();
    // the chase cam rolls with the globe; put "up" back for the scenes that follow
    return () => void camera.up.set(0, 1, 0);
  }, [curve, camera]);

  useFrame((_, dt) => {
    t.current = Math.min(1, t.current + dt / duration);
    const e = t.current < 0.5 ? 2 * t.current * t.current : 1 - (-2 * t.current + 2) ** 2 / 2;
    const p = curve.getPointAt(e);
    const ahead = curve.getPointAt(Math.min(1, e + 0.01));
    if (plane.current) {
      plane.current.position.copy(p);
      const up = p.clone().normalize();
      const m = new THREE.Matrix4().lookAt(ahead, p, up);
      plane.current.quaternion.setFromRotationMatrix(m);
    }
    // chase cam: above and behind, pulling back over long hauls
    const up = p.clone().normalize();
    const back = p.clone().sub(ahead).normalize();
    const want = p.clone().add(up.multiplyScalar(7 + 16 * Math.sin(Math.PI * e))).add(back.multiplyScalar(16));
    camPos.current.lerp(want, 1 - Math.exp(-dt * 2));
    camera.position.copy(camPos.current);
    // screen "up" points away from the globe so the earth stays below the plane
    camera.up.copy(p).normalize();
    camera.lookAt(p);
    // Line2 draws one instance per segment: reveal the trail as the plane flies
    if (trailRef.current) trailRef.current.geometry.instanceCount = Math.max(1, Math.floor(e * (trail.length - 1)));
    useGame.setState((s) => ({ tele: { ...s.tele, flightT: e } }));
    if (t.current >= 1 && !done.current) {
      done.current = true;
      set({ stage: "drive", flightPhase: "approach", route: "airport" });
    }
  });

  return (
    <>
      <Pin lat={origin.lat} lon={origin.lon} color="#ffcf5a" active />
      <Line ref={trailRef as never} points={trail} color="#ffb347" lineWidth={2.5} />
      <Airliner ref={plane} scale={0.09} />
      <LabelLayer labels={labels} />
    </>
  );
}

export function GlobeScene() {
  const stage = useGame((s) => s.stage);
  return (
    <>
      <color attach="background" args={["#030824"]} />
      <Stars radius={2000} depth={400} count={4000} factor={18} fade speed={0.4} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[300, 200, 400]} intensity={2.2} color="#fff0dd" />
      <directionalLight position={[-300, -100, -200]} intensity={0.6} color="#4c6bff" />
      <Earth />
      <LagosBeacon />
      {stage === "origin" ? <OriginPicker /> : <Flight />}
    </>
  );
}
