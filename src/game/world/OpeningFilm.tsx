"use client";

import { Html, useTexture } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { GEAR } from "./Approach";
import { billboardFrame } from "./RoadScreen";
import { CORE_MODELS, useCrowdProgress } from "../crowd/CrowdBaker";
import { CrowdRenderer, type Agent } from "../crowd/CrowdRenderer";
import { SetTraffic } from "./SetTraffic";
import {
  advance,
  fill,
  streetPaths,
  yardPaths,
  advanceWanderers,
  makeWanderers,
  boothCrowd,
  fenceBand,
  BoothQueues,
  type Walker,
  type Wanderer,
} from "../crowd/flows";
import { useGame } from "../store";
import { Airliner } from "./Airliner";
import { cityLights } from "./cityGeometry";
import { COMPOUND, toWorld } from "./compound";
import type { LagosWorld } from "./lagosData";
import { GROUPS, streamAt, type Stream } from "./processionData";
import { CAMPUS_SETS, CampusSet, campusStream } from "./CampusSets";
import { useBoardZoom } from "./BoothBoards";

// The opening film (the title screen): real flights bringing people in from abroad, a few quick
// drone passes over campuses walking in, then a slow orbit of the Fusion Centre with both streets
// full of people turning in at the gates. It holds there until you join the crowd.


type Shot = {
  id: string;
  at: number;
  title: string;
  sub: string;
  stream?: string;
};
const JETS_LEN = 9;
/** The Fusion Centre aerial starts from the side where the road billboard faces you, and glides from there into its usual sweep over this long. */
const FROM_BILLBOARD = 9;
/** Shot start times: the jets, then a drone pass in each campus's own place, then the Fusion Centre. */
const SHOTS: Shot[] = (() => {
  const out: Shot[] = [{ id: "jets", at: 0, title: "Flying in", sub: "The New London, The New Birmingham and The New Canada, into Lagos" }];
  let t = JETS_LEN;
  for (const def of CAMPUS_SETS) {
    const g = GROUPS.find((x) => x.id === def.id)!;
    out.push({ id: "s-" + g.id, at: t, title: g.name, sub: g.places ?? "Ogba, Ikeja · nearly there", stream: g.id });
    t += def.seconds;
  }
  out.push({ id: "fusion", at: t, title: "The Fusion Centre, Ogba", sub: "Everyone is arriving · The Feast 2026" });
  return out;
})();

/**
 * The Fusion Centre aerial circles the hall at a sweep angle (0 = from the Acme Road side). This is
 * how far round to start it so the drone sits out in front of the road billboard, its screen in view
 * between the drone and the compound.
 */
const sideCache = new WeakMap<LagosWorld, number>();
function billboardSide(world: LagosWorld) {
  let a = sideCache.get(world);
  if (a !== undefined) return a;
  const b = billboardFrame(world);
  // into the compound's own frame (the film's sweep is laid out in it)
  const rot = -COMPOUND.rotation;
  const toLocal = (x: number, z: number) => [x * Math.cos(rot) + z * Math.sin(rot), -x * Math.sin(rot) + z * Math.cos(rot)];
  const [nx, nz] = toLocal(b.dx, b.dz);
  const c = toWorld(-3, 22);
  const [ox, oz] = toLocal(b.cx - c.x, b.cz - c.z);
  const l = Math.hypot(ox, oz) || 1;
  // halfway between "beyond the billboard from the hall" and "square in front of its screen"
  a = Math.atan2(ox / l + nx, oz / l + nz);
  sideCache.set(world, a);
  return a;
}

