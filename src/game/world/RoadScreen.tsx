"use client";

import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { PLOT, toWorld } from "./compound";
import { ACCELERATE } from "../data/media";
import { nearestRoad, segDist, type LagosWorld } from "./lagosData";
import { YouTubeFrame } from "../ui/youtube";
import {
  billboardUnmuted,
  onSongChange,
  songHeld,
  songPaused,
  toggleSong,
  togglePlay,
} from "../billboardAudio";

// A big overhead LED billboard on a gantry across the main road, just left of the compound,
// playing "I Accelerate" (Pastor Shola Okodugha) from a minute in, looping. The picture is the
// real YouTube player laid onto the screen whenever you're close enough to see it; from further
// away the screen shows the title card. This copy is muted: the song itself plays in ui/SongPlayer,
// and the pause and sound buttons under the screen work both.

const PX_W = 1280;
const PX_H = 720;
const BAR_H = 150;

/** The song's state, for the buttons under the screen. */
function useSong() {
  const [st, setSt] = useState({
    on: billboardUnmuted(),
    paused: songPaused(),
    held: songHeld(),
  });
  useEffect(
    () =>
      onSongChange(() =>
        setSt({
          on: billboardUnmuted(),
          paused: songPaused(),
          held: songHeld(),
        }),
      ),
    [],
  );
  return st;
}

/** Now playing, with play / pause and sound on / off. */
function Controls() {
  const { on, paused } = useSong();
  const btn =
    "flex h-[104px] items-center gap-4 rounded-[6px] px-10 text-[40px] font-semibold uppercase tracking-[0.02em]";
  return (
    <div
      style={{ width: PX_W, height: BAR_H }}
      className="flex items-center justify-between gap-6 bg-black/90 px-8 font-[family-name:var(--font-display)] text-white"
    >
      <div className="min-w-0">
        <div className="eyebrow text-[24px]">
          {paused ? "Paused" : "Now playing"}
        </div>
        <div className="truncate text-[46px] font-bold leading-tight">
          I Accelerate · Pastor Shola Okodugha
        </div>
      </div>
      <div className="flex shrink-0 gap-4">
        <button
          className={`${btn} border-[3px] border-gold text-gold`}
          onClick={togglePlay}
          aria-label={paused ? "Play the song" : "Pause the song"}
        >
          {paused ? "▶ Play" : "❚❚ Pause"}
        </button>
        <button
          className={`${btn} ${on ? "border-[3px] border-white/40 text-white" : "bg-gold text-black"}`}
          onClick={toggleSong}
          aria-label={on ? "Mute the song" : "Turn the sound on"}
        >
          {on ? "🔊 Sound on" : "🔇 Sound off"}
        </button>
      </div>
    </div>
  );
}

