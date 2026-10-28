import * as THREE from "three";

// The New Fusion Centre compound, laid out from the architect's renders (references/fusion-centre)
// on the real OSM footprint. Frame: origin at the building's centre, +z toward Acme Road (the
// front, where the car park and gate are), −x toward Surulere Industrial Ave / Adeniyi Jones
// Avenue (the long side with the rainbow annex). The building (hall + annex) is the 45 × 46 m
// OSM footprint; the yard and lanes around it reach the perimeter walls.

export const COMPOUND = {
  center: [-2.05, 22.77] as [number, number],
  rotation: -2.76,
};

/**
 * How far above y = 0 people stand (and the hall's chairs stand): the ground they walk on is laid
 * a little above it (roads 4–6 cm, the yard and forecourt 6–8.5 cm, the hall's carpet 9 cm), so at
 * y = 0 their feet would sink into it.
 */
export const FOOT_Y = 0.08;

/** Perimeter walls (plot bounds). */
export const PLOT = { x0: -34, x1: 26.5, z0: -26, z1: 53 };
/**
 * The car park behind the compound, off Adeniyi Jones Avenue (outside the walls): x0..x1 × z0..z1,
 * one aisle across at z = aisle, entered from the avenue (its centreline at x = road).
 */
export const PARKING = { x0: -35, x1: -5, z0: -64, z1: -34, aisle: -49, road: -45.6 };
/** Main hall (sky-blue gable roof). */
export const HALL = { x0: -14, x1: 22.7, z0: -23.2, z1: 23.2, h: 10.5, ridge: 12.6 };
/** Low annex along the main road: rooms below, rooftop units on top, rainbow slats outside. */
export const ANNEX = { x0: -22.7, x1: -14, z0: -23.2, z1: 23.2, h: 7 };
/** White ribbed block with the round logo, at the front corner by the annex. */
export const SIGN_BLOCK = { x0: -14, x1: -6.5, z0: 17, z1: 24.2 };
/** Where the sign block starts once it's kept out of the hall (behind the lobby wall, on the facade). */
export const SIGN_BLOCK_BACK = HALL.z1 - 0.85;
/** The main entrance: the centre of the glass front, straight off the forecourt (the screen ahead of you). */
export const MAIN_DOOR = { x: 4.35, z: HALL.z1, w: 3.6 };
/** The only parking: the back-left corner of the compound, by the main-road wall. */
export const CAR_PARK = { x0: PLOT.x0 + 0.6, x1: -23.3, z0: PLOT.z0 + 0.6, z1: PLOT.z0 + 5.6 };
/**
 * Side doors in the hall's left wall (none: the left wall is plain; everyone uses the main doors) (audience left, the annex side), reached by
 * corridors through the annex from the lane along the main road. Coming in, the stage is on your left.
 */
export const SIDE_DOORS: { z: number; w: number }[] = [];
/** Corridor height through the annex. */
export const CORRIDOR_H = 3.2;
/** Coloured-glass canopy walkway along the hall's west side. */
export const CANOPY = { x0: 22.7, x1: 26.1, z0: -14, z1: 23.2, h: 3.4 };
/** Two-storey container café at the corner of the two roads. */
export const KIOSK = { x: -29.2, z: 46.5, rot: Math.PI / 2 };
/** Vehicle gate in the black steel fence on Acme Road; pedestrian gate on the main road by the café. */
export const GATE = { x0: -10, x1: 12, z: PLOT.z1 };
/** The open half of the sliding gate (it rolls back over the left half). */
export const GATE_OPENING = { x0: (GATE.x0 + GATE.x1) / 2, x1: GATE.x1 };
/** The second gate: at the back end of the main-road wall, by the car park. */
export const PED_GATE = { x: PLOT.x0, z0: -19.6, z1: -14.6 };
/** Basketball half-court in the west corner of the yard. */
export const COURT = { x0: 10.5, x1: 26, z0: 28, z1: 45.5 };
/** Red herringbone forecourt inside the vehicle gate. */
export const PAVERS = { x0: -16, x1: 10, z0: 43.5, z1: 52.4 };

// ----- inside the hall -----
/**
 * The auditorium has its own frame (`AUD`): x across the room, z from the screen wall (−z) to the
 * back (+z). The screen runs the long wall on the annex side, so coming in by the main doors (on
 * the audience's left, halfway down the room) you turn left to face it. Inside, everything is laid
 * out in this frame: draw it in a group with AUD_GROUP, convert points with audToLocal.
 */
