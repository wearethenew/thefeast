"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

/** Poster-style sky: deep royal blue overhead melting into a warm flame glow at the horizon. */
export function GradientSky({
  top = "#06124a",
  mid = "#1534b8",
  glow = "#ff9a3c",
  glowDir = [0.3, 0.15, -1] as [number, number, number],
  glowAmount = 1.4,
  sharpness = 6,
  spread = 0.6,
}) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          uTop: { value: new THREE.Color(top) },
          uMid: { value: new THREE.Color(mid) },
          uGlow: { value: new THREE.Color(glow) },
          uGlowDir: { value: new THREE.Vector3(...glowDir).normalize() },
          uGlowAmt: { value: glowAmount },
          uSharp: { value: sharpness },
          uSpread: { value: spread },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            // the camera's rotation only: the dome is centred on the eye in the shader itself, so a
            // fast-moving camera (the jets) can never leave it
            vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
            // just inside the far plane: exactly on it (xyww) gets clipped on some GPUs, leaving
            // holes where the page shows through as flat navy
            gl_Position = vec4(p.xy, p.w * 0.99999, p.w);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uTop, uMid, uGlow, uGlowDir;
          uniform float uGlowAmt, uSharp, uSpread;
          varying vec3 vDir;
          void main() {
            float h = vDir.y;
            vec3 col = mix(uMid, uTop, smoothstep(0.0, uSpread, h));
            col = mix(col, uMid * 0.6, smoothstep(0.0, -0.3, h));
            float g = pow(max(dot(vDir, uGlowDir), 0.0), uSharp);
            float band = exp(-abs(h - 0.05) * 9.0);
            col += uGlow * (g * uGlowAmt + band * 0.25 * (0.4 + g) * uGlowAmt);
            gl_FragColor = vec4(col, 1.0);
            // like every other material: tone mapping and the sRGB output conversion, so the sky's
            // colours come out as specified instead of dark
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [top, mid, glow, glowDir.join(), glowAmount, sharpness, spread],
  );
  return (
    <mesh material={mat} frustumCulled={false} renderOrder={-1}>
      <sphereGeometry args={[1, 32, 16]} />
    </mesh>
  );
}

/** Slow drifting embers filling a box around the origin. */
export function EmberField({ count = 400, size = [30, 12, 30] as [number, number, number], color = "#ffb347" }) {
  const ref = useRef<THREE.Points>(null);
  const { geo, speeds } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(count * 3);
    const sp = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      p[i * 3] = (Math.random() - 0.5) * size[0];
      p[i * 3 + 1] = Math.random() * size[1];
      p[i * 3 + 2] = (Math.random() - 0.5) * size[2];
      sp[i] = 0.2 + Math.random() * 0.6;
    }
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    return { geo: g, speeds: sp };
  }, [count, size]);
  useFrame(({ clock }, dt) => {
    const p = geo.getAttribute("position") as THREE.BufferAttribute;
    const t = clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      let y = p.getY(i) + speeds[i] * dt;
      if (y > size[1]) y = 0;
      p.setY(i, y);
      p.setX(i, p.getX(i) + Math.sin(t * 0.7 + i) * dt * 0.08);
    }
    p.needsUpdate = true;
  });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial color={color} size={0.05} transparent opacity={0.85} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </points>
  );
}