// real flights into Lagos, three different aircraft in a loose formation ahead of the camera
const JETS = [
  { label: "British Airways BA75 · The New London", x: -180, y: 430, z0: -1500, dx: -0.12, livery: "#0b1f4a", quad: false, scale: 1.3 },
  { label: "Virgin Atlantic VS411 · The New Birmingham", x: -60, y: 400, z0: -1180, dx: -0.12, livery: "#c8102e", quad: false, scale: 1.05 },
  { label: "Air Canada · The New Canada", x: -330, y: 455, z0: -1020, dx: -0.12, livery: "#1d1d1f", quad: false, scale: 1.15 },
];
const JET_SPEED = 92;
/** Shot lengths (s): London from behind, Birmingham from the front, Canada landing. */
const JET_LENS = [2.5, 2.5, 3.3];
/** Jet time when the landing shot starts, and how long into it the wheels touch the runway. */
const LAND_AT = JET_LENS[0] + JET_LENS[1];
const TOUCHDOWN = 2.6;
/** The Air Canada jet's landing: on Lagos airport's runway (Murtala Muhammed), heading south like the jets. */
const RUNWAY = { td: new THREE.Vector3(-1672.5, GEAR * 1.15, 3350), dir: new THREE.Vector3(0.0116, 0, 1).normalize(), approach: 70, from: 40 };
const RUNWAY_SIDE = new THREE.Vector3(RUNWAY.dir.z, 0, -RUNWAY.dir.x);
/** Seconds after touchdown → metres rolled down the runway (braking to a stop). */
const rolled = (k: number) => {
  const kk = Math.min(Math.max(k, 0), RUNWAY.approach / 16);
  return RUNWAY.approach * kk - 8 * kk * kk;
};
function jetAt(j: (typeof JETS)[number], t: number, out = new THREE.Vector3()) {
  // the last jet, from its shot on: coming down onto the runway, flaring and rolling out
  if (j === JETS[2] && t >= LAND_AT) {
    const k = t - LAND_AT - TOUCHDOWN;
    const along = k < 0 ? RUNWAY.approach * k : rolled(k);
    const up = k < 0 ? RUNWAY.from * Math.pow(-k / TOUCHDOWN, 1.6) : 0;
    return out.copy(RUNWAY.td).addScaledVector(RUNWAY.dir, along).setY(RUNWAY.td.y + up);
  }
  const z = j.z0 + t * JET_SPEED;
  return out.set(j.x + (z - j.z0) * j.dx, j.y - t * 3, z);
}
/** Along the jets' heading, across it, and up. */
const FWD = new THREE.Vector3(JETS[0].dx, 0, 1).normalize();
const SIDE = new THREE.Vector3(FWD.z, 0, -FWD.x);
const UP = new THREE.Vector3(0, 1, 0);
const _p = new THREE.Vector3();
/** pos = at + FWD·f + SIDE·s + UP·u */
const place = (out: THREE.Vector3, at: THREE.Vector3, f: number, s: number, u: number) =>
  out.copy(at).addScaledVector(FWD, f).addScaledVector(SIDE, s).addScaledVector(UP, u);
type JetShot = { len: number; cam: (k: number, pos: THREE.Vector3, look: THREE.Vector3) => void };
/**
 * One steady drone shot of each aircraft, then on to the crowd. k is seconds into the shot;
 * positions follow the jets, which fly on their own clock (jetT). If the crowd still isn't ready,
 * the landing shot carries on (the jet rolling out) until it is.
 */
let jetT = 0;
const JET_SHOTS: JetShot[] = [
  // The New London (BA): riding behind and just above it, the city at dusk far below
  { len: JET_LENS[0], cam: (k, pos, look) => {
    const p = jetAt(JETS[0], jetT, _p);
    pos.set(p.x - 70, p.y + 12, p.z - 95);
    look.set(p.x + 10, p.y - 25, p.z + 120);
  } },
  // The New Birmingham (Virgin): from the front, a little off its nose, as it comes on
  { len: JET_LENS[1], cam: (k, pos, look) => {
    const p = jetAt(JETS[1], jetT, _p);
    place(pos, p, 125 - k * 6, -34, 9);
    place(look, p, 6, 0, 0);
  } },
  // The New Canada (Air Canada): low beside the runway, watching it come down and touch the ground
  { len: JET_LENS[2], cam: (k, pos, look) => {
    const p = jetAt(JETS[2], jetT, _p);
    pos.copy(RUNWAY.td).addScaledVector(RUNWAY.dir, 70).addScaledVector(RUNWAY_SIDE, 62).setY(7);
    look.copy(p).setY(p.y + 2);
  } },
];
const JET_TOTAL = JET_SHOTS.reduce((a, s) => a + s.len, 0);
/** Which shot is on at jet time t (the last one holds until the film moves on). */
function jetShotAt(t: number) {
  jetT = t;
  let k = t;
  for (let i = 0; i < JET_SHOTS.length - 1; i++) {
    if (k < JET_SHOTS[i].len) return { index: i, local: k };
    k -= JET_SHOTS[i].len;
  }
  return { index: JET_SHOTS.length - 1, local: k };
}