const AUD_HW = (HALL.z1 - HALL.z0) / 2;
const AUD_HD = (HALL.x1 - HALL.x0) / 2;
export const AUD = { x0: -AUD_HW, x1: AUD_HW, z0: -AUD_HD, z1: AUD_HD, h: HALL.h };
/** The auditorium frame in the compound: a group at `position`, turned by `rotation`. */
export const AUD_GROUP = { position: [(HALL.x0 + HALL.x1) / 2, 0, (HALL.z0 + HALL.z1) / 2] as [number, number, number], rotation: Math.PI / 2 };
export const audToLocal = (x: number, z: number): [number, number] => [AUD_GROUP.position[0] + z, AUD_GROUP.position[2] - x];
export const localToAud = (x: number, z: number): [number, number] => [AUD_GROUP.position[2] - z, x - AUD_GROUP.position[0]];
/** Add to a heading in the auditorium (atan2(dx, dz)) for the same heading in the compound. */
export const AUD_HEADING = AUD_GROUP.rotation;
/** A box in the auditorium [x0, z0, x1, z1], in compound coordinates. */
export function audBox(x0: number, z0: number, x1: number, z1: number): [number, number, number, number] {
  const [ax, az] = audToLocal(x0, z0);
  const [bx, bz] = audToLocal(x1, z1);
  return [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)];
}
/** The main doors as seen from inside: on the auditorium's left wall. */
export const AUD_DOOR = { x: AUD.x0, z: localToAud(MAIN_DOOR.x, MAIN_DOOR.z)[1], w: MAIN_DOOR.w };
/** The lobby behind the doors: a lining wall this far in from the glass, open at the doors. */
export const LOBBY = 1.0;
export const STAGE = { x0: -19, x1: 19, z0: AUD.z0, z1: AUD.z0 + 6.5, h: 1.2 };
/** One very wide LED wall across the stage, with a square screen out at each end. */
export const LED = { x: 0, y: 5.7, z: AUD.z0 + 0.45, w: 30, h: 7 };
export const SIDE_SCREEN = { size: 4.6, gap: 1.2 };
/**
 * The U-shaped gallery: along the left wall, across the back and along the right wall, `depth`
 * deep, its arms starting at z0 (all of it facing the screen).
 */
export const GALLERY = { h: 3.6, depth: 5.5, z0: -6 };
/** Is (x, z) on the gallery's floor? */
export const onGallery = (x: number, z: number) =>
  z > GALLERY.z0 && (x < AUD.x0 + GALLERY.depth || x > AUD.x1 - GALLERY.depth || z > AUD.z1 - GALLERY.depth);
/** The gallery's columns, along its inner edge (none in the cross aisle from the doors). */
export const GALLERY_COLUMNS: [number, number][] = (() => {
  const out: [number, number][] = [];
  const ix0 = AUD.x0 + GALLERY.depth, ix1 = AUD.x1 - GALLERY.depth, iz = AUD.z1 - GALLERY.depth;
  for (const x of [ix0, ix1])
    for (let z = GALLERY.z0 + 0.3; z < iz; z += 6.2) if (Math.abs(z - AUD_DOOR.z) > 2) out.push([x, z]);
  for (let i = 0; i <= 6; i++) out.push([ix0 + ((ix1 - ix0) * i) / 6, iz]);
  return out;
})();
/**
 * Seating: rows across x facing the screen (−z), three blocks between two aisles, with a cross
 * aisle from the doors (rows within crossHalf of z = cross are left out). Under the gallery too.
 */
