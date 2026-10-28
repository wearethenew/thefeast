"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import { Character } from "../avatar/Character";
import { ATTENDEE_NAMES, NameTag } from "../avatar/NameTag";
import { AVATARS, ROBES, SKIN_TONES } from "../data/avatars";
import * as THREE from "three";
import { useGame } from "../store";
import { Airliner } from "./Airliner";
import { toWorld } from "./compound";

// shot 1: a drone behind the hall, the blue roof below and the jet coming in over it
const DRONE_CAM = toWorld(30, -62).setY(36);
const ROOF = toWorld(4, -2).setY(11);

// Final approach into Lagos: the plane sweeps in over the Fusion Centre's blue roof,
// lines up with runway 18R at Murtala Muhammed and touches down.

/** Height of the fuselage centre above the ground with the gear down (wheels touch y = 0). */
export const GEAR = 3.72;

export const APPROACH_PATH = new THREE.CatmullRomCurve3(
  [
    [1400, 520, -2600],
    [700, 260, -1100],
    [0, 125, 20], // low over the Fusion Centre's blue roof
    [-1100, 120, 1300],
    [-1640, 95, 2250],
    [-1676, 30, 2900],
    [-1674, GEAR + 0.4, 3200], // threshold: main gear touches down
    [-1668, GEAR, 3900],
    [-1662, GEAR, 4300],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z)),
  false,
  "centripetal",
);

const DURATION = 24;

export function Approach() {
  const afterLanding = useGame((s) => s.afterLanding);
  const plane = useRef<THREE.Group>(null);
  const t = useRef(0);
  const camera = useThree((s) => s.camera);
  const camPos = useRef(new THREE.Vector3(30, 3, 40));
  const done = useRef(false);
  const len = useMemo(() => APPROACH_PATH.getLength(), []);
  // path fraction where the jet is right above the Fusion Centre
  const tFusion = useMemo(() => {
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i <= 400; i++) {
      const d = APPROACH_PATH.getPointAt(i / 400).setY(0).length();
      if (d < bd) {
        bd = d;
        best = i / 400;
      }
    }
    return best;
  }, []);

  const [deplaning, setDeplaning] = useState(false);

  useFrame((_, dt) => {
    if (deplaning) return;
    t.current = Math.min(1, t.current + dt / DURATION);
    // decelerate along the path: fast cruise, slow rollout
    const u = 1 - Math.pow(1 - t.current, 1.6);
    const p = APPROACH_PATH.getPointAt(u);
    const ahead = APPROACH_PATH.getPointAt(Math.min(1, u + 8 / len));
    if (plane.current) {
      plane.current.position.copy(p);
      // never below the gear line, whatever the spline does between control points
      plane.current.position.y = Math.max(GEAR, p.y);
      plane.current.lookAt(ahead.setY(Math.max(GEAR, ahead.y)));
      // bank into the turn
      const tangent = ahead.clone().sub(p).setY(0).normalize();
      const next = APPROACH_PATH.getPointAt(Math.min(1, u + 60 / len)).sub(p).setY(0).normalize();
      const bank = THREE.MathUtils.clamp(tangent.clone().cross(next).y * 4, -0.5, 0.5);
      plane.current.rotateZ(bank);
    }
    if (u < tFusion + 0.035) {
      camPos.current.copy(DRONE_CAM);
      camera.position.copy(camPos.current);
      // keep the blue roof in frame while the jet comes over it
      // blend view directions (not points): roof-centred at first, following the jet as it arrives
      const k = THREE.MathUtils.smoothstep(p.distanceTo(ROOF), 1800, 100);
      const toRoof = ROOF.clone().sub(DRONE_CAM).normalize();
      const toJet = p.clone().sub(DRONE_CAM).normalize();
      const dir = toRoof.lerp(toJet, 0.3 + 0.55 * k).normalize();
      camera.lookAt(DRONE_CAM.clone().add(dir));
    } else {
      // shot 2: chase the jet down to the runway
      const back = p.clone().sub(ahead).setY(0).normalize();
      const want = p.clone().add(back.multiplyScalar(60)).add(new THREE.Vector3(18, 14, 0));
      camPos.current.lerp(want, 1 - Math.exp(-dt * 1.5));
      camera.position.copy(camPos.current);
      camera.lookAt(p);
    }
    useGame.setState((s) => ({ tele: { ...s.tele, flightT: u } }));
    if (t.current >= 1 && !done.current) {
      done.current = true;
      setDeplaning(true);
    }
  });

  return deplaning ? <Deplane onDone={afterLanding} /> : <Airliner ref={plane} gearDown />;
}

// ---------- arrival at the stand: airstairs, passengers walking to the terminal ----------

/** Stand on the domestic apron, nose north; the forward door (left side) faces the terminal. */
const STAND = new THREE.Vector3(-1330, GEAR, 4462);
const STAND_ROT = Math.PI; // nose toward −z (north): the left-side door faces east, toward the terminal
const DOOR_LOCAL = new THREE.Vector3(-1.95, 1.1, 11.5);
const DEPLANE_TIME = 11;

function toStandWorld(v: THREE.Vector3) {
  return v.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), STAND_ROT).add(STAND);
}

