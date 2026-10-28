"use client";

import { useFrame, type ThreeElements } from "@react-three/fiber";
import { forwardRef, useMemo, useRef } from "react";
import * as THREE from "three";

// The TORCH from the posters: a flared silver cup with gold inner rim on a black grip with gold bands.
// Origin of the group is the middle of the grip (where the hand holds it); +Y points up the torch.

const silver = new THREE.MeshPhysicalMaterial({ color: "#d9dde3", metalness: 1, roughness: 0.22, clearcoat: 0.6 });
const gold = new THREE.MeshPhysicalMaterial({ color: "#e6b04a", metalness: 1, roughness: 0.28, clearcoat: 0.4 });
const grip = new THREE.MeshStandardMaterial({ color: "#121212", roughness: 0.55, metalness: 0.2 });

function cupGeometry() {
  // lathe profile of the flared cup, with a wavy "petal" lip
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const y = t * 0.2;
    const r = 0.02 + 0.045 * Math.pow(t, 1.6);
    pts.push(new THREE.Vector2(r, y));
  }
  const g = new THREE.LatheGeometry(pts, 48);
  // twist + petal waves, like the sculpted torch on the poster
  const p = g.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    const t = y / 0.2;
    const tw = a + t * 1.1;
    const wave = 1 + 0.12 * t * Math.sin(tw * 3);
    const r = Math.hypot(x, z) * wave;
    p.setXYZ(i, Math.cos(a + t * 0.6) * r, y + 0.012 * t * Math.sin(tw * 3), Math.sin(a + t * 0.6) * r);
  }
  g.computeVertexNormals();
  return g;
}

const flameVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // cylindrical billboard: keep the plane upright, turn it to face the camera
    vec4 center = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vec3 scale = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), 1.0);
    vec3 up = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
    vec3 right = normalize(cross(up, vec3(0.0, 0.0, 1.0)));
    vec4 mv = center + vec4(right * position.x * scale.x + up * position.y * scale.y, 0.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const flameFrag = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uIntensity;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
  void main() {
    vec2 uv = vUv;
    float t = uTime * 1.6 + uSeed * 10.0;
    // turbulence rising upward
    float n = fbm(vec2(uv.x * 3.0, uv.y * 2.4 - t * 1.9));
    float n2 = fbm(vec2(uv.x * 6.0 + 3.1, uv.y * 4.0 - t * 3.1));
    float x = (uv.x - 0.5) * 2.0;
    x += (n - 0.5) * 0.55 * uv.y + (n2 - 0.5) * 0.25 * uv.y;
    float width = mix(0.62, 0.0, pow(uv.y, 0.85));
    float shape = 1.0 - smoothstep(width * 0.55, width, abs(x));
    shape *= smoothstep(0.0, 0.08, uv.y);
    float body = shape * (0.65 + 0.6 * n2) * (1.0 - smoothstep(0.55, 1.0, uv.y + (n - 0.5) * 0.35));
    float core = (1.0 - smoothstep(0.0, width * 0.45, abs(x))) * (1.0 - smoothstep(0.1, 0.55, uv.y));
    vec3 col = mix(vec3(0.9, 0.18, 0.02), vec3(1.0, 0.55, 0.08), smoothstep(0.0, 0.6, body));
    col = mix(col, vec3(1.0, 0.92, 0.6), core);
    float a = clamp(body * 1.4 + core, 0.0, 1.0);
    gl_FragColor = vec4(col * (1.6 + core * 2.5) * uIntensity, a * uIntensity);
  }
`;

function FlamePlane({ seed, scale }: { seed: number; scale: [number, number] }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uSeed: { value: seed }, uIntensity: { value: 1 } },
        vertexShader: flameVert,
        fragmentShader: flameFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [seed],
  );
  useFrame((_, dt) => (mat.uniforms.uTime.value += dt));
  return (
    <mesh material={mat} scale={[scale[0], scale[1], 1]} position-y={scale[1] * 0.42} renderOrder={10}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  );
}

function Embers({ count = 26 }: { count?: number }) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
    return g;
  }, [count]);
  const state = useMemo(() => Array.from({ length: count }, () => ({ life: Math.random(), x: 0, z: 0, vx: 0, vz: 0 })), [count]);
  useFrame((_, dt) => {
    const p = geo.getAttribute("position") as THREE.BufferAttribute;
    state.forEach((e, i) => {
      e.life += dt * (0.5 + (i % 5) * 0.08);
      if (e.life > 1) {
        e.life = 0;
        e.x = (Math.random() - 0.5) * 0.04;
        e.z = (Math.random() - 0.5) * 0.04;
        e.vx = (Math.random() - 0.5) * 0.12;
        e.vz = (Math.random() - 0.5) * 0.12;
      }
      p.setXYZ(i, e.x + e.vx * e.life, 0.05 + e.life * 0.55, e.z + e.vz * e.life);
    });
    p.needsUpdate = true;
  });
  return (
    <points geometry={geo}>
      <pointsMaterial color="#ffb347" size={0.012} transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </points>
  );
}

type TorchProps = { lit?: boolean; light?: boolean; shadows?: boolean; lightIntensity?: number } & Omit<ThreeElements["group"], "ref">;

export const Torch = forwardRef<THREE.Group, TorchProps>(function Torch(
  { lit = true, light = true, shadows = false, lightIntensity = 3.2, ...props },
  ref,
) {
  const cup = useMemo(cupGeometry, []);
  const lightRef = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    if (!lightRef.current) return;
    const t = clock.elapsedTime;
    lightRef.current.intensity = lightIntensity * (0.85 + 0.15 * Math.sin(t * 13.1) * Math.sin(t * 7.3 + 1.2) + 0.05 * Math.sin(t * 31));
  });
  return (
    <group ref={ref} {...props}>
      {/* grip */}
      <mesh material={grip} castShadow>
        <cylinderGeometry args={[0.016, 0.019, 0.3, 20]} />
      </mesh>
      {[-0.15, -0.06, 0.06, 0.15].map((y) => (
        <mesh key={y} material={gold} position-y={y} castShadow>
          <cylinderGeometry args={[0.021, 0.021, y === -0.15 ? 0.03 : 0.012, 20]} />
        </mesh>
      ))}
      <mesh material={silver} position-y={-0.172}>
        <sphereGeometry args={[0.019, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
      </mesh>
      {/* cup */}
      <mesh geometry={cup} material={silver} position-y={0.15} castShadow />
      <mesh material={gold} position-y={0.3} rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.056, 0.004, 8, 40]} />
      </mesh>
      {lit && (
        <group position-y={0.3}>
          <FlamePlane seed={0.13} scale={[0.17, 0.38]} />
          <FlamePlane seed={0.71} scale={[0.12, 0.3]} />
          <Embers />
          {light && (
            <pointLight
              ref={lightRef}
              color="#ff9a3c"
              intensity={lightIntensity}
              distance={7}
              decay={1.6}
              position-y={0.12}
              castShadow={shadows}
              shadow-mapSize={[512, 512]}
              shadow-bias={-0.002}
            />
          )}
        </group>
      )}
    </group>
  );
});