export const SEATS = {
  z0: STAGE.z1 + 2.35,
  z1: AUD.z1 - 0.9,
  dz: 0.95,
  dx: 0.62,
  blocks: [
    [-20.6, -8.2],
    [-6.2, 6.2],
    [8.2, 20.6],
  ] as [number, number][],
  aisles: [-7.2, 7.2],
  cross: AUD_DOOR.z,
  crossHalf: 1.0,
};
/** Every seat (auditorium frame): on the floor (block, col counted from its aisle, row) and in the gallery. */
export const SEAT_LIST: { x: number; z: number; y: number; block: number; col: number; row: number }[] = (() => {
  const out: { x: number; z: number; y: number; block: number; col: number; row: number }[] = [];
  const clear = (x: number, z: number) => GALLERY_COLUMNS.every(([cx, cz]) => Math.hypot(cx - x, cz - z) > 0.55);
  let row = 0;
  for (let z = SEATS.z0; z <= SEATS.z1 + 0.01; z += SEATS.dz) {
    if (Math.abs(z - SEATS.cross) < SEATS.crossHalf) continue;
    SEATS.blocks.forEach(([x0, x1], block) => {
      for (let x = x0; x <= x1 + 0.01; x += SEATS.dx) {
        if (!clear(x, z)) continue;
        const aisle = SEATS.aisles.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
        out.push({ x, z, y: 0, block, col: Math.round(Math.abs(x - aisle) / SEATS.dx), row });
      }
    });
    row++;
  }
  // the gallery: rows facing the screen, clear of the rail and the walls
  for (let z = GALLERY.z0 + 0.9; z < AUD.z1 - 0.7; z += 0.95)
    for (let x = AUD.x0 + LOBBY + 0.7; x < AUD.x1 - 0.7; x += 0.62) {
      const inner = z > AUD.z1 - GALLERY.depth ? z > AUD.z1 - GALLERY.depth + 0.7 : x < AUD.x0 + GALLERY.depth - 0.7 || x > AUD.x1 - GALLERY.depth + 0.7;
      if (onGallery(x, z) && inner) out.push({ x, z, y: GALLERY.h + 0.02, block: -1, col: 0, row: -1 });
    }
  return out;
})();
/** Your seat: on the centre block's aisle end, a few rows back. */
export const PLAYER_SEAT_AUD = { x: SEATS.blocks[1][1], z: SEATS.z0 + 3 * SEATS.dz };

/**
 * Feast-weekend booths around the building, each a tent with its counter facing `face` (radians,
 * like rotation.y: π/2 faces +x). Registration and Merch sit right on the forecourt by the gate,
 * the WEND games booth on the court, the help desks down the lane along the main road.
 */
export const TENTS = [
  // the two big ones: a registration pavilion on the forecourt and the merch store by the gate
  { id: "register", label: "Get your Torch", x: -9, z: 41, face: Math.PI / 2, color: "#e09a2c", w: 13, d: 6 },
  { id: "merch", label: "Feast Merch", x: 18, z: 49.4, face: Math.PI, color: "#c8102e", w: 12, d: 5 },
  { id: "game", label: "Play a game", x: 19.5, z: 36.5, face: -Math.PI / 2, color: "#6a3fd0", w: 2.8, d: 2.8 },
  { id: "give", label: "Give", x: 24.2, z: 30.2, face: -Math.PI / 2, color: "#7d0f22", w: 2.8, d: 2.8 },
  { id: "travel", label: "Travel Desk", x: -30, z: -6, face: Math.PI / 2, color: "#1438b8", w: 2.8, d: 2.8 },
  { id: "lodging", label: "Lodging Desk", x: -30, z: 6, face: Math.PI / 2, color: "#1438b8", w: 2.8, d: 2.8 },
  { id: "volunteer", label: "Volunteer HQ", x: -30, z: 18, face: Math.PI / 2, color: "#e09a2c", w: 2.8, d: 2.8 },
] as const;
export type Booth = (typeof TENTS)[number];

/** A point in front of (d > 0) or behind (d < 0) a booth's centre, offset sideways by `side`. */
export function boothPoint(t: Booth, d: number, side = 0): [number, number] {
  const fx = Math.sin(t.face), fz = Math.cos(t.face);
  return [t.x + fx * d + fz * side, t.z + fz * d - fx * side];
}
/** Just in front of a booth's counter (`extra` metres out from its front edge). */
export const boothFront = (t: Booth, extra: number, side = 0) => boothPoint(t, t.d / 2 + extra, side);
/** Where a booth's form board stands, and which way it faces: [x, z, face]. */
export function boothBoard(t: Booth): [number, number, number] {
  // beside the big booths (clear of their queues and the gate), in front of the small ones
  if (t.id === "register") return [...boothPoint(t, t.d / 2 + 1.2, t.w / 2 + 2.2), t.face];
  // the merch store runs nearly to the side wall: its board stands just inside the wall, ahead
  // of the store, turned to face across the yard
  if (t.id === "merch") return [PLOT.x1 - 0.8, t.z - t.d / 2 - 2.3, -Math.PI / 2];
  return [...boothFront(t, 1.6), t.face];
}

