"use client";

import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { horn, say, setEngine, thump } from "../audio";
import { ATTENDEE_NAMES, NameTag } from "../avatar/NameTag";
import { Character } from "../avatar/Character";
import { AVATARS, ROBES, SKIN_TONES } from "../data/avatars";
import { axes, bindKeyboard } from "../input";
import { useGame } from "../store";
import { Cab } from "./Cab";
import { FOOT_Y, toWorld } from "./compound";
import { CONDUCTOR_SPOT, DANFO_SEATS, Danfo } from "./Danfo";
import { busStops, insideBuilding, laneOffsets, nearestRoad, projectOnRoute, routeAt, type LagosWorld, type Route } from "./lagosData";
import { trafficNow } from "./Traffic";

// Crossing Lagos to the Fusion Centre, two ways:
//  - "cab":   you drive a yellow cab yourself, fast and loose (or hand it to the driver)
//  - "danfo": a danfo driver takes you, Lagos-style: flat out, weaving through gaps, honking,
//             near misses, stopping at bus stops where other attendees board while the
//             conductor hangs out of the door calling for Ogba.

const CAB_MAX = 36; // m/s ≈ 130 km/h
const OFFROAD_MAX = 8;
// across the street from the gate, looking at the façade and the blue roof
const ARRIVAL_CAM = toWorld(-52, 70).setY(9);
const ARRIVAL_LOOK = toWorld(-8, 18).setY(5);

/** "I Accelerate" — Pastor Shola Okodugha feat. Sunmisola Agbebi (official video). */
export { ACCELERATE } from "../data/media";
import { ACCELERATE } from "../data/media";

const CALLS = ["Ogba! Ogba! Fusion Centre!", "Enter with your change o!", "Fusion Centre, The Feast 2026! Oya, enter!", "Ogba, Acme Road, Fusion Centre!", "Shift small, make person sit!", "Driver, we dey go!"];

export type CarState = { x: number; z: number; heading: number; speed: number; steer: number; hint: number; lateral: number; bump?: number };

/** Lane offset (right of the centre line) along a route, sampled every 5 m. */
function useLaneProfile(world: LagosWorld, route: Route) {
  return useMemo(() => {
    const out: number[] = [];
    for (let s = 0; s <= route.length; s += 5) {
      const p = routeAt(route, s);
      out.push(laneOffsets(nearestRoad(world, p.x, p.z).road)[0]);
    }
    return (s: number) => out[Math.max(0, Math.min(out.length - 1, Math.round(s / 5)))];
  }, [world, route]);
}

