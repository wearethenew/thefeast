"use client";

import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Character } from "../avatar/Character";
import { ATTENDEE_NAMES, NameTag } from "../avatar/NameTag";
import { type AnimName } from "../data/avatars";
import {
  CORE_MODELS,
  SIT_AVATARS,
  STANDING_AVATARS,
  useCrowdProgress,
} from "../crowd/CrowdBaker";
import {
  CrowdRenderer,
  clipRate,
  sitRate,
  walkRate,
  type Agent,
} from "../crowd/CrowdRenderer";
import {
  boothCrowd,
  BoothQueues,
  advance,
  fill,
  streetPaths,
  fenceBand,
  yardPaths,
  advanceWanderers,
  makeWanderers,
  type Walker,
} from "../crowd/flows";
import { MINISTERS } from "../data/ministers";
import { COUNTDOWN_VIDEO, FEAST_START } from "../data/media";
import { axes, bindKeyboard } from "../input";
import { SONG_VOLUME, setBillboardVolume, setSongQuiet } from "../billboardAudio";
import { useGame, type VenueSpot } from "../store";
import {
  CANOPY,
  COMPOUND,
  COURT,
  AUD_GROUP,
  AUD_HEADING,
  GATE,
  GATE_OPENING,
  HALL,
  KIOSK,
  LED,
  PED_GATE,
  PLOT,
  SEATS,
  SEAT_LIST,
  PLAYER_SEAT_AUD,
  AUD_DOOR,
  LOBBY,
  MAIN_DOOR,
  TENTS,
  FOOT_Y,
  boothFront,
  colliders,
  audToLocal,
  localToAud,
  toWorld,
} from "./compound";
import { type LagosWorld } from "./lagosData";
import { aimWedge, insideHallWorld, outsideWedge, throughDoor, toLocal } from "./hallView";
import { useBoardZoom } from "./BoothBoards";
import { YouTubeFrame } from "../ui/youtube";

// Walking the Fusion Centre compound with your torch: interaction spots, other attendees,
// and the hall where the LED wall plays the ministers' videos.

export type Spot = {
  id: VenueSpot | `tent:${string}`;
  x: number;
  z: number;
  r: number;
  label: string;
};

export const SPOTS: Spot[] = [
  {
    id: "kiosk",
    x: KIOSK.x + 2.6,
    z: KIOSK.z - 1.6,
    r: 2.6,
    label: "Welcome Desk at the café — get your Feast pass",
  },
  {
    id: "court",
    x: (COURT.x0 + COURT.x1) / 2,
    z: (COURT.z0 + COURT.z1) / 2,
    r: 4,
    label: "Torch Relay court",
  },
  {
    id: "walkway",
    x: (CANOPY.x0 + CANOPY.x1) / 2,
    z: (CANOPY.z0 + CANOPY.z1) / 2,
    r: 3,
    label: "Hall of Torches — share a testimony",
  },
  {
    id: "hall",
    x: MAIN_DOOR.x,
    z: MAIN_DOOR.z + 2,
    r: 2.4,
    label: "Main entrance — walk in",
  },
  ...TENTS.map((t) => {
    const [x, z] = boothFront(t, 1.6);
    return { id: `tent:${t.id}` as const, x, z, r: 2, label: t.label };
  }),
];

const PHOTO =
  typeof window !== "undefined"
    ? new URLSearchParams(window.location.search)
        .get("photo")
        ?.split(",")
        .map(Number)
    : undefined;

const inHall = (x: number, z: number) =>
  x > HALL.x0 && x < HALL.x1 && z > HALL.z0 && z < HALL.z1;

/** Facing the screen, as a heading in the compound. */
const TO_SCREEN = Math.PI + AUD_HEADING;

/** An empty seat on the hall's floor: auditorium (ax, az) and compound (x, z) coordinates. */
type FreeSeat = {
  ax: number;
  az: number;
  x: number;
  z: number;
  col: number;
  row: number;
  taken: boolean;
};
/**
 * The hall's empty seats, shared by the people walking in (who fill them) and you: walk up to any
 * of them and sit. `near` is the one you're next to, `mine` the one you're sitting in.
 */
const seats = {
  free: [] as FreeSeat[],
  near: null as FreeSeat | null,
  mine: null as FreeSeat | null,
};
/** How close you need to be to a seat to sit in it. */
const SEAT_REACH = 1.0;
/** The legroom in front of each row of floor seats (auditorium z), where you can walk along it. */
const ROW_GAPS = [
  ...new Set(
    SEAT_LIST.filter((p) => p.y === 0).map((p) => +(p.z - 0.47).toFixed(3)),
  ),
].sort((a, b) => a - b);
/** Is auditorium (ax, az) among the chairs of a seating block (not an aisle or the open floor)? */
function inRows(ax: number, az: number) {
  if (az < SEATS.z0 - 0.6 || az > SEATS.z1 + 0.45) return false;
  if (Math.abs(az - SEATS.cross) < SEATS.crossHalf - 0.25) return false;
  return SEATS.blocks.some(([x0, x1]) => ax > x0 - 0.3 && ax < x1 + 0.3);
}
/**
 * Among the seats you walk along a row, in its legroom (never through the chairs): stepping into a
 * block from an aisle puts you on the nearest row's legroom, and inside it you move only along the
 * row. The aisles, the cross aisle and the open floor are free. Compound coordinates in and out.
 */