export type TentId = (typeof TENTS)[number]["id"];

/** Axis-aligned blockers in compound space for walking: [x0, z0, x1, z1]. */
export function colliders(): [number, number, number, number][] {
  const t = 0.4;
  /** Split a run along z into pieces around the side doors. */
  const aroundDoors = (x0: number, x1: number, z0: number, z1: number, pad = 0) => {
    const out: [number, number, number, number][] = [];
    let from = z0;
    for (const d of SIDE_DOORS) {
      out.push([x0, from, x1, d.z - d.w / 2 - pad]);
      from = d.z + d.w / 2 + pad;
    }
    out.push([x0, from, x1, z1]);
    return out;
  };
  const out: [number, number, number, number][] = [
    // hall shell: back, the glass front, the canopy side, the left wall with its two doors
    [HALL.x0 - t, HALL.z0 - t, HALL.x1 + t, HALL.z0 + t],
    [HALL.x0, HALL.z1 - t, MAIN_DOOR.x - MAIN_DOOR.w / 2, HALL.z1 + t],
    [MAIN_DOOR.x + MAIN_DOOR.w / 2, HALL.z1 - t, HALL.x1, HALL.z1 + t],
    [HALL.x1 - t, HALL.z0, HALL.x1 + t, HALL.z1],
    ...aroundDoors(HALL.x0 - t, HALL.x0 + t, HALL.z0, HALL.z1),
    // annex, with the two corridors through it, and the logo block
    ...aroundDoors(ANNEX.x0, ANNEX.x1, ANNEX.z0, ANNEX.z1, 0.25),
    [SIGN_BLOCK.x0, SIGN_BLOCK_BACK, SIGN_BLOCK.x1, SIGN_BLOCK.z1],
    // stage
    audBox(STAGE.x0, STAGE.z0, STAGE.x1, STAGE.z1),
    // (the seating blocks aren't walls: in them you walk along the rows, see Venue's rowWalk)
    // the lobby's lining wall, open at the doors
    audBox(AUD.x0 + LOBBY - 0.1, AUD.z0, AUD.x0 + LOBBY + 0.1, AUD_DOOR.z - AUD_DOOR.w / 2 - 0.3),
    audBox(AUD.x0 + LOBBY - 0.1, AUD_DOOR.z + AUD_DOOR.w / 2 + 0.3, AUD.x0 + LOBBY + 0.1, AUD.z1),
    // the gallery's columns
    ...GALLERY_COLUMNS.map(([x, z]) => audBox(x - 0.2, z - 0.2, x + 0.2, z + 0.2)),
    // café
    [KIOSK.x - 2.6, KIOSK.z - 3.6, KIOSK.x + 2.6, KIOSK.z + 3.6],
    // the car park
    [CAR_PARK.x0, CAR_PARK.z0, CAR_PARK.x1, CAR_PARK.z1],
  ];
  for (const t of TENTS) {
    // booth footprint, turned with the booth (they face along an axis)
    const along = Math.abs(Math.sin(t.face)) > 0.5;
    const hx = (along ? t.d : t.w) / 2, hz = (along ? t.w : t.d) / 2;
    out.push([t.x - hx, t.z - hz, t.x + hx, t.z + hz]);
  }
  return out;
}

export function toWorld(x: number, z: number) {
  const [cx, cz] = COMPOUND.center;
  const c = Math.cos(COMPOUND.rotation);
  const s = Math.sin(COMPOUND.rotation);
  return new THREE.Vector3(cx + x * c + z * s, 0, cz - x * s + z * c);
}

/** The plot outline in world coordinates (for keeping city clutter out of it). */
export function plotPolygonWorld(pad = 0): [number, number][] {
  return [
    [PLOT.x0 - pad, PLOT.z0 - pad],
    [PLOT.x1 + pad, PLOT.z0 - pad],
    [PLOT.x1 + pad, PLOT.z1 + pad],
    [PLOT.x0 - pad, PLOT.z1 + pad],
  ].map(([x, z]) => {
    const v = toWorld(x, z);
    return [v.x, v.z];
  });
}
