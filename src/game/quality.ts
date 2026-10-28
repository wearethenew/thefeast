// How much this device is given to draw. Worked out once, when the site opens:
//  - high: computers. Everything as designed: full crowds, shadows, glow, full detail at any distance.
//  - mid:  modern phones and tablets (an iPhone 14, a recent Android). A light frame (the screen's
//          own pixel density, no shadow or glow pass), a smaller crowd, light far-away people,
//          fewer cars, and cars only drawn near the camera.
//  - low:  older or low-memory phones: fewer again, drawn over a shorter distance.
// `?quality=low|mid|high` in the address forces a level (for testing).

export type Tier = "high" | "mid" | "low";

function detect(): Tier {
  if (typeof window === "undefined") return "high";
  const forced = new URLSearchParams(window.location.search).get("quality");
  if (forced === "high" || forced === "mid" || forced === "low") return forced;
  const touch = window.matchMedia("(pointer: coarse)").matches;
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  if (!touch && !ios && !android) return "high";
  // what a phone tells us of itself: memory (Android Chrome only), cores, screen
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const cores = navigator.hardwareConcurrency || 4;
  const shortSide = Math.min(window.screen.width, window.screen.height);
  if (memory !== undefined && memory <= 3) return "low";
  if (cores <= 4) return "low";
  // small older iPhones (SE, 8): a 375-wide screen at 2x
  if (ios && shortSide <= 375 && window.devicePixelRatio <= 2) return "low";
  return "mid";
}

export const TIER: Tier = detect();

const LEVELS = {
  high: {
    /** How full every crowd is (1 = as designed). */
    crowd: 1,
    /** Beyond this distance (m) people are drawn at their lightest; Infinity: never. */
    farPeople: Infinity,
    /** Most triangles all the people in a frame may cost (past it, the rest are drawn light). */
    peopleBudget: Infinity,
    /** Share of the city's traffic. */
    cars: 1,
    /** Street-column cars are drawn within this distance of the camera (m). */
    carsWithin: Infinity,
    /** Supersampling, shadows and the glow pass. */
    lite: false,
    /** The live video on the road billboard (otherwise its title card). */
    billboardVideo: true,
  },
  mid: { crowd: 0.35, farPeople: 40, peopleBudget: 700_000, cars: 0.45, carsWithin: 260, lite: true, billboardVideo: true },
  low: { crowd: 0.2, farPeople: 25, peopleBudget: 350_000, cars: 0.25, carsWithin: 160, lite: true, billboardVideo: false },
} as const;

/** This device's settings. */
export const Q = LEVELS[TIER];

/**
 * A canvas drawn for a texture (signs, boards, roof art), at the size this device needs: phones
 * get half the width and height (a quarter of the graphics memory). On a phone's screen they're
 * never shown big enough for the difference to show. Small canvases are left as they are.
 */
export function sizedForDevice(c: HTMLCanvasElement): HTMLCanvasElement {
  if (!Q.lite || Math.max(c.width, c.height) <= 512) return c;
  const d = document.createElement("canvas");
  d.width = Math.round(c.width / 2);
  d.height = Math.round(c.height / 2);
  const g = d.getContext("2d")!;
  g.imageSmoothingQuality = "high";
  g.drawImage(c, 0, 0, d.width, d.height);
  return d;
}