function headerCard() {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 96;
  const g = c.getContext("2d")!;
  const grd = g.createLinearGradient(0, 0, 1024, 0);
  grd.addColorStop(0, "#0d1f8a");
  grd.addColorStop(1, "#7d0f22");
  g.fillStyle = grd;
  g.fillRect(0, 0, 1024, 96);
  g.fillStyle = "#f6d06a";
  g.font = "900 46px sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("THE FEAST 2026 · THE TORCH · 11–13 DEC · FUSION CENTRE, OGBA", 512, 50, 1000);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function signTexture(road: string, sub: string) {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 384;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0b6b3a";
  g.fillRect(0, 0, 1024, 384);
  g.strokeStyle = "#ffffff";
  g.lineWidth = 10;
  g.strokeRect(14, 14, 996, 356);
  g.fillStyle = "#ffffff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = "700 92px sans-serif";
  g.fillText(road, 512, 150, 960);
  g.font = "600 46px sans-serif";
  g.fillText(sub, 512, 286, 940);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** A green overhead road sign across a campus's road: a road everyone knows says who's walking. */
export function DirectionSign({ st, s }: { st: Stream; s: number }) {
  const g = st.group;
  const tex = useMemo(() => signTexture(g.road ?? "", g.places ?? ""), [g]);
  const p = streamAt(st, s);
  const rot = Math.atan2(-p.dx, -p.dz);
  const half = p.half + 0.5;
  const W = Math.min(11, 2 * (half + 1.5));
  const H = (W * 384) / 1024;
  const bottom = 6.2;
  return (
    <group position={[p.x, 0, p.z]} rotation-y={rot}>
      {[-1, 1].map((k) => (
        <mesh key={k} position={[k * half, (bottom + H + 0.4) / 2, 0]} castShadow>
          <cylinderGeometry args={[0.2, 0.25, bottom + H + 0.4, 10]} />
          <meshStandardMaterial color="#8a9096" metalness={0.7} roughness={0.4} />
        </mesh>
      ))}
      <mesh position={[0, bottom + H + 0.2, -0.1]}>
        <boxGeometry args={[half * 2 + 0.4, 0.3, 0.3]} />
        <meshStandardMaterial color="#8a9096" metalness={0.7} roughness={0.4} />
      </mesh>
      <mesh position={[0, bottom + H / 2, 0]}>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={0.35} roughness={0.6} />
      </mesh>
      <mesh position={[0, bottom + H / 2, -0.04]} rotation-y={Math.PI}>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial color="#3d4a52" roughness={0.8} />
      </mesh>
    </group>
  );
}

/** An overhead billboard across the road with the three ministers' posters, on both faces. */
const POSTERS = ["/posters/shola.jpg", "/posters/sunmisola.jpg", "/posters/kaestrings.jpg"];
if (typeof window !== "undefined") useTexture.preload(POSTERS);

export function MinisterGantry({ st, s }: { st: Stream; s: number }) {
  const posters = useTexture(POSTERS);
  posters.forEach((t) => (t.colorSpace = THREE.SRGBColorSpace));
  const header = useMemo(headerCard, []);
  const p = streamAt(st, s);
  // facing back down the road, toward the people (and the drone) coming up it
  const rot = Math.atan2(-p.dx, -p.dz);
  const half = p.half + 0.5;
  const W = Math.min(13, 2 * (half + 2.2));
  const pw = (W - 0.6) / 3;
  const ph = (pw * 4) / 3;
  const bottom = 6.5;
  const cy = bottom + ph / 2;
  return (
    <group position={[p.x, 0, p.z]} rotation-y={rot}>
      {[-1, 1].map((k) => (
        <mesh key={k} position={[k * half, (bottom + ph + 1.1) / 2, 0]} castShadow>
          <cylinderGeometry args={[0.22, 0.28, bottom + ph + 1.1, 10]} />
          <meshStandardMaterial color="#2a2d33" metalness={0.7} roughness={0.4} />
        </mesh>
      ))}
      <mesh position={[0, bottom - 0.25, 0]}>
        <boxGeometry args={[half * 2 + 0.6, 0.4, 0.4]} />
        <meshStandardMaterial color="#2a2d33" metalness={0.7} roughness={0.4} />
      </mesh>
      <mesh position={[0, cy + 0.45, -0.12]} castShadow>
        <boxGeometry args={[W + 0.4, ph + 1.5, 0.2]} />
        <meshStandardMaterial color="#0c0d10" metalness={0.4} roughness={0.5} />
      </mesh>
      {[0, Math.PI].map((r) => (
        <group key={r} rotation-y={r} position-z={r ? -0.24 : 0}>
          {posters.map((t, i) => (
            <mesh key={i} position={[(i - 1) * (pw + 0.1), cy, 0.01]}>
              <planeGeometry args={[pw, ph]} />
              <meshBasicMaterial map={t} toneMapped={false} />
            </mesh>
          ))}
          <mesh position={[0, bottom + ph + 0.5, 0.01]}>
            <planeGeometry args={[W, 0.8]} />
            <meshBasicMaterial map={header} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * A campus set mounted ahead of its shot: out of sight on a layer the camera doesn't draw, its
 * shaders compiled and textures uploaded in the background. When its shot comes it just appears.
 */
function Parked({ live, children }: { live: boolean; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const warmed = useRef(false);
  const age = useRef(0);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    age.current += dt;
    // keep everything in it on the hidden layer (posters and signs arrive a little later)
    if (!live) g.traverse((o) => o.layers.set(31));
    if (live || warmed.current || age.current < 0.4) return;
    warmed.current = true;
    g.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      for (const mat of Array.isArray(m) ? m : m ? [m] : [])
        for (const t of [(mat as THREE.MeshStandardMaterial).map, (mat as THREE.MeshStandardMaterial).emissiveMap]) if (t) gl.initTexture(t);
    });
    gl.compileAsync(g, camera, scene).catch(() => {});
  });
  useEffect(() => {
    if (live) ref.current?.traverse((o) => o.layers.set(0));
  }, [live]);
  return <group ref={ref}>{children}</group>;
}

/** The jets' groups and labels (filled by <Jets>): placed by the film itself, see placeJets. */
const jetRefs = { groups: [] as (THREE.Group | null)[], tags: [] as (HTMLDivElement | null)[] };

/**
 * Put the jets where they are at jet time t. The film calls this in the same step that it places
 * the camera, from the same clock: placed in a frame loop of their own they'd be a frame behind the
 * camera, by however long that frame was, and shake on screen.
 */
function placeJets(t: number) {
  {
    const refs = { current: jetRefs.groups };
    const tags = { current: jetRefs.tags };
    JETS.forEach((j, i) => {
      const g = refs.current[i];
      if (!g) return;
      // high over the city, heading south toward the airport; the last one lands, and while it
      // does the other two (far off, still up high) are out of the picture, labels and all
      const gone = i !== 2 && t >= LAND_AT;
      g.visible = !gone;
      const tag = tags.current[i];
      if (tag) tag.style.display = gone ? "none" : "";
      jetAt(j, t, g.position);
      const landing = i === 2 && t >= LAND_AT;
      const flare = landing ? THREE.MathUtils.clamp((t - LAND_AT) / TOUCHDOWN, 0, 1) : 0;
      g.rotation.set(landing ? -0.03 - flare * 0.07 * (t - LAND_AT < TOUCHDOWN + 0.3 ? 1 : 0) : 0.03, landing ? Math.atan2(RUNWAY.dir.x, RUNWAY.dir.z) : Math.atan2(j.dx, 1), 0);
    });
  }
}

function Jets({ clock }: { clock: React.MutableRefObject<number> }) {
  const refs = { current: jetRefs.groups };
  const tags = { current: jetRefs.tags };
  // in place from the first frame (the film moves them from then on)
  useEffect(() => placeJets(clock.current), [clock]);
  return (
    <>
      {JETS.map((j, i) => (
        <group key={j.label} ref={(g) => void (refs.current[i] = g)}>
          <Airliner gearDown={i === 2} livery={j.livery} quad={j.quad} scale={j.scale} />
          {[-7, 7].map((x) => (
            <mesh key={x} position={[x, -0.6, 1]}>
              <sphereGeometry args={[0.9, 8, 6]} />
              <meshBasicMaterial color={[6, 6, 5]} toneMapped={false} />
            </mesh>
          ))}
          <Html
            position={[0, 10, 0]}
            center
            zIndexRange={[4, 0]}
            style={{ pointerEvents: "none" }}
          >
            <div
              ref={(d) => void (tags.current[i] = d)}
              style={{
                whiteSpace: "nowrap",
                fontSize: 12,
                color: "#fff",
                background: "rgba(10,20,80,.78)",
                padding: "4px 10px",
                borderRadius: 999,
                fontWeight: 700,
              }}
            >
              ✈ {j.label}
            </div>
          </Html>
        </group>
      ))}
    </>
  );
}

export function OpeningFilm({ world }: { world: LagosWorld }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const set = useGame((s) => s.set);
  const clock = useRef(0);
  /** The jets fly on their own clock; the film itself waits on the first shot until the crowd is ready. */
  const jetClock = useRef(0);
  /** Which of the drone's jet shots is on screen, how long the crowd has been ready, and a hard cut this frame. */
  const jetShot = useRef(-1);
  const readyFor = useRef(0);
  const cut = useRef(false);
  // the crowd can be drawn (its standing poses carry on baking in the background)
  const ready = useCrowdProgress() >= CORE_MODELS;
  const streets = useMemo(() => streetPaths(world), [world]);
  const yard = useMemo(() => yardPaths(), []);
  const agents = useRef<Agent[]>([]);
  const walkers = useRef<Walker[]>([]);
  const roam = useRef<Wanderer[]>([]);
  const queues = useMemo(() => new BoothQueues(), []);
  const shotId = useRef("");
  const look = useMemo(() => new THREE.Vector3(), []);
  const desired = useMemo(() => new THREE.Vector3(), []);
  const smooth = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    cityLights.uProc.value = 1;
    const fov = camera.fov;
    camera.fov = 50;
    camera.updateProjectionMatrix();
    if (process.env.NODE_ENV !== "production")
      (
        window as unknown as { __film?: React.MutableRefObject<number> }
      ).__film = clock;
    return () => {
      cityLights.uProc.value = 0;
      camera.near = 0.1;
      camera.fov = fov;
      camera.updateProjectionMatrix();
    };
  }, [camera]);
  // the shot title goes when the film itself closes (not when the camera above is swapped)
  useEffect(() => () => set({ procShot: null }), [set]);

  // "Skip to the Fusion Centre"
  const skip = useGame((s) => s.skipFilm);
  useEffect(() => {
    if (skip) clock.current = Math.max(clock.current, SHOTS[SHOTS.length - 1].at);
  }, [skip]);

  // each campus's route through its own set, and which set is on screen now
  const campus = useMemo(() => new Map(CAMPUS_SETS.map((d) => [d.id, campusStream(d)])), []);
  const move = useMemo(() => ({ pos: camera.position, look }), [camera, look]);
  const shotNow = useGame((s) => s.procShot?.id);
  const zoom = useBoardZoom();
  const onStream = CAMPUS_SETS.find((d) => "s-" + d.id === shotNow);
  const upNext = shotNow === "fusion" ? undefined : onStream ? CAMPUS_SETS[CAMPUS_SETS.indexOf(onStream) + 1] : CAMPUS_SETS[0];
  // built a moment into the shot, not on the cut itself (that frame already has enough to do)
  const [nextStream, setNextStream] = useState<(typeof CAMPUS_SETS)[number] | undefined>();
  useEffect(() => {
    const id = setTimeout(() => setNextStream(upNext), 600);
    return () => clearTimeout(id);
  }, [upNext]);

  // drag to orbit, right-drag / two fingers to pan, scroll / pinch to zoom, over the Fusion Centre
  const free = useRef({ target: new THREE.Vector3(), yaw: 0, pitch: 0.6, dist: 80 });
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const el = gl.domElement;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    const active = () => useGame.getState().procShot?.id === "fusion" && !useGame.getState().panel;
    const take = () => {
      if (useGame.getState().freeCam) return;
      // start from exactly where the aerial camera is
      const f = free.current;
      const d = new THREE.Vector3();
      camera.getWorldDirection(d);
      const t = camera.position.clone().addScaledVector(d, -camera.position.y / d.y);
      f.target.copy(t);
      const off = camera.position.clone().sub(t);
      f.dist = off.length();
      f.yaw = Math.atan2(off.x, off.z);
      f.pitch = Math.asin(off.y / f.dist);
      useGame.getState().set({ freeCam: true });
    };
    const down = (e: PointerEvent) => {
      if (!active()) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };
    const move = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId);
      if (!p || !active()) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (Math.abs(dx) + Math.abs(dy) < 1) return;
      take();
      const f = free.current;
      if (pointers.size === 2) {
        p.x = e.clientX;
        p.y = e.clientY;
        const [a, b] = [...pointers.values()];
        const dd = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) f.dist = THREE.MathUtils.clamp(f.dist * (pinch / dd), 8, 220);
        pinch = dd;
        pan(dx / 2, dy / 2);
        return;
      }
      p.x = e.clientX;
      p.y = e.clientY;
      if (e.buttons === 2 || e.shiftKey) pan(dx, dy);
      else {
        f.yaw -= dx * 0.005;
        f.pitch = THREE.MathUtils.clamp(f.pitch + dy * 0.004, 0.12, 1.45);
      }
    };
    const pan = (dx: number, dy: number) => {
      const f = free.current;
      const s = f.dist * 0.0016;
      const rx = Math.cos(f.yaw), rz = -Math.sin(f.yaw);
      const fx = -Math.sin(f.yaw), fz = -Math.cos(f.yaw);
      f.target.x += (-dx * rx + dy * fx) * s;
      f.target.z += (-dx * rz + dy * fz) * s;
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      pinch = 0;
    };
    const wheel = (e: WheelEvent) => {
      if (!active()) return;
      take();
      // a trackpad pinch arrives as small ctrl+wheel steps
      free.current.dist = THREE.MathUtils.clamp(free.current.dist * Math.exp(e.deltaY * (e.ctrlKey ? 0.008 : 0.0012)), 8, 220);
    };
    const menu = (e: Event) => active() && e.preventDefault();
    el.style.touchAction = "none";
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: true });
    el.addEventListener("contextmenu", menu);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("contextmenu", menu);
      useGame.getState().set({ freeCam: false });
    };
  }, [gl, camera]);

  /** Who is on screen for a shot. */
  const cast = (shot: Shot) => {
    const out: Walker[] = [];
    if (shot.stream) {
      const st = campus.get(shot.stream)!;
      // one half of the road for the walkers, the other for the traffic
      const walk = CAMPUS_SETS.find((d) => d.id === shot.stream)!.walk;
      const people = fill(st, 40, st.length - 30, {
        seed: shot.at * 1000,
        keep: 0.55,
        row: 1.35,
        band: walk > 0 ? [0.2, 1] : [-1, -0.2],
      });
      out.push(...people);
    } else if (shot.id === "fusion") {
      streets.forEach((st, k) => {
        const people = fill(st, 0, st.length, {
          seed: 50000 + k * 7919,
          keep: 0.26,
          band: fenceBand(st, k),
          row: 1.4,
        });
        out.push(...people);
      });
      yard.forEach((st, k) =>
        out.push(
          ...fill(st, 0, st.length, {
            seed: 90000 + k * 104729,
            keep: 0.6,
            row: 1.4,
          }),
        ),
      );
      roam.current = makeWanderers(40, 4242);
    }
    if (shot.id !== "fusion") roam.current = [];
    walkers.current = out;
    // the booths are busy whenever the Fusion Centre is on screen
    agents.current = [...out, ...roam.current, ...(shot.id === "fusion" ? [...boothCrowd(), ...queues.agents] : [])];
  };

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    // nothing moves until the loading screen has gone, so the jets are always seen
    if (!useGame.getState().warm || !useGame.getState().begun) return;
    jetClock.current += dt;
    if (ready) readyFor.current += dt;
    // one shot of each jet, then straight on to the first campus (as soon as the crowd is ready)
    // (on a slow phone the crowd may not be ready by then: it waits a moment for it, never longer)
    const crowdIn = (ready && readyFor.current > 0.3) || jetClock.current >= JET_TOTAL + 2.5;
    if (clock.current < JETS_LEN) clock.current = crowdIn && jetClock.current >= JET_TOTAL ? JETS_LEN : Math.min(clock.current + dt, JETS_LEN - 0.05);
    else clock.current += dt;
    const T = clock.current;
    cityLights.uTime.value = T;
    let k = 0;
    while (k + 1 < SHOTS.length && SHOTS[k + 1].at <= T) k++;
    const shot = SHOTS[k];
    const u = T - shot.at;
    if (shot.id !== shotId.current) {
      shotId.current = shot.id;
      // a new shot always opens on its own first frame (a slow frame mustn't drift in from the last)
      cut.current = true;
      cast(shot);
      set({ procShot: { id: shot.id, title: shot.title, sub: shot.sub } });
    }
    advance(walkers.current, dt);
    advanceWanderers(roam.current, dt);
    if (shot.id === "fusion") queues.step(dt);

    const pos = camera.position;
    if (shot.id === "jets") {
      const { index, local } = jetShotAt(jetClock.current);
      if (index !== jetShot.current) {
        jetShot.current = index;
        cut.current = true;
      }
      JET_SHOTS[index].cam(local, pos, look);
      placeJets(jetClock.current);
    } else if (shot.stream) {
      // each campus has its own drone move (see CampusSets)
      const def = CAMPUS_SETS.find((d) => d.id === shot.stream)!;
      def.drone(u, campus.get(shot.stream)!, move);
    } else {
      const c = toWorld(-3, 22);
      if (useGame.getState().freeCam) {
        // the visitor's own view: orbit / pan / zoom (see the pointer handlers below)
        const f = free.current;
        desired.set(f.target.x + Math.sin(f.yaw) * Math.cos(f.pitch) * f.dist, f.target.y + Math.sin(f.pitch) * f.dist, f.target.z + Math.cos(f.yaw) * Math.cos(f.pitch) * f.dist);
        look.copy(f.target);
      } else {
        // a slow, sweeping aerial that keeps every booth (and its button) in frame: it circles
        // between the front and the sides, rising and dipping
        // it starts where the road billboard is in view (its screen turned toward the drone) and
        // eases from there into the sweep
        const ease = Math.min(u / FROM_BILLBOARD, 1);
        const sweep = Math.sin(u * 0.07) * 0.75 + Math.sin(u * 0.031) * 0.25 + billboardSide(world) * (1 - ease * ease * (3 - 2 * ease));
        // wide enough to see Lagos traffic moving on the open roads past the closed streets
        const r = 84 + Math.sin(u * 0.05) * 8;
        const p0 = toWorld(-3 + Math.sin(sweep) * r, 22 + Math.cos(sweep) * r);
        desired.set(p0.x, 64 + Math.sin(u * 0.043) * 9, p0.z);
        look.set(c.x, 0, c.z);
      }
      // ease toward it: quick under the visitor's hand, gentle when handing back
      if (u < 0.05 || cut.current) pos.copy(desired);
      else pos.lerp(desired, 1 - Math.exp(-dt * (useGame.getState().freeCam ? 14 : 2.5)));
    }
    // high up, a near plane at 0.1 m leaves too little depth precision and the ground layers
    // flicker against each other: push it out with height
    const wantNear = THREE.MathUtils.clamp(pos.y * 0.02, 0.1, 8);
    if (Math.abs(camera.near - wantNear) > 0.05) {
      camera.near = wantNear;
      camera.updateProjectionMatrix();
    }
    // a booth's form open: fly in to its board
    zoom(camera, dt, pos, look);
    // the jet shots ride with a jet doing 92 m/s: an eased look would lag it by a frame-rate-
    // dependent amount and the jet would shake, so they look exactly where they mean to
    if (u < 0.05 || cut.current || shot.id === "jets") smooth.copy(look);
    else smooth.lerp(look, 0.15);
    cut.current = false;
    camera.lookAt(smooth);
  });

  return (
    <>
      {(shotNow ?? "jets") === "jets" && (
        <>
          <Jets clock={jetClock} />
        </>
      )}
      {/* over each campus's road: the green direction sign (who they are, where they're going),
          then the ministers' billboard further on */}
      {/* the set on screen, and the next one already built out of sight, so a cut never stalls */}
      {[onStream, nextStream !== onStream ? nextStream : undefined].map(
        (def) =>
          def && (
            <Parked key={def.id} live={def === onStream}>
              <CampusSet id={def.id} st={campus.get(def.id)!} />
              <SetTraffic st={campus.get(def.id)!} side={def.walk > 0 ? -1 : 1} seed={def.sign + def.origin[0]} />
              {/* Ikeja is Ogba's own neighbourhood: no sign needed there */}
              {GROUPS.find((g) => g.id === def.id)?.road && <DirectionSign st={campus.get(def.id)!} s={def.sign} />}
              {/* its posters load on their own: never hold up the film */}
              <Suspense fallback={null}>
                <MinisterGantry st={campus.get(def.id)!} s={def.sign + 70} />
              </Suspense>
            </Parked>
          ),
      )}

      <CrowdRenderer agents={agents} capacity={420} near={34} />
    </>
  );
}
