import { create } from "zustand";
import { ROBES, SKIN_TONES } from "./data/avatars";
import { RIDE_ACROSS_LAGOS } from "./config";
import { FLY_THRESHOLD_KM, FUSION_CENTRE, INSTALLATIONS, distanceKm, type LatLon } from "./data/places";

export type Stage = "title" | "create" | "origin" | "flight" | "drive" | "venue";

export type Origin = LatLon & { label: string; detail: string; installationId?: string };

export type Player = {
  name: string;
  avatarId: string;
  robeId: string;
  skin: string;
  hoodUp: boolean;
  torchLit: boolean;
};

/** Live numbers the 3D scenes publish for the HTML overlay (kept out of React state on purpose). */
export type Telemetry = {
  speedKmh: number;
  remainingM: number;
  routeM: number;
  heading: number;
  x: number;
  z: number;
  street: string;
  flightT: number;
};

export type VenueSpot = "gate" | "kiosk" | "court" | "walkway" | "hall" | "seat" | null;

/** This browser's registration, kept in localStorage so the torch is still yours next visit. */
/** Your registration on this browser: referral ID, check-in pass (and its QR image). */
export type Registration = { code: string; firstName: string; at: number; ticket?: string; qr?: string; days?: string; online?: boolean; name?: string; email?: string; phone?: string };
const REG_KEY = "torch:registration";
/** Female or male, picked at the bottom of the screen (female unless they've chosen): kept on this browser. */
export const PLAYER_AVATARS = { f: "f11", m: "m04" } as const;
export const AVATAR_KEY = "torch:avatar";
function savedAvatar(): string {
  try {
    const v = typeof window !== "undefined" ? localStorage.getItem(AVATAR_KEY) : null;
    if (v === PLAYER_AVATARS.m || v === PLAYER_AVATARS.f) return v;
  } catch {
    /* storage unavailable */
  }
  return PLAYER_AVATARS.f;
}
function loadRegistration(): Registration | null {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(REG_KEY) : null;
    return raw ? (JSON.parse(raw) as Registration) : null;
  } catch {
    return null;
  }
}

type GameState = {
  stage: Stage;
  /** Registered (and so carrying a torch): needed to go into the Main Hall. */
  registered: Registration | null;
  /**
   * The torch comes first: a form that sends someone's details (merch, volunteering, a prize, a
   * testimony) asks for it before sending, and this is the form to go back to once they have it.
   */
  torchReturn: string | null;
  /** Record a registration on this browser and hand the player their torch. */
  register: (r: Registration) => void;
  player: Player;
  origin: Origin | null;
  /** Which prepared road route the drive uses. */
  route: "airport" | "city";
  autopilot: boolean;
  /** How the player crosses Lagos: their own cab, or a danfo. null until they choose. */
  ride: "cab" | "danfo" | null;
  /** Other attendees who boarded the danfo on the way. */
  passengers: string[];
  conductorLine: string;
  /** Feast Radio in the danfo/cab: a YouTube video id, or null when off. */
  radio: string | null;
  /** Friends you invited: they board your danfo on the way, from their pickup addresses. */
  invites: { friend: string; email: string; pickup: string; status: "sent" | "email-app" }[];
  /** Set when this visitor came from a friend's invite link. */
  invitedBy: { id: string; from: string; friend: string; pickup: { label: string; lat: number; lon: number } | null } | null;
  /** Bumped to make the cab jump ahead to the end of the route. */
  skipDrive: number;
  arrived: boolean;
  flightPhase: "globe" | "approach" | "landed";
  venueSpot: VenueSpot;
  seated: boolean;
  nowPlaying: { minister: string; video: string } | null;
  pass: { code: string; issuedAt: number } | null;
  /** Where you appear when you start walking: on the street, or at the Main Hall door. */
  spawnAt: "street" | "door";
  /** The visitor has taken the aerial camera (drag/zoom); "Reset view" hands it back. */
  freeCam: boolean;
  /** Bumped to jump the opening film to the Fusion Centre. */
  skipFilm: number;
  /** The booth panel open on screen (register, merch, game, travel, lodging, volunteer, give). */
  panel: string | null;
  /** The world's shaders are compiled (until then the loading screen stays up). */
  warm: boolean;
  /** The film is holding at the end of the jets for the crowd's people to finish loading. */
  waitingCrowd: boolean;
  /** Where you are at the Fusion Centre: things out of sight there aren't drawn. */
  zone: "street" | "yard" | "hall";
  /** The drone shot on screen during the procession (for captions). */
  procShot: { id: string; title: string; sub: string } | null;
  tele: Telemetry;
  setStage: (s: Stage) => void;
  updatePlayer: (p: Partial<Player>) => void;
  setOrigin: (o: Origin) => void;
  /** Moves on from the origin picker: fly if far from Lagos, otherwise straight to the drive. */
  departFromOrigin: () => void;
  /** After landing (or straight from a Lagos origin): the ride across Lagos, or the procession on foot. */
  afterLanding: () => void;
  set: (p: Partial<Omit<GameState, "set">>) => void;
  debugJump: (s: Stage) => void;
};

export const useGame = create<GameState>((set, get) => ({
  stage: "title",
  registered: loadRegistration(),
  torchReturn: null,
  register: (r) => {
    try {
      localStorage.setItem(REG_KEY, JSON.stringify(r));
    } catch {
      /* storage unavailable: registered for this visit only */
    }
    set({ registered: r, player: { ...get().player, torchLit: true } });
  },
  player: { name: "", avatarId: savedAvatar(), robeId: ROBES[0].id, skin: SKIN_TONES[0], hoodUp: false, torchLit: false },
  origin: null,
  route: "airport",
  autopilot: false,
  ride: null,
  passengers: [],
  conductorLine: "",
  radio: null,
  invites: [],
  invitedBy: null,
  skipDrive: 0,
  arrived: false,
  flightPhase: "globe",
  venueSpot: null,
  seated: false,
  nowPlaying: null,
  pass: null,
  procShot: null,
  zone: "street",
  warm: false,
  waitingCrowd: false,
  panel: null,
  skipFilm: 0,
  freeCam: false,
  spawnAt: "street",
  tele: { speedKmh: 0, remainingM: 0, routeM: 0, heading: 0, x: 0, z: 0, street: "", flightT: 0 },
  setStage: (stage) => set({ stage }),
  updatePlayer: (p) => set({ player: { ...get().player, ...p } }),
  setOrigin: (origin) => set({ origin }),
  departFromOrigin: () => {
    const o = get().origin;
    if (!o) return;
    const fly = distanceKm(o, FUSION_CENTRE) > FLY_THRESHOLD_KM;
    if (!fly && !RIDE_ACROSS_LAGOS) {
      set({ stage: "venue", route: "city", flightPhase: "globe", arrived: true, venueSpot: null });
      return;
    }
    set({ stage: fly ? "flight" : "drive", route: fly ? "airport" : "city", flightPhase: "globe", arrived: false, ride: null, passengers: [] });
  },
  afterLanding: () => {
    if (RIDE_ACROSS_LAGOS) set({ flightPhase: "landed" });
    else set({ stage: "venue", flightPhase: "globe", arrived: true, venueSpot: null });
  },
  set: (p) => set(p),
  debugJump: (stage) => {
    const london = INSTALLATIONS.find((i) => i.id === "london")!;
    set({
      stage,
      player: { ...get().player, name: get().player.name || "Guest", torchLit: true },
      origin: get().origin ?? { lat: london.lat, lon: london.lon, label: london.name, detail: london.venue, installationId: london.id },
      route: "airport",
    });
  },
}));