/** Glowing chevrons painted on the road along the remaining route (cab mode). */
function RouteRibbon({ route, lane }: { route: Route; lane: (s: number) => number }) {
  const geo = useMemo(() => {
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const w = 1.5;
    for (let i = 0; i < route.pts.length; i++) {
      const p = route.pts[i];
      const q = route.pts[Math.min(route.pts.length - 1, i + 1)];
      const o = route.pts[Math.max(0, i - 1)];
      let dx = q[0] - o[0], dz = q[1] - o[1];
      const l = Math.hypot(dx, dz) || 1;
      dx /= l;
      dz /= l;
      const off = lane(route.cum[i]);
      const cx = p[0] - dz * off, cz = p[1] + dx * off;
      pos.push(cx - dz * w, 0.12, cz + dx * w, cx + dz * w, 0.12, cz - dx * w);
      uv.push(0, route.cum[i], 1, route.cum[i]);
      if (i > 0) {
        const a = (i - 1) * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }, [route, lane]);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        uniforms: { uTime: { value: 0 }, uDone: { value: 0 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uTime; uniform float uDone; varying vec2 vUv;
          void main(){
            if (vUv.y < uDone) discard;
            float along = fract((vUv.y - uTime * 14.0) / 6.0);
            float chevron = abs(vUv.x - 0.5) * 1.2 + along;
            float a = smoothstep(0.55, 0.62, chevron) * (1.0 - smoothstep(0.82, 0.9, chevron));
            float fade = smoothstep(0.0, 25.0, vUv.y - uDone);
            gl_FragColor = vec4(vec3(1.0, 0.62, 0.16) * 2.2, a * 0.85 * fade);
          }
        `,
      }),
    [],
  );
  useFrame(({ clock }) => {
    mat.uniforms.uTime.value = clock.elapsedTime;
    const t = useGame.getState().tele;
    mat.uniforms.uDone.value = t.routeM - t.remainingM - 5;
  });
  return <mesh geometry={geo} material={mat} renderOrder={5} />;
}

type Waiting = { id: string; name: string; avatarId: string; robeId: string; skin: string; stopS: number; slot: number };

/** Attendees waiting at the bus stops with their torches, until the danfo picks them up. */
function useWaitingAttendees(route: Route) {
  const invites = useGame((s) => s.invites);
  const invitedBy = useGame((s) => s.invitedBy);
  return useMemo(() => {
    const list: Waiting[] = [];
    let n = 0;
    // the people you're riding with come first: friends you invited, or the friend who invited you
    const friends = [...invites.map((i) => i.friend), ...(invitedBy ? [invitedBy.from] : [])];
    const stops = busStops(route).filter((_, i) => i % 2 === 0);
    friends.forEach((name, i) => {
      const a = AVATARS[(i * 3 + 4) % AVATARS.length];
      list.push({ id: "f" + i, name, avatarId: a.id, robeId: ROBES[(i + 2) % 4].id, skin: a.sex === "f" ? SKIN_TONES[3] : SKIN_TONES[0], stopS: stops[Math.min(i, stops.length - 1)] ?? 300, slot: 2 + (i % 2) });
    });
    busStops(route).forEach((s, i) => {
      if (i % 2 === 1) return; // the danfo stops at every other stop
      const count = 1 + (i % 3 === 0 ? 1 : 0);
      for (let k = 0; k < count; k++) {
        const a = AVATARS[(n * 5 + 3) % AVATARS.length];
        list.push({ id: "w" + n, name: ATTENDEE_NAMES[n % ATTENDEE_NAMES.length], avatarId: a.id, robeId: ROBES[n % 4].id, skin: a.sex === "f" ? SKIN_TONES[3] : SKIN_TONES[0], stopS: s, slot: k });
        n++;
      }
    });
    return list;
  }, [route, invites, invitedBy]);
}

export function Driving({ world, car }: { world: LagosWorld; car: React.RefObject<CarState | null> }) {
  const routeKey = useGame((s) => s.route);
  const player = useGame((s) => s.player);
  const ride = useGame((s) => s.ride) ?? "cab";
  const set = useGame((s) => s.set);
  const route = world.routes[routeKey];
  const lane = useLaneProfile(world, route);
  const vehicleRef = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera);
  const camPos = useRef(new THREE.Vector3());
  const camLook = useRef(new THREE.Vector3());
  const frame = useRef(0);
  const arrived = useRef(false);
  const skipSeen = useRef(useGame.getState().skipDrive);
  const shake = useRef(0);
  const stuckFor = useRef(0);
  const shoulderUntil = useRef(0);
  const onKerb = useRef(false);
  const nextHorn = useRef(3);
  const nextCall = useRef(2);
  const stopState = useRef<{ s: number; t: number } | null>(null);
  const servedStops = useRef(new Set<number>());
  const waiting = useWaitingAttendees(route);
  const [boarded, setBoarded] = useState<Waiting[]>([]);
  const [line, setLine] = useState("");

  useEffect(() => {
    bindKeyboard();
    const start = routeAt(route, 0);
    const look = routeAt(route, 12);
    const off = lane(0);
    car.current = { x: start.x - start.dz * off, z: start.z + start.dx * off, heading: Math.atan2(look.x - start.x, look.z - start.z), speed: 0, steer: 0, hint: 0, lateral: off };
    camPos.current.set(start.x - Math.sin(car.current.heading) * 9, 4, start.z - Math.cos(car.current.heading) * 9);
    camLook.current.set(start.x, 1, start.z);
    servedStops.current.clear();
    setBoarded([]);
    set({ arrived: false, passengers: [], tele: { ...useGame.getState().tele, routeM: route.length, remainingM: route.length } });
    return () => setEngine(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey]);

  useFrame(({ clock }, rawDt) => {
    const c = car.current;
    const veh = vehicleRef.current;
    if (!c || !veh) return;
    const dt = Math.min(rawDt, 0.05);
    const state = useGame.getState();
    const danfo = ride === "danfo";
    const chosen = state.ride !== null;
    const auto = danfo || state.autopilot;

    // "skip ahead": jump close to the destination
    if (state.skipDrive !== skipSeen.current) {
      skipSeen.current = state.skipDrive;
      const p = routeAt(route, route.length - 140);
      const off = lane(route.length - 140);
      c.x = p.x - p.dz * off;
      c.z = p.z + p.dx * off;
      c.heading = Math.atan2(p.dx, p.dz);
      c.speed = 8;
      c.hint = route.pts.length - 2;
      for (const s of busStops(route)) servedStops.current.add(s);
      camPos.current.set(c.x - Math.sin(c.heading) * 9, 4, c.z - Math.cos(c.heading) * 9);
    }

    const proj = projectOnRoute(route, c.x, c.z, c.hint);
    if (frame.current++ % 30 === 0 || proj.dist > 60) {
      const full = projectFull(route, c.x, c.z);
      if (full.dist < proj.dist) Object.assign(proj, full);
    }
    c.hint = proj.index;
    const road = nearestRoad(world, c.x, c.z);
    const fx = Math.sin(c.heading), fz = Math.cos(c.heading);

    let throttle = 0;
    let steerIn = 0;
    if (!chosen || arrived.current) {
      throttle = -1;
    } else if (auto) {
      // ---- the driver: pick the lane with the longest gap ahead, then pure pursuit ----
      const here = routeAt(route, proj.s);
      const rx = -here.dz, rz = here.dx; // right of the route
      const lanes = laneOffsets(road.road);
      const gapFor = (off: number) => {
        let gap = 80;
        for (const v of trafficNow) {
          const dx = v.x - c.x, dz = v.z - c.z;
          const ahead = dx * fx + dz * fz;
          if (ahead < -2 || ahead > 80) continue;
          const lat = (v.x - here.x) * rx + (v.z - here.z) * rz;
          if (Math.abs(lat - off) > 1.7) continue;
          if (Math.sin(v.h) * fx + Math.cos(v.h) * fz < 0.3) continue;
          gap = Math.min(gap, ahead - v.len / 2 - 2.4);
        }
        return gap;
      };
      let best = c.lateral;
      let bestGap = gapFor(c.lateral);
      for (const off of lanes) {
        const g = gapFor(off);
        // danfo drivers switch lanes for any advantage; the cab driver needs a real one
        if (g > bestGap + (danfo ? 4 : 15)) {
          best = off;
          bestGap = g;
        }
      }
      if (lanes.length === 1 || Math.abs(c.lateral - lanes[0]) > 6) best = lanes[0];
      if (clock.elapsedTime >= shoulderUntil.current) c.lateral = THREE.MathUtils.damp(c.lateral, best, danfo ? 2.6 : 1.4, dt);

      const ahead = routeAt(route, proj.s + 9 + c.speed * 0.55);
      const lx = ahead.x - ahead.dz * c.lateral, lz = ahead.z + ahead.dx * c.lateral;
      let d = Math.atan2(lx - c.x, lz - c.z) - c.heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      steerIn = THREE.MathUtils.clamp(d * 2.4, -1, 1);

      const far = routeAt(route, proj.s + 40);
      let turn = Math.abs(Math.atan2(far.dx, far.dz) - Math.atan2(ahead.dx, ahead.dz));
      if (turn > Math.PI) turn = Math.PI * 2 - turn;
      let target = turn > 0.7 ? (danfo ? 11 : 9) : turn > 0.3 ? (danfo ? 18 : 14) : danfo ? 27 : 20;
      if (route.length - proj.s < 45) target = 4;
      // follow (danfos tailgate). Stuck for a moment? A danfo climbs the kerb and passes on the
      // shoulder — never over other vehicles — then drops back into the lane when it clears.
      stuckFor.current = c.speed < 2.5 && bestGap < 12 ? stuckFor.current + dt : Math.max(0, stuckFor.current - dt * 0.5);
      const t = clock.elapsedTime;
      if (stuckFor.current > (danfo ? 2.2 : 5) && t > shoulderUntil.current && road.road) {
        shoulderUntil.current = t + 6;
        stuckFor.current = 0;
        if (danfo) {
          const call = "Driver climb am! Shoulder! We no dey wait!";
          setLine(call);
          set({ conductorLine: call });
          say(call);
          // it is our time for speed
          if (!useGame.getState().radio) set({ radio: ACCELERATE });
        }
        horn(true);
      }
      const onShoulder = t < shoulderUntil.current && road.road;
      if (onShoulder) {
        const kerb = road.road!.width / 2 + 1.0;
        c.lateral = THREE.MathUtils.damp(c.lateral, kerb, 2.2, dt);
        // only things actually on the shoulder can stop us there
        let shoulderGap = 60;
        for (const v of trafficNow) {
          const dx = v.x - c.x, dz = v.z - c.z;
          const ah = dx * fx + dz * fz;
          if (ah < 0 || ah > 60) continue;
          const lat = (v.x - here.x) * rx + (v.z - here.z) * rz;
          if (Math.abs(lat - kerb) < 1.8) shoulderGap = Math.min(shoulderGap, ah - v.len / 2 - 2.5);
        }
        target = Math.min(danfo ? 13 : 10, Math.max(0, shoulderGap * 0.8));
        if (bestGap > 35 && t > shoulderUntil.current - 4) shoulderUntil.current = t; // lane clear: back in
      } else if (bestGap < 30) target = Math.min(target, Math.max(0, bestGap * (danfo ? 0.9 : 0.6)));
      if (stuckFor.current > 1 && t > nextHorn.current) {
        horn(true);
        nextHorn.current = t + 1.2;
      }

      // ---- bus stops: the danfo pulls in, people board, off again ----
      if (danfo) {
        const stop = busStops(route).find((s, i) => i % 2 === 0 && !servedStops.current.has(s) && s - proj.s < 70 && s - proj.s > -10);
        if (stop !== undefined) {
          const dist = stop - proj.s;
          target = Math.min(target, Math.max(0, dist * 0.45));
          c.lateral = THREE.MathUtils.damp(c.lateral, lanes[0] + 0.6, 2, dt);
          if (dist < 4 && c.speed < 1.5) {
            if (!stopState.current || stopState.current.s !== stop) {
              stopState.current = { s: stop, t: 0 };
              const call = "Fusion Centre! Ogba! Oya, enter, enter!";
              setLine(call);
              set({ conductorLine: call });
              say(call);
            }
            stopState.current.t += dt;
            target = 0;
            if (stopState.current.t > 3.2) {
              const joiners = waiting.filter((w) => w.stopS === stop);
              if (joiners.length) {
                setBoarded((b) => [...b, ...joiners].slice(0, DANFO_SEATS.length - 1));
                set({ passengers: [...useGame.getState().passengers, ...joiners.map((j) => j.name)] });
              }
              servedStops.current.add(stop);
              stopState.current = null;
              horn();
            }
          }
        }
      }
      throttle = THREE.MathUtils.clamp((target - c.speed) * (danfo ? 0.7 : 0.4), -1, 1);
      if (danfo && bestGap < 14 && c.speed > 6 && clock.elapsedTime > nextHorn.current) {
        horn(Math.random() < 0.3);
        nextHorn.current = clock.elapsedTime + 1.5 + Math.random() * 2;
      }
    } else {
      const a = axes();
      throttle = a.y;
      steerIn = -a.x;
      if (a.y > 0.5 && Math.abs(c.speed) > 20 && clock.elapsedTime > nextHorn.current) nextHorn.current = clock.elapsedTime + 1;
    }

    // ---- arcade physics: quick, loose, a bit wild ----
    const offroad = road.dist > (road.road?.width ?? 6) / 2 + 2.5;
    const maxV = offroad ? OFFROAD_MAX : danfo ? 30 : CAB_MAX;
    if (throttle > 0) c.speed += throttle * (c.speed < 0 ? 16 : danfo ? 7.5 : 9) * dt;
    else if (throttle < 0) c.speed += throttle * (c.speed > 0 ? 20 : 5) * dt;
    c.speed -= c.speed * (offroad ? 1.6 : 0.15) * dt;
    if (Math.abs(throttle) < 0.05) c.speed -= Math.sign(c.speed) * Math.min(Math.abs(c.speed), 2 * dt);
    c.speed = THREE.MathUtils.clamp(c.speed, -6, maxV);
    const steerMax = THREE.MathUtils.lerp(0.6, 0.13, Math.min(1, Math.abs(c.speed) / CAB_MAX));
    c.steer = THREE.MathUtils.damp(c.steer, steerIn * steerMax, danfo ? 10 : 8, dt);
    c.heading += ((c.speed * Math.tan(c.steer)) / 2.8) * dt;
    const nx = c.x + fx * c.speed * dt;
    const nz = c.z + fz * c.speed * dt;
    // only when off the carriageway: some roads pass under canopies, flyovers and terminal forecourts
    const hit = offroad && [-0.8, 0.8].some((side) => insideBuilding(world, nx + fx * 2.3 * Math.sign(c.speed || 1) + fz * side, nz + fz * 2.3 * Math.sign(c.speed || 1) - fx * side));
    if (hit) {
      c.speed *= -0.25;
      c.bump = 1;
    } else {
      c.x = nx;
      c.z = nz;
    }
    if (c.bump) {
      shake.current = Math.max(shake.current, c.bump);
      thump(c.bump);
      c.bump = 0;
    }

    // up on the kerb: lift the wheels and give a jolt when climbing on or off
    const kerbNow = !!road.road && road.dist > road.road.width / 2 + 0.3 && road.dist < road.road.width / 2 + 3;
    if (kerbNow !== onKerb.current) {
      onKerb.current = kerbNow;
      if (Math.abs(c.speed) > 2) {
        shake.current = Math.max(shake.current, 0.6);
        thump(0.7);
      }
    }
    veh.position.set(c.x, kerbNow ? 0.18 : 0, c.z);
    const sway = danfo ? 0.009 : 0.005;
    veh.rotation.set(-THREE.MathUtils.clamp(throttle * 0.02, -0.03, 0.03) + Math.sin(clock.elapsedTime * 17) * 0.002 * Math.min(1, c.speed / 10), c.heading, -c.steer * c.speed * sway);
    veh.traverse((o) => {
      if (o.name === "steer") o.rotation.y = c.steer;
      if (o.name === "spin") o.rotation.x += (c.speed * dt) / 0.36;
    });

    // ---- conductor ----
    if (danfo && chosen && !arrived.current && c.speed > 5 && clock.elapsedTime > nextCall.current) {
      const call = CALLS[Math.floor(Math.random() * CALLS.length)];
      setLine(call);
      set({ conductorLine: call });
      say(call);
      nextCall.current = clock.elapsedTime + 9 + Math.random() * 6;
    }
    setEngine(c.speed, chosen);

    // ---- chase camera with road shake (on arrival: swing round to frame the Fusion Centre) ----
    if (arrived.current) {
      camPos.current.lerp(ARRIVAL_CAM, 1 - Math.exp(-dt * 1.2));
      camLook.current.lerp(ARRIVAL_LOOK, 1 - Math.exp(-dt * 1.5));
    } else {
      const back = (danfo ? 9.5 : 8) + Math.abs(c.speed) * 0.14;
      const want = new THREE.Vector3(c.x - fx * back, (danfo ? 4 : 3.2) + Math.abs(c.speed) * 0.03, c.z - fz * back);
      camPos.current.lerp(want, 1 - Math.exp(-dt * 4));
      camLook.current.lerp(new THREE.Vector3(c.x + fx * 6, 1.4, c.z + fz * 6), 1 - Math.exp(-dt * 6));
    }
    shake.current = Math.max(0, shake.current - dt * 1.8);
    const rough = Math.min(1, Math.abs(c.speed) / 30) * (danfo ? 0.07 : 0.045) + shake.current * 0.35;
    const t = clock.elapsedTime;
    camera.position.set(
      camPos.current.x + (Math.sin(t * 23.1) + Math.sin(t * 37.7)) * rough * 0.5,
      camPos.current.y + (Math.sin(t * 29.3) + Math.sin(t * 11.9)) * rough * 0.5,
      camPos.current.z + Math.sin(t * 19.7) * rough * 0.5,
    );
    camera.lookAt(camLook.current);

    // ---- telemetry for the HUD ----
    const remaining = proj.dist < 80 ? route.length - proj.s : Math.hypot(c.x - world.gate[0], c.z - world.gate[1]);
    useGame.setState((s) => ({
      tele: { ...s.tele, speedKmh: Math.abs(c.speed) * 3.6, remainingM: remaining, routeM: route.length, heading: c.heading, x: c.x, z: c.z, street: road.road?.name || s.tele.street },
    }));

    // ---- arrival at the gate ----
    const toGate = Math.hypot(c.x - world.gate[0], c.z - world.gate[1]);
    if (!arrived.current && toGate < 22) {
      arrived.current = true;
      set({ arrived: true, autopilot: false });
      if (danfo) say("Fusion Centre! Fusion Centre! Owa o! We don reach!");
    }
    if (arrived.current) c.speed *= 1 - Math.min(1, dt * 1.5);
  });

  const nearStops = useMemo(() => new Set(busStops(route)), [route]);
  const progressS = useGame((s) => Math.round((s.tele.routeM - s.tele.remainingM) / 100) * 100);
  const me = <Character avatarId={player.avatarId} robeId={player.robeId} skin={player.skin} hoodUp={player.hoodUp} anim="sit" torch="none" />;

  return (
    <>
      {ride === "cab" && <RouteRibbon route={route} lane={lane} />}
      {ride === "cab" ? (
        <Cab ref={vehicleRef}>
          <group position={[0.42, -0.3, -0.55]} scale={0.92}>
            {me}
          </group>
        </Cab>
      ) : (
        <Danfo ref={vehicleRef}>
          {/* you, by the window */}
          <group position={DANFO_SEATS[0]} scale={0.9}>
            {me}
            <NameTag name={player.name || "You"} you y={2.4} />
          </group>
          {boarded.map((p, i) => (
            <group key={p.id} position={DANFO_SEATS[i + 1]} scale={0.9}>
              <Character avatarId={p.avatarId} robeId={p.robeId} skin={p.skin} hoodUp anim="sit" torch="none" />
              <NameTag name={p.name} y={2.4} />
            </group>
          ))}
          {/* the conductor hanging out of the door */}
          <group position={CONDUCTOR_SPOT} rotation={[0, Math.PI / 2 - 0.3, -0.18]}>
            <Character avatarId="m12" robeId="midnight" anim="wave" torch="none" />
            {line && (
              <Html position={[0, 2.3, 0]} center zIndexRange={[4, 0]} style={{ pointerEvents: "none" }}>
                <div className="whitespace-nowrap rounded-2xl bg-white px-3 py-1.5 text-xs font-extrabold text-black shadow-lg">“{line}”</div>
              </Html>
            )}
          </group>
        </Danfo>
      )}
      {/* attendees waiting at the next stops (danfo mode) */}
      {ride === "danfo" &&
        waiting
          .filter((w) => !boarded.includes(w) && nearStops.has(w.stopS) && w.stopS - progressS < 450 && w.stopS - progressS > -120)
          .map((w) => {
            const p = routeAt(route, w.stopS + 4 + w.slot * 1.4);
            const off = lane(w.stopS) + 4.6;
            return (
              <group key={w.id} position={[p.x - p.dz * off, FOOT_Y, p.z + p.dx * off]} rotation-y={Math.atan2(p.dz, -p.dx)}>
                <Character avatarId={w.avatarId} robeId={w.robeId} skin={w.skin} hoodUp={false} anim={w.slot ? "wave" : "idle"} torch="lit" torchLight={false} />
                <NameTag name={w.name} y={2.25} />
              </group>
            );
          })}
    </>
  );
}

function projectFull(route: Route, x: number, z: number) {
  let best = { s: 0, dist: Infinity, index: 1 };
  for (let i = 1; i < route.pts.length; i += 25) {
    const p = projectOnRoute(route, x, z, i);
    if (p.dist < best.dist) best = p;
  }
  return best;
}