function Airstairs() {
  const door = toStandWorld(DOOR_LOCAL);
  const steps = 16;
  const height = door.y - 0.05;
  return (
    <group position={[door.x, 0, door.z]} rotation-y={Math.PI / 2}>
      {Array.from({ length: steps }, (_, i) => (
        <mesh key={i} position={[0, height * ((i + 1) / steps), 0.6 + (steps - 1 - i) * 0.32]} castShadow>
          <boxGeometry args={[1.3, 0.06, 0.3]} />
          <meshStandardMaterial color="#c9cdd3" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      {[-0.68, 0.68].map((x) => (
        <mesh key={x} position={[x, height / 2 + 0.5, 0.6 + (steps * 0.32) / 2]} rotation-x={Math.atan2(height, steps * 0.32)}>
          <boxGeometry args={[0.05, 0.06, Math.hypot(height, steps * 0.32) + 0.3]} />
          <meshStandardMaterial color="#e7e9ec" metalness={0.7} />
        </mesh>
      ))}
      {/* stair truck chassis, tucked under the upper flight so people step off the bottom freely */}
      <mesh position={[0, 0.65, 1.9]} castShadow>
        <boxGeometry args={[2.0, 1.3, 2.6]} />
        <meshStandardMaterial color="#f2b705" roughness={0.5} />
      </mesh>
    </group>
  );
}

type Walker = { id: string; name: string; you: boolean; avatarId: string; robeId: string; skin: string; delay: number; hoodUp: boolean };

/** One passenger: down the stairs, then across the tarmac toward the terminal. */
function Passenger({ w, start }: { w: Walker; start: React.RefObject<number | null> }) {
  const ref = useRef<THREE.Group>(null);
  const door = useMemo(() => toStandWorld(DOOR_LOCAL), []);
  const foot = useMemo(() => door.clone().addScaledVector(new THREE.Vector3(Math.cos(STAND_ROT), 0, -Math.sin(STAND_ROT)), -5.6).setY(0), [door]);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    if (start.current === null) return;
    const t = clock.elapsedTime - start.current - w.delay;
    let pos: THREE.Vector3;
    let face: THREE.Vector3;
    if (t < 0) {
      g.visible = false;
      return;
    }
    g.visible = true;
    if (t < 3.2) {
      pos = door.clone().lerp(foot, t / 3.2);
      pos.y = door.y * (1 - t / 3.2);
      face = foot.clone().sub(door).setY(0);
    } else {
      // across the apron toward the terminal and the waiting danfos and cabs
      const k = (t - 3.2) * 1.35;
      const dir = new THREE.Vector3(1, 0, -0.25).normalize();
      pos = foot.clone().addScaledVector(dir, k).add(new THREE.Vector3(0, 0, (w.delay % 1.2) - 0.6));
      face = dir;
    }
    g.position.copy(pos);
    g.rotation.y = Math.atan2(face.x, face.z);
  });
  return (
    <group ref={ref} visible={false}>
      <Character avatarId={w.avatarId} robeId={w.robeId} skin={w.skin} hoodUp={w.hoodUp} anim="walk" torch={w.you ? "lit" : "none"} torchLight={false} timeScale={0.9} />
      <NameTag name={w.name} you={w.you} />
    </group>
  );
}

function Deplane({ onDone }: { onDone: () => void }) {
  const player = useGame((s) => s.player);
  const camera = useThree((s) => s.camera);
  const start = useRef<number | null>(null);
  const finished = useRef(false);
  const walkers = useMemo<Walker[]>(() => {
    const list: Walker[] = [];
    for (let i = 0; i < 6; i++) {
      const a = AVATARS[(i * 5 + 1) % AVATARS.length];
      list.push({ id: "p" + i, name: ATTENDEE_NAMES[(i + 3) % ATTENDEE_NAMES.length], you: false, avatarId: a.id, robeId: ROBES[i % 4].id, skin: a.sex === "f" ? SKIN_TONES[3] : SKIN_TONES[0], delay: i * 1.1 + (i >= 2 ? 1.2 : 0), hoodUp: i % 2 === 0 });
    }
    // you come off third
    list.splice(2, 0, { id: "you", name: player.name || "You", you: true, avatarId: player.avatarId, robeId: player.robeId, skin: player.skin, delay: 2.3, hoodUp: player.hoodUp });
    return list;
  }, [player]);
  const door = useMemo(() => toStandWorld(DOOR_LOCAL), []);
  useFrame(({ clock }) => {
    if (start.current === null) start.current = clock.elapsedTime;
    const t = clock.elapsedTime - start.current;
    // camera on the apron, beside the stairs, looking up at the door, easing back as people walk off
    const cam = door.clone().add(new THREE.Vector3(14 + t * 0.6, 2.2 + t * 0.15, 9 + t * 0.4));
    camera.position.lerp(cam, t < 0.1 ? 1 : 0.05);
    camera.lookAt(door.x + 4, 2 + Math.max(0, 2.5 - t * 0.3), door.z - 1);
    if (t > DEPLANE_TIME && !finished.current) {
      finished.current = true;
      onDone();
    }
  });
  return (
    <group>
      <group position={STAND} rotation-y={STAND_ROT}>
        <Airliner gearDown />
      </group>
      <Airstairs />
      {walkers.map((w) => (
        <Passenger key={w.id} w={w} start={start} />
      ))}
    </group>
  );
}