function rowWalk(x: number, z: number): [number, number] {
  const [ax, az] = localToAud(x, z);
  if (!inRows(ax, az)) return [x, z];
  // onto (or along) the nearest row's legroom: a small step toward the screen or the back keeps
  // you on the same row, so in a row you move only along it
  const gap = ROW_GAPS.reduce((a, b) =>
    Math.abs(b - az) < Math.abs(a - az) ? b : a,
  );
  return audToLocal(ax, gap);
}

const WALL_W = 1920;
const WALL_H = Math.round((WALL_W * LED.h) / LED.w);
const PLAYLIST = MINISTERS.flatMap((m) =>
  m.videos.map((v) => ({ minister: m, video: v })),
);

/** Days, hours, minutes and seconds to the Feast, ticking. */
function Countdown() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, FEAST_START - now) / 1000;
  const parts = [
    [Math.floor(left / 86400), "days"],
    [Math.floor(left / 3600) % 24, "hrs"],
    [Math.floor(left / 60) % 60, "min"],
    [Math.floor(left) % 60, "sec"],
  ] as const;
  if (!left)
    return (
      <div style={{ fontSize: 40, fontWeight: 900, color: "#ffc634" }}>
        WE&apos;RE LIVE
      </div>
    );
  return (
    <div style={{ display: "flex", gap: 10 }}>
      {parts.map(([n, l]) => (
        <div
          key={l}
          style={{
            minWidth: 78,
            padding: "6px 8px",
            textAlign: "center",
            border: "2px solid rgba(255,198,52,0.7)",
            borderRadius: 4,
            background: "rgba(0,0,0,0.35)",
          }}
        >
          <div
            style={{
              fontSize: 40,
              fontWeight: 800,
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {String(n).padStart(2, "0")}
          </div>
          <div
            style={{
              fontSize: 13,
              letterSpacing: "0.2em",
              opacity: 0.8,
              marginTop: 3,
              textTransform: "uppercase",
            }}
          >
            {l}
          </div>
        </div>
      ))}
    </div>
  );
}

/** The LED wall: the video in the middle, Feast art either side, and the playlist along the bottom. */
function LedWall() {
  const now = useGame((s) => s.nowPlaying);
  const set = useGame((s) => s.set);
  const playing = PLAYLIST.find((p) => p.video.id === now?.video);
  const stripH = 112;
  const videoH = WALL_H - stripH;
  const videoW = Math.round((videoH * 16) / 9);
  return (
    <group position={[LED.x, LED.y, LED.z]}>
      <Html
        transform
        scale={(LED.w / WALL_W) * 40}
        zIndexRange={[5, 0]}
        pointerEvents="auto"
      >
        <div
          style={{
            width: WALL_W,
            height: WALL_H,
            background: "#04081f",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            fontFamily: "var(--font-display), sans-serif",
            color: "#fff",
          }}
        >
          <div style={{ display: "flex", height: videoH }}>
            <div
              style={{
                flex: 1,
                padding: "34px 40px",
                background: "linear-gradient(135deg,#0d1f8a,#06134d 70%)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
              }}
            >
              <div
                style={{ letterSpacing: "0.45em", fontSize: 20, opacity: 0.75 }}
              >
                NOW PLAYING
              </div>
              <div
                style={{
                  fontSize: 46,
                  fontWeight: 900,
                  lineHeight: 1.05,
                  marginTop: 10,
                }}
              >
                {playing
                  ? `${playing.minister.title} ${playing.minister.name}`
                  : "The Feast 2026"}
              </div>
              <div style={{ fontSize: 24, opacity: 0.85, marginTop: 10 }}>
                {playing?.video.title ?? "Pick a message below"}
              </div>
            </div>
            <div style={{ width: videoW, height: videoH, background: "#000" }}>
              {now && (
                <YouTubeFrame
                  key={now.video}
                  width={videoW}
                  height={videoH}
                  src={`https://www.youtube-nocookie.com/embed/${now.video}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
                  title="The Feast 2026"
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                  style={{ border: 0, display: "block" }}
                />
              )}
            </div>
            <div
              style={{
                flex: 1,
                padding: "34px 40px",
                background: "linear-gradient(225deg,#7d0f22,#2a0710 75%)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "flex-end",
                textAlign: "right",
              }}
            >
              <div
                style={{ letterSpacing: "0.45em", fontSize: 20, opacity: 0.75 }}
              >
                THE FEAST 2026
              </div>
              <div
                style={{
                  fontSize: 72,
                  fontWeight: 900,
                  lineHeight: 0.95,
                  background:
                    "linear-gradient(180deg,#fff3c4,#f6c35a 40%,#c98a22 65%,#f8d785)",
                  WebkitBackgroundClip: "text",
                  color: "transparent",
                }}
              >
                THE TORCH
              </div>
              <div style={{ fontSize: 22, opacity: 0.85, marginTop: 6 }}>
                11–13 December · The Fusion Centre
              </div>
              {/* The New Countdown under the dates: the video once its id is set, the live count till then */}
              <div style={{ marginTop: 14 }}>
                {COUNTDOWN_VIDEO ? (
                  <YouTubeFrame
                    width={320}
                    height={180}
                    src={`https://www.youtube-nocookie.com/embed/${COUNTDOWN_VIDEO}?autoplay=1&mute=1&loop=1&playlist=${COUNTDOWN_VIDEO}&controls=0&modestbranding=1&playsinline=1&rel=0`}
                    title="The New Countdown"
                    allow="autoplay; encrypted-media"
                    style={{ border: 0, display: "block" }}
                  />
                ) : (
                  <Countdown />
                )}
              </div>
            </div>
          </div>
          {/* playlist: every minister's videos, full width along the bottom */}
          <div
            style={{
              height: stripH,
              display: "flex",
              gap: 10,
              padding: "12px 16px",
              background: "rgba(0,0,0,0.85)",
              borderTop: "3px solid #f4c21a",
            }}
          >
            {PLAYLIST.map((p) => {
              const on = p.video.id === now?.video;
              return (
                <button
                  key={p.video.id}
                  onClick={() =>
                    set({
                      nowPlaying: {
                        minister: p.minister.id,
                        video: p.video.id,
                      },
                    })
                  }
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    padding: 8,
                    borderRadius: 10,
                    cursor: "pointer",
                    textAlign: "left",
                    color: "#fff",
                    background: on
                      ? "rgba(244,194,26,0.25)"
                      : "rgba(255,255,255,0.06)",
                    border: on ? "3px solid #f4c21a" : "3px solid transparent",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- inside a 3D Html layer */}
                  <img
                    src={`https://i.ytimg.com/vi/${p.video.id}/mqdefault.jpg`}
                    alt=""
                    style={{
                      width: 128,
                      height: 72,
                      objectFit: "cover",
                      borderRadius: 6,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ minWidth: 0 }}>
                    <span
                      style={{
                        display: "block",
                        fontSize: 13,
                        fontWeight: 800,
                        color: "#f6d06a",
                        textTransform: "uppercase",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {p.minister.name}
                    </span>
                    <span
                      style={{
                        display: "block",
                        fontSize: 15,
                        lineHeight: 1.2,
                        maxHeight: 54,
                        overflow: "hidden",
                      }}
                    >
                      {on ? "▶ " : ""}
                      {p.video.title}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </Html>
    </group>
  );
}

const rnd = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Everyone else, all of them real people and all moving: walking up both streets and in through
 * the gates, down the yard to the side entrances, and seated in the hall and gallery. The few
 * nearest you show their names.
 */
/**
 * The same doorway rule for the hall's furniture, rig and fittings: from out in front, whatever
 * inside lies wholly outside the view through the doors is skipped (and so is its shadow, which
 * falls inside the hall too). Only things well inside the walls and under the eaves count, so
 * the building's own walls, glass front and roof are always drawn. Inside the hall, or anywhere
 * not in front, everything is drawn as usual.
 */
function HallCuller() {
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const inner = useRef<THREE.Mesh[]>([]);
  const hidden = useRef(new Set<THREE.Object3D>());
  const lastScan = useRef(-1e9);
  const box = useMemo(() => new THREE.Box3(), []);
  const sphere = useMemo(() => new THREE.Sphere(), []);
  useFrame((state) => {
    // (re-scanned now and then: parts of the hall arrive as their textures load)
    if (state.clock.elapsedTime - lastScan.current > 3) {
      lastScan.current = state.clock.elapsedTime;
      const found: THREE.Mesh[] = [];
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || (m as THREE.SkinnedMesh).isSkinnedMesh) return;
        if (m.geometry instanceof THREE.InstancedBufferGeometry) return;
        box.setFromObject(m, false);
        if (box.isEmpty() || box.max.y > HALL.h - 0.5) return;
        for (const [x, z] of [[box.min.x, box.min.z], [box.max.x, box.min.z], [box.max.x, box.max.z], [box.min.x, box.max.z]]) {
          const [lx, lz] = toLocal(x, z);
          if (lx < HALL.x0 + 1 || lx > HALL.x1 - 1 || lz < HALL.z0 + 1 || lz > HALL.z1 - 1.05) return;
        }
        found.push(m);
      });
      inner.current = found;
    }
    const cull = useGame.getState().zone !== "hall" && aimWedge(camera.position) === "wedge";
    const was = hidden.current;
    for (const m of inner.current) {
      let out = false;
      if (cull) {
        // (a mesh can be handed a new geometry after the scan)
        if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
        const bs = m.geometry.boundingSphere;
        if (bs) out = outsideWedge(sphere.copy(bs).applyMatrix4(m.matrixWorld));
      }
      if (out && m.visible) {
        m.visible = false;
        was.add(m);
      } else if (!out && was.has(m)) {
        m.visible = true;
        was.delete(m);
      }
    }
  });
  useEffect(
    () => () => {
      for (const m of hidden.current) m.visible = true;
      hidden.current.clear();
    },
    [],
  );
  return null;
}

function VenueCrowd({
  world,
  where,
}: {
  world: LagosWorld;
  where: () => THREE.Vector3;
}) {
  const agents = useRef<Agent[]>([]);
  const { walkers, seated, roamers, queues, free, doorPath } = useMemo(() => {
    const walkers: Walker[] = [];
    const yard = yardPaths();
    streetPaths(world).forEach((st, k) =>
      walkers.push(
        ...fill(st, 0, st.length, {
          seed: 1000 + k * 7919,
          // the street is four lanes and the walkers fill one: the same density as before
          keep: 0.17,
          band: fenceBand(st, k),
          row: 1.45,
        }),
      ),
    );
    yard.forEach((st, k) =>
      walkers.push(
        ...fill(st, 0, st.length, {
          seed: 5000 + k * 104729,
          keep: 0.5,
          row: 1.6,
        }),
      ),
    );
    const seated: Agent[] = [];
    const free: FreeSeat[] = [];
    const freeSeat = (ax: number, az: number, col: number, row: number) => {
      const [x, z] = audToLocal(ax, az);
      free.push({ ax, az, x, z, col, row, taken: false });
    };
    let k = 0;
    /** Someone seated at (x, z) in the auditorium, facing the screen. */
    const sit = (ax: number, az: number, y = 0) => {
      const [lx, lz] = audToLocal(ax, az);
      const w = toWorld(lx, lz);
      seated.push({
        x: w.x,
        z: w.z,
        y,
        h: TO_SCREEN + COMPOUND.rotation,
        avatar: SIT_AVATARS[Math.floor(rnd(k + 0.7) * SIT_AVATARS.length)],
        robe: rnd(k + 0.9) < 0.5 ? 0 : 1,
        anim: "sit",
        phase: rnd(k + 0.1),
        rate: 0.12,
      });
    };
    for (const p of SEAT_LIST) {
      k++;
      // a seat kept for you a few rows from the front, on the aisle
      if (
        p.x === PLAYER_SEAT_AUD.x &&
        Math.abs(p.z - PLAYER_SEAT_AUD.z) < 0.01
      ) {
        freeSeat(p.x, p.z, p.col, p.row);
        continue;
      }
      if (p.y > 0) {
        // (the crowd is drawn FOOT_Y up: the gallery's deck is a real height, not ground)
        if (rnd(k) < 0.62) sit(p.x, p.z, p.y - FOOT_Y);
        continue;
      }
      // about a third of the floor starts empty: people walking in fill them during your visit
      if (rnd(k) > 0.64) {
        freeSeat(p.x, p.z, p.col, p.row);
        continue;
      }
      sit(p.x, p.z);
    }
    const roamers = makeWanderers(30);
    // the desks: an attendant behind every counter greeting people, visitors in front of it
    const desks: Agent[] = [];
    const person = (
      lx: number,
      lz: number,
      localHeading: number,
      anim: "idle" | "wave",
    ) => {
      const w = toWorld(lx, lz);
      const avatar =
        STANDING_AVATARS[Math.floor(rnd(k + 0.7) * STANDING_AVATARS.length)];
      desks.push({
        x: w.x,
        z: w.z,
        h: localHeading + COMPOUND.rotation,
        avatar,
        robe: rnd(k + 0.9) < 0.5 ? 0 : 1,
        anim,
        phase: rnd(k + 0.1),
        rate: 0.25,
      });
      k++;
    };
    desks.push(...boothCrowd());
    person(KIOSK.x + 1.9, KIOSK.z - 1.6, Math.PI / 2, "wave");
    for (const dz of [-0.6, 0.6])
      person(KIOSK.x + 3.6, KIOSK.z - 1.6 + dz, -Math.PI / 2, "idle");
    // nearest the centre aisle first, so people don't climb over a whole row
    free.sort((a, b) => a.col - b.col || a.row - b.row);
    seats.free = free;
    seats.near = seats.mine = null;
    return {
      walkers,
      seated: [...seated, ...desks],
      roamers,
      queues: new BoothQueues(),
      free,
      doorPath: yard[0],
    };
  }, [world]);
  /** People who came in through the main doors, walking to a free seat (then sitting in it). */
  const arrivers = useRef<
    (Agent & {
      path: [number, number][];
      seg: number;
      lx: number;
      lz: number;
      done: boolean;
    })[]
  >([]);
  const all = useRef<Agent[]>([]);
  useEffect(() => {
    arrivers.current = [];
    all.current = [...walkers, ...roamers, ...queues.agents, ...seated];
    agents.current = all.current;
  }, [walkers, seated, roamers, queues]);
  const arrive = (p: Agent) => {
    // the next empty seat that isn't yours or the one you're about to sit in
    const seat = free.find(
      (f) => !f.taken && f !== seats.near && f !== seats.mine,
    );
    if (!seat) return;
    seat.taken = true;
    // in at the doors, along the cross aisle to the nearest aisle, down it, along the row
    const near = SEATS.aisles.reduce((a, b) =>
      Math.abs(b - seat.ax) < Math.abs(a - seat.ax) ? b : a,
    );
    const aisle = near + (rnd(seat.row * 31 + seat.col) - 0.5) * 0.6;
    const cross = SEATS.cross + (rnd(seat.col + 0.5) - 0.5) * 0.8;
    const a = {
      ...p,
      anim: "walk" as const,
      path: (
        [
          [AUD_DOOR.x + LOBBY + 0.8, AUD_DOOR.z + (rnd(seat.col) - 0.5) * 1.2],
          [aisle, cross],
          [aisle, seat.az - 0.47],
          [seat.ax, seat.az - 0.47],
          [seat.ax, seat.az],
        ] as [number, number][]
      ).map(([x, z]) => audToLocal(x, z)),
      seg: 0,
      lx: MAIN_DOOR.x,
      lz: MAIN_DOOR.z - 0.3,
      done: false,
    };
    arrivers.current.push(a);
    all.current.push(a);
  };
  // everyone on their feet, for the name tags
  const movers = useMemo<Agent[]>(
    () => [...walkers, ...roamers],
    [walkers, roamers],
  );
  const tags = useRef<(THREE.Group | null)[]>([]);
  const [named, setNamed] = useState<number[]>([]);
  const lastPick = useRef(0);
  useFrame((state, dt) => {
    const me = where();
    const step = Math.min(dt, 0.05);
    advance(
      walkers,
      step,
      { x: me.x, z: me.z, r: 0.55 },
      (p) => p.st === doorPath && arrive(p),
    );
    advanceWanderers(roamers, step, { x: me.x, z: me.z, r: 0.55 }, arrive);
    queues.step(step);
    // walk the new arrivals in, down the aisle and along the row, and sit them down
    for (const a of arrivers.current) {
      if (a.done) continue;
      const [tx, tz] = a.path[a.seg];
      const dx = tx - a.lx,
        dz = tz - a.lz;
      const d = Math.hypot(dx, dz);
      const go = 1.15 * step;
      if (d <= go) {
        a.lx = tx;
        a.lz = tz;
        if (++a.seg >= a.path.length) {
          a.done = true;
          a.anim = "sit";
          // only some people have a seated pose baked: sit the nearest look-alike
          if (!SIT_AVATARS.includes(a.avatar))
            a.avatar = SIT_AVATARS[a.avatar % SIT_AVATARS.length];
          a.h = TO_SCREEN + COMPOUND.rotation;
          a.rate = sitRate(a.avatar);
        }
      } else {
        a.lx += (dx / d) * go;
        a.lz += (dz / d) * go;
        a.h = Math.atan2(dx, dz) + COMPOUND.rotation;
        a.rate = walkRate(a.avatar, 1.15);
      }
      const w = toWorld(a.lx, a.lz);
      a.x = w.x;
      a.z = w.z;
    }
    for (const a of seated)
      a.rate =
        a.anim === "sit" ? sitRate(a.avatar) : clipRate(a.avatar, a.anim);
    // inside the hall only the hall's people are drawn; outside, everyone (the hall is full,
    // seen through its doors, and nobody has to appear as you walk in)
    const inHallNow = useGame.getState().zone === "hall";
    const view = inHallNow ? "all" : aimWedge(state.camera.position);
    for (const a of all.current) {
      const inside = insideHallWorld(a.x, a.z);
      a.hidden = inHallNow ? !inside : inside && view === "wedge" && !throughDoor(a.x, a.y ?? 0, a.z);
    }
    // name the people walking nearest to you
    if (state.clock.elapsedTime - lastPick.current > 0.4) {
      lastPick.current = state.clock.elapsedTime;
      const near = movers
        .map((w, i) => [i, (w.x - me.x) ** 2 + (w.z - me.z) ** 2] as const)
        // not right under the camera (a name there fills the screen), not too far either
        .filter(
          ([i, d]) =>
            d > 2.5 * 2.5 &&
            d < 16 * 16 &&
            (movers[i].x - state.camera.position.x) ** 2 +
              (movers[i].z - state.camera.position.z) ** 2 >
              7 * 7,
        )
        .sort((a, b) => a[1] - b[1])
        .slice(0, 5)
        .map(([i]) => i);
      if (near.join() !== named.join()) setNamed(near);
    }
    named.forEach((i, j) => {
      const g = tags.current[j];
      const w = movers[i];
      if (g && w) g.position.set(w.x, 0, w.z);
    });
  });
  const ready = useCrowdProgress() >= CORE_MODELS;
  return (
    <>
      <CrowdRenderer agents={agents} capacity={420} near={22} />
      {/* names only over people who are actually drawn */}
      {ready &&
        named.map((i, j) => (
          <group key={i} ref={(g) => void (tags.current[j] = g)}>
            <NameTag
              name={ATTENDEE_NAMES[(i * 7) % ATTENDEE_NAMES.length]}
              y={2.0}
            />
          </group>
        ))}
    </>
  );
}

export function Venue({ world }: { world: LagosWorld }) {
  const player = useGame((s) => s.player);
  const registered = useGame((s) => !!s.registered);
  const seated = useGame((s) => s.seated);
  const set = useGame((s) => s.set);
  const me = useRef<THREE.Group>(null);
  // spawn outside the main gate (?spawn=hall starts inside the hall, for testing)
  const state = useRef(
    typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("spawn") === "hall"
      ? (() => {
          const [x, z] = audToLocal(AUD_DOOR.x + LOBBY + 2, AUD_DOOR.z);
          return { x, z, heading: TO_SCREEN, moving: false };
        })()
      : useGame.getState().spawnAt === "door"
        ? // "Join the Feast": right in front of the Main Hall doors, facing in
          {
            x: MAIN_DOOR.x,
            z: MAIN_DOOR.z + 4.5,
            heading: Math.PI,
            moving: false,
          }
        : // "Enter through the gate": on Acme Road outside the main (sliding) gate, facing in
          {
            x: (GATE_OPENING.x0 + GATE_OPENING.x1) / 2,
            z: PLOT.z1 + 5,
            heading: Math.PI,
            moving: false,
          },
  );
  const [anim, setAnimState] = useAnimState();
  const camera = useThree((s) => s.camera);
  const camPos = useRef(new THREE.Vector3());
  const camLook = useRef(new THREE.Vector3());
  const boxes = useMemo(() => {
    const t = 0.25;
    const pg = PED_GATE;
    return [
      ...colliders(),
      // perimeter walls with their gates
      [PLOT.x0 - t, PLOT.z0, PLOT.x0 + t, pg.z0],
      [PLOT.x0 - t, pg.z1, PLOT.x0 + t, PLOT.z1 + t],
      [PLOT.x0 - t, PLOT.z1 - 0.5, GATE_OPENING.x0, PLOT.z1 + t],
      [GATE.x1, PLOT.z1 - t, PLOT.x1, PLOT.z1 + t],
      // outside the corner beyond both streets
      [PLOT.x0 - 30, PLOT.z1 + 6, PLOT.x0 - 9, PLOT.z1 + 30],
    ] as [number, number, number, number][];
  }, []);
  const compound = useMemo(() => {
    const g = new THREE.Object3D();
    g.position.set(COMPOUND.center[0], 0, COMPOUND.center[1]);
    g.rotation.y = COMPOUND.rotation;
    g.updateMatrixWorld();
    return g;
  }, []);
  const lastSpot = useRef<VenueSpot | string | null>(null);
  const insideRef = useRef(false);
  const wasSeated = useRef(false);
  const marker = useRef<THREE.Mesh>(null);
  const arrival = useRef(0);
  const zoom = useBoardZoom();
  const orbit = useRef({
    yaw: 0,
    pitch: 0,
    zoom: 1,
    dragging: false,
    x: 0,
    y: 0,
    last: 0,
  });
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const el = gl.domElement;
    el.style.touchAction = "none";
    const o = orbit.current;
    // fingers down on the scene: one drags the view round you, two pinch to zoom
    const fingers = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    const spread = () => {
      const [a, b] = [...fingers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const down = (e: PointerEvent) => {
      fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (fingers.size === 2) {
        pinch = spread();
        o.dragging = false;
        return;
      }
      o.dragging = true;
      o.x = e.clientX;
      o.y = e.clientY;
      el.setPointerCapture?.(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (fingers.has(e.pointerId))
        fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (fingers.size === 2 && pinch) {
        const d = spread();
        o.zoom = THREE.MathUtils.clamp(
          o.zoom * (pinch / Math.max(d, 1)),
          0.5,
          2.6,
        );
        pinch = d;
        o.last = performance.now();
        return;
      }
      if (!o.dragging) return;
      o.yaw -= (e.clientX - o.x) * 0.006;
      o.pitch = THREE.MathUtils.clamp(
        o.pitch + (e.clientY - o.y) * 0.004,
        -0.3,
        1.1,
      );
      o.x = e.clientX;
      o.y = e.clientY;
      o.last = performance.now();
    };
    const up = (e: PointerEvent) => {
      fingers.delete(e.pointerId);
      if (fingers.size < 2) pinch = 0;
      o.dragging = false;
      o.last = performance.now();
    };
    const wheel = (e: WheelEvent) => {
      // a trackpad pinch arrives as small ctrl+wheel steps
      o.zoom = THREE.MathUtils.clamp(
        o.zoom * Math.exp(e.deltaY * (e.ctrlKey ? 0.008 : 0.001)),
        0.5,
        2.6,
      );
      o.last = performance.now();
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: true });
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
      setBillboardVolume(SONG_VOLUME);
      setSongQuiet(false);
      useGame.getState().set({ zone: "street" });
    };
  }, [gl]);
  const [showWall, setShowWall] = useShowWall();

  useEffect(() => {
    bindKeyboard();
    // start from wherever the opening film left the camera and swoop down behind you (from high
    // up, cut in closer first so the swoop is short)
    camPos.current.copy(camera.position);
    const me0 = compound.localToWorld(
      new THREE.Vector3(state.current.x, 0, state.current.z),
    );
    if (camPos.current.distanceTo(me0) > 70)
      camPos.current.copy(me0).add(new THREE.Vector3(18, 26, 18));
    const d = new THREE.Vector3();
    camera.getWorldDirection(d);
    camLook.current.copy(camera.position).addScaledVector(d, 30);
  }, [compound, camera]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const s = state.current;
    if (seated) {
      // sitting down: in the seat you're next to (or the one kept for you, a few rows from the front)
      if (!seats.mine) {
        seats.mine =
          seats.near ??
          seats.free.find(
            (f) =>
              f.ax === PLAYER_SEAT_AUD.x &&
              Math.abs(f.az - PLAYER_SEAT_AUD.z) < 0.01 &&
              !f.taken,
          ) ??
          seats.free.find((f) => !f.taken) ??
          null;
        if (seats.mine) seats.mine.taken = true;
        seats.near = null;
      }
      if (seats.mine) {
        s.x = seats.mine.x;
        s.z = seats.mine.z;
      }
      s.heading = TO_SCREEN;
      wasSeated.current = true;
    } else {
      if (wasSeated.current) {
        // standing up: step out of the row in front of your seat, and the seat is free again
        wasSeated.current = false;
        const m = seats.mine;
        if (m) {
          const [x, z] = audToLocal(m.ax, m.az - 0.5);
          s.x = x;
          s.z = z;
          m.taken = false;
        }
        seats.mine = null;
        s.heading = TO_SCREEN;
      }
      // no walking while a booth's form is open (typing would steer you)
      const a = useGame.getState().panel ? { x: 0, y: 0 } : axes();
      s.heading -= a.x * 2.4 * dt;
      const v = a.y * (a.y > 0 ? 3.0 : 1.6);
      let nx = s.x + Math.sin(s.heading) * v * dt;
      let nz = s.z + Math.cos(s.heading) * v * dt;
      // among the seats: along the rows
      if (inHall(nx, nz)) [nx, nz] = rowWalk(nx, nz);
      // the street outside and the compound; the walls let you through only at the two gates
      nx = THREE.MathUtils.clamp(nx, PLOT.x0 - 16, PLOT.x1 - 0.5);
      nz = THREE.MathUtils.clamp(nz, PLOT.z0 + 0.5, PLOT.z1 + 14);
      // the Main Hall's doors stay shut to you until you've registered and carry a torch
      const shut = !useGame.getState().registered;
      const blocked = (x: number, z: number) =>
        boxes.some(
          ([x0, z0, x1, z1]) =>
            x > x0 - 0.3 && x < x1 + 0.3 && z > z0 - 0.3 && z < z1 + 0.3,
        ) ||
        (shut &&
          Math.abs(x - MAIN_DOOR.x) < MAIN_DOOR.w / 2 + 0.3 &&
          Math.abs(z - MAIN_DOOR.z) < 0.6);
      // never trap someone who ends up inside a blocker: any step out of it is allowed
      const px = s.x,
        pz = s.z;
      if (blocked(s.x, s.z) || !blocked(nx, nz)) {
        s.x = nx;
        s.z = nz;
      } else if (!blocked(nx, s.z)) s.x = nx;
      else if (!blocked(s.x, nz)) s.z = nz;
      // the walk only plays when you actually get somewhere (not pushing against a chair)
      s.moving =
        Math.abs(v) > 0.05 &&
        Math.hypot(s.x - px, s.z - pz) > Math.abs(v) * dt * 0.2;
    }
    if (me.current) {
      me.current.position.set(s.x, FOOT_Y, s.z);
      me.current.rotation.y = s.heading;
    }
    const want: AnimName = seated ? "sit" : s.moving ? "walk" : "idle";
    if (want !== anim.current) setAnimState(want);

    // camera: behind the shoulder outdoors, lower and closer inside the hall, stage view when seated
    const inside = inHall(s.x, s.z);
    const zone = inside
      ? "hall"
      : s.x > PLOT.x0 && s.z < PLOT.z1
        ? "yard"
        : "street";
    if (zone !== useGame.getState().zone) set({ zone });
    // the song is background music: 5% everywhere, a touch lower in the hall (the LED wall is on)
    setBillboardVolume(inside ? 3 : SONG_VOLUME);
    if (inside !== insideRef.current) {
      insideRef.current = inside;
      // in the hall the LED wall has the floor: the road billboard's song and video stop till you're out
      setSongQuiet(inside);
      setShowWall(inside);
      // walking in: something is already playing on the wall, and the background music steps aside
      if (inside && !useGame.getState().nowPlaying)
        set({
          nowPlaying: {
            minister: MINISTERS[0].id,
            video: MINISTERS[0].videos[0].id,
          },
        });
    }
    // drag (mouse or finger) to swing the camera around you; it eases back behind you as you walk
    const o = orbit.current;
    if (!o.dragging && performance.now() - o.last > 1800 && s.moving) {
      o.yaw *= Math.exp(-dt * 1.6);
      o.pitch *= Math.exp(-dt * 1.6);
    }
    let wantPos: THREE.Vector3;
    let wantLook: THREE.Vector3;
    if (seated) {
      // orbit a point between your seat and the stage: stage, LED wall and the crowd in view
      const [sax, saz] = seats.mine
        ? [seats.mine.ax, seats.mine.az]
        : [PLAYER_SEAT_AUD.x, PLAYER_SEAT_AUD.z];
      const [px, pz] = audToLocal(sax, saz - 4);
      const pivot = new THREE.Vector3(px, 2.6, pz);
      const yaw = TO_SCREEN + Math.PI + o.yaw,
        pitch = 0.2 + o.pitch;
      const r = 9.5 * o.zoom;
      wantPos = new THREE.Vector3(
        pivot.x + Math.sin(yaw) * Math.cos(pitch) * r,
        pivot.y + Math.sin(pitch) * r,
        pivot.z + Math.cos(yaw) * Math.cos(pitch) * r,
      );
      const [ledX, ledZ] = audToLocal(LED.x, LED.z);
      wantLook = pivot
        .clone()
        .lerp(
          new THREE.Vector3(ledX, LED.y - 0.8, ledZ),
          Math.max(0, 1 - Math.abs(o.yaw) * 0.8) * 0.85,
        );
    } else {
      const back = (inside ? 3.6 : 5) * o.zoom;
      const yaw = s.heading + Math.PI + o.yaw;
      const pitch = (inside ? 0.18 : 0.28) + o.pitch;
      const head = new THREE.Vector3(s.x, 1.5, s.z);
      wantPos = new THREE.Vector3(
        head.x + Math.sin(yaw) * Math.cos(pitch) * back,
        head.y + Math.sin(pitch) * back,
        head.z + Math.cos(yaw) * Math.cos(pitch) * back,
      );
      wantLook = head
        .clone()
        .add(new THREE.Vector3(-Math.sin(yaw) * 2, -0.1, -Math.cos(yaw) * 2));
    }
    // keep the camera inside the hall walls when you're in there, and above the ground outside
    if (inside || seated) {
      wantPos.x = THREE.MathUtils.clamp(
        wantPos.x,
        HALL.x0 + 0.6,
        HALL.x1 - 0.6,
      );
      wantPos.z = THREE.MathUtils.clamp(
        wantPos.z,
        HALL.z0 + 0.6,
        HALL.z1 - 1.3,
      );
      wantPos.y = THREE.MathUtils.clamp(wantPos.y, 0.8, HALL.h - 1.4);
    } else wantPos.y = Math.max(0.6, wantPos.y);
    if (PHOTO) {
      // ?photo=x,y,z,tx,ty,tz (compound coords): a fixed camera for matching the architect's renders
      wantPos = new THREE.Vector3(PHOTO[0], PHOTO[1], PHOTO[2]);
      wantLook = new THREE.Vector3(PHOTO[3], PHOTO[4], PHOTO[5]);
      camPos.current.copy(compound.localToWorld(wantPos.clone()));
      camLook.current.copy(compound.localToWorld(wantLook.clone()));
    }
    compound.localToWorld(wantPos);
    compound.localToWorld(wantLook);
    // a booth's form open: fly in to its board
    zoom(camera as THREE.PerspectiveCamera, dt, wantPos, wantLook);
    const ease = arrival.current < 1.8 ? 2.6 : 5;
    arrival.current += dt;
    camPos.current.lerp(wantPos, 1 - Math.exp(-dt * ease));
    camLook.current.lerp(wantLook, 1 - Math.exp(-dt * (ease + 2)));
    camera.position.copy(camPos.current);
    camera.lookAt(camLook.current);

    // nearest interaction spot (seat inside the hall)
    let spot: string | null = null;
    if (!seated) {
      for (const sp of SPOTS)
        if (Math.hypot(sp.x - s.x, sp.z - s.z) < sp.r) spot = sp.id as string;
      // in the hall: the nearest empty seat within reach
      let near: FreeSeat | null = null;
      if (!spot && inside) {
        let best = SEAT_REACH;
        for (const f of seats.free) {
          if (f.taken) continue;
          const d = Math.hypot(f.x - s.x, f.z - s.z);
          if (d < best) {
            best = d;
            near = f;
          }
        }
        if (near) spot = "seat";
      }
      seats.near = near;
    } else spot = "seat";
    // a ring on the floor round the seat you'd sit in
    if (marker.current) {
      const n = seats.near;
      marker.current.visible = !seated && !!n;
      if (n) {
        marker.current.position.set(n.x, 0.13, n.z);
        marker.current.scale.setScalar(
          1 + Math.sin(performance.now() / 220) * 0.08,
        );
      }
    }
    if (spot !== lastSpot.current) {
      lastSpot.current = spot;
      set({ venueSpot: spot as VenueSpot });
    }
  });

  const where = useMemo(() => {
    const v = new THREE.Vector3();
    return () =>
      compound.localToWorld(v.set(state.current.x, 0, state.current.z));
  }, [compound]);
  return (
    <>
      <VenueCrowd world={world} where={where} />
      <HallCuller />
      <group
        position={[COMPOUND.center[0], 0, COMPOUND.center[1]]}
        rotation-y={COMPOUND.rotation}
      >
        <group ref={me}>
          <Suspense fallback={null}>
            <Character
              avatarId={player.avatarId}
              robe={false}
              robeId={player.robeId}
              skin={player.skin}
              hoodUp={player.hoodUp}
              anim={anim.current}
              torch={registered ? "lit" : "none"}
              timeScale={anim.current === "walk" ? 1.3 : 1}
            />
          </Suspense>
          <NameTag name={player.name || "You"} you y={seated ? 1.55 : 2.05} />
        </group>
        <mesh
          ref={marker}
          rotation-x={-Math.PI / 2}
          visible={false}
          renderOrder={5}
        >
          <ringGeometry args={[0.36, 0.46, 32]} />
          <meshBasicMaterial
            color={[2.6, 1.9, 0.4]}
            toneMapped={false}
            transparent
            opacity={0.9}
            depthWrite={false}
          />
        </mesh>
        {showWall && (
          <group position={AUD_GROUP.position} rotation-y={AUD_GROUP.rotation}>
            <LedWall />
          </group>
        )}
      </group>
    </>
  );
}

// small helpers so animation/visibility changes re-render only when they actually change
function useAnimState(): [
  React.MutableRefObject<AnimName>,
  (a: AnimName) => void,
] {
  const ref = useRef<AnimName>("idle");
  const [, force] = useState(0);
  return [
    ref,
    (a) => {
      ref.current = a;
      force((n) => n + 1);
    },
  ];
}
function useShowWall(): [boolean, (v: boolean) => void] {
  const [v, setV] = useState(false);
  return [v, setV];
}
