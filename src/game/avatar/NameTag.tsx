"use client";

import { Billboard, Text } from "@react-three/drei";

/** A name floating over someone's head, always facing the camera. */
export function NameTag({ name, y = 2.05, you = false }: { name: string; y?: number; you?: boolean }) {
  const w = Math.max(0.5, name.length * 0.085 + 0.25);
  return (
    <Billboard position-y={y}>
      <mesh position-z={-0.01}>
        <planeGeometry args={[w, 0.24]} />
        <meshBasicMaterial color={you ? "#f2b544" : "#0b1a6e"} transparent opacity={0.85} depthWrite={false} />
      </mesh>
      <Text fontSize={0.14} color={you ? "#111111" : "#ffffff"} anchorX="center" anchorY="middle" fontWeight={700} renderOrder={20}>
        {name}
      </Text>
    </Billboard>
  );
}

export const ATTENDEE_NAMES = ["Grace", "Daniel", "Joy", "Michael", "Esther", "David", "Sarah", "Samuel", "Rachel", "Tolu", "Victoria", "Joshua", "Hannah", "Emeka", "Rebecca", "Jonathan", "Chioma", "Faith", "Peter", "Deborah"];