function titleCard() {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 576;
  const g = c.getContext("2d")!;
  const grd = g.createLinearGradient(0, 0, 1024, 576);
  grd.addColorStop(0, "#0d1f8a");
  grd.addColorStop(1, "#7d0f22");
  g.fillStyle = grd;
  g.fillRect(0, 0, 1024, 576);
  g.textAlign = "center";
  g.fillStyle = "#ffffff";
  g.font = "700 34px sans-serif";
  g.fillText("NOW PLAYING · THE FEAST 2026", 512, 120);
  g.fillStyle = "#f6c35a";
  g.font = "900 128px sans-serif";
  g.fillText("I ACCELERATE", 512, 290);
  g.fillStyle = "#ffffff";
  g.font = "700 44px sans-serif";
  g.fillText("Pastor Shola Okodugha", 512, 380);
  g.font = "600 30px sans-serif";
  g.fillText("It is my time for speed", 512, 450);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Where the billboard stands (world coordinates): its centre, facing (dx, dz) and screen size. */
const frames = new WeakMap<LagosWorld, ReturnType<typeof placeBillboard>>();
export function billboardFrame(world: LagosWorld) {
  let f = frames.get(world);
  if (!f) frames.set(world, (f = placeBillboard(world)));
  return f;
}
function placeBillboard(world: LagosWorld) {
  // over the main road a little south of the pedestrian gate, facing the people walking up to it
  const probe = toWorld(PLOT.x0 - 12, 14);
  // the main road itself, never the service lane that runs into the compound beside it
  let r: LagosWorld["roads"][number] | null = null;
  let rd = 30;
  for (const cand of world.roads) {
    if (cand.type === "service") continue;
    for (let i = 1; i < cand.pts.length; i++) {
      const d = segDist(probe.x, probe.z, cand.pts[i - 1], cand.pts[i]);
      if (d < rd) {
        rd = d;
        r = cand;
      }
    }
  }
  let cx = probe.x,
    cz = probe.z,
    dx = 0,
    dz = 1,
    half = 8;
  if (r) {
    let best = Infinity;
    for (let i = 1; i < r.pts.length; i++) {
      const [ax, az] = r.pts[i - 1],
        [bx, bz] = r.pts[i];
      const sx = bx - ax,
        sz = bz - az;
      const l2 = sx * sx + sz * sz || 1;
      const u = Math.max(
        0,
        Math.min(1, ((probe.x - ax) * sx + (probe.z - az) * sz) / l2),
      );
      const px = ax + sx * u,
        pz = az + sz * u;
      const d = Math.hypot(px - probe.x, pz - probe.z);
      if (d < best) {
        best = d;
        cx = px;
        cz = pz;
        const l = Math.sqrt(l2);
        dx = sx / l;
        dz = sz / l;
      }
    }
    half = r.width / 2 + 1.4;
  }
  // face up the road toward the front of the compound and the café corner
  const front = toWorld(PLOT.x0, PLOT.z1);
  if ((front.x - cx) * dx + (front.z - cz) * dz < 0) {
    dx = -dx;
    dz = -dz;
  }
  // find the main road's surface across (its carriageways and median only: side streets and
  // junctions don't count) so the posts stand on its kerbs, never in a neighbour's compound
  const ex = dz,
    ez = -dx;
  const alongMain = (road: NonNullable<typeof r>, x: number, z: number) => {
    let best = Infinity,
      ok = false;
    for (let i = 1; i < road.pts.length; i++) {
      const [ax, az] = road.pts[i - 1],
        [bx, bz] = road.pts[i];
      const sx = bx - ax,
        sz = bz - az,
        l = Math.hypot(sx, sz) || 1;
      const u = Math.max(
        0,
        Math.min(1, ((x - ax) * sx + (z - az) * sz) / (l * l)),
      );
      const d = Math.hypot(ax + sx * u - x, az + sz * u - z);
      if (d < best) {
        best = d;
        ok = Math.abs((sx / l) * dx + (sz / l) * dz) > 0.85;
      }
    }
    return ok;
  };
  const reach = (sign: number) => {
    let last = 0;
    for (let t = 0.5; t < 16; t += 0.5) {
      const px = cx + ex * t * sign,
        pz = cz + ez * t * sign;
      const n = nearestRoad(world, px, pz);
      if (n.road && n.dist < n.road.width / 2 && alongMain(n.road, px, pz))
        last = t;
      else if (t - last > 3.5) break;
    }
    return Math.max(last, half - 1.4);
  };
  const right = reach(1) + 0.9;
  const left = reach(-1) + 0.9;
  const mid = (right - left) / 2;
  // the screen fills the gantry from post to post (16:9), its bottom edge 6.5 m over the road
  const sw = left + right - 0.7;
  const sh = (sw * 9) / 16;
  return {
    cx: cx + ex * mid,
    cz: cz + ez * mid,
    dx,
    dz,
    half: (left + right) / 2,
    rot: Math.atan2(dx, dz),
    sw,
    sh,
    cy: 6.5 + sh / 2,
  };
}

export function RoadScreen({ world }: { world: LagosWorld }) {
  const camera = useThree((s) => s.camera);
  const layers = useRef<(HTMLDivElement | null)[]>([]);
  const live = useRef<THREE.Group>(null);
  const frame = useMemo(() => billboardFrame(world), [world]);
  const card = useMemo(titleCard, []);
  const normal = useMemo(
    () => new THREE.Vector3(frame.dx, 0, frame.dz),
    [frame],
  );
  const centre = useMemo(
    () => new THREE.Vector3(frame.cx, frame.cy, frame.cz),
    [frame],
  );
  const toCam = useMemo(() => new THREE.Vector3(), []);
  const { held } = useSong();
  // the picture pauses with the song (paused from its buttons, or while you're in the hall)
  useEffect(() => {
    const f = layers.current[0]?.querySelector("iframe");
    f?.contentWindow?.postMessage(
      JSON.stringify({
        event: "command",
        func: held ? "pauseVideo" : "playVideo",
        args: [],
      }),
      "https://www.youtube-nocookie.com",
    );
  }, [held]);
  useFrame(() => {
    // the live picture plays from the moment the site opens (so it's already running when the
    // film reaches the Fusion Centre); one player, turned to whichever face is toward you
    toCam.copy(camera.position).sub(centre);
    const facing = toCam.normalize().dot(normal);
    if (live.current) {
      const back = facing < 0;
      live.current.rotation.y = back ? Math.PI : 0;
      live.current.position.z = back ? -0.36 : 0;
    }
  });
  const span = frame.half * 2;
  return (
    <group position={[frame.cx, 0, frame.cz]} rotation-y={frame.rot}>
      {/* gantry: two posts either side of the road and a truss across */}
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          position={[(s * span) / 2, (frame.cy + frame.sh / 2 + 0.4) / 2, 0]}
          castShadow
        >
          <cylinderGeometry
            args={[0.28, 0.34, frame.cy + frame.sh / 2 + 0.4, 12]}
          />
          <meshStandardMaterial
            color="#2a2d33"
            metalness={0.7}
            roughness={0.4}
          />
        </mesh>
      ))}
      <mesh position={[0, 6.2, 0]}>
        <boxGeometry args={[span + 0.8, 0.5, 0.5]} />
        <meshStandardMaterial color="#2a2d33" metalness={0.7} roughness={0.4} />
      </mesh>
      {/* the screen: frame, title card behind, live video on top */}
      <mesh position={[0, frame.cy, -0.18]} castShadow>
        <boxGeometry args={[frame.sw + 0.5, frame.sh + 0.5, 0.3]} />
        <meshStandardMaterial color="#0c0d10" metalness={0.4} roughness={0.5} />
      </mesh>
      {[0, Math.PI].map((r) => (
        <mesh
          key={r}
          position={[0, frame.cy, r ? -0.34 : -0.02]}
          rotation-y={r}
        >
          <planeGeometry args={[frame.sw, frame.sh]} />
          <meshBasicMaterial map={card} toneMapped={false} />
        </mesh>
      ))}
      {/* the video and its buttons, on the face turned toward you */}
      <group ref={live}>
        {[0].map((r, i) => (
          <Html
            key={r}
            transform
            position={[0, frame.cy, 0.01]}
            scale={(frame.sw / PX_W) * 40}
            zIndexRange={[3, 0]}
            pointerEvents="none"
          >
            <div
              ref={(d) => void (layers.current[i] = d)}
              style={{
                width: PX_W,
                height: PX_H,
                background: "#000",
                pointerEvents: "none",
              }}
            >
              <YouTubeFrame
                width={PX_W}
                height={PX_H}
                src={`https://www.youtube-nocookie.com/embed/${ACCELERATE}?autoplay=1&mute=1&start=60&loop=1&playlist=${ACCELERATE}&controls=0&modestbranding=1&playsinline=1&rel=0&cc_load_policy=0&iv_load_policy=3`}
                title="I Accelerate — Pastor Shola Okodugha"
                allow="autoplay; encrypted-media"
                style={{ border: 0, display: "block", pointerEvents: "none" }}
              />
            </div>
          </Html>
        ))}
        {/* the song's buttons, along the bottom edge of the screen's frame */}
        {
          <Html
            transform
            position={[
              0,
              frame.cy - frame.sh / 2 - (BAR_H / PX_W) * frame.sw * 0.5 - 0.3,
              0.32,
            ]}
            scale={(frame.sw / PX_W) * 40}
            zIndexRange={[4, 0]}
          >
            <Controls />
          </Html>
        }
      </group>
    </group>
  );
}
