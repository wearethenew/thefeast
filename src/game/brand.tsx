// The New Church mark, traced from the sign on the Fusion Centre (references/fusion-centre/render-16):
// an open "c" bowl and a looped "e" that close into a heart over a "w". Strokes in a 100 × 100
// box centred on the yellow disc (disc radius 50); butt ends, round joins.

export const MARK_STROKE = 7;
export const MARK_PATHS = [
  // left bowl, open at the top right
  "M40.7 34.7 A16.3 16.3 0 1 0 21.4 60.8",
  // right loop, ending in the heart's point, and the bar inside it
  "M51.5 54.6 A19 19 0 1 1 75.3 61.2",
  "M57.5 40.8 L78 56.5",
  // the w
  "M25 65.8 L46.7 84 L53.3 62.5 L60.8 82.5 L71.7 68.3",
];

/** Draw the mark on a 2D canvas, centred at (cx, cy); r is the radius of the disc it sits on. */
export function drawMarkCanvas(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  g.save();
  g.translate(cx, cy);
  g.scale(r / 50, r / 50);
  g.translate(-50, -50);
  g.strokeStyle = color;
  g.lineWidth = MARK_STROKE;
  g.lineCap = "butt";
  g.lineJoin = "round";
  for (const d of MARK_PATHS) g.stroke(new Path2D(d));
  g.restore();
}

/** The round yellow logo for the UI. */
export function LogoBadge({ size = 36, disc = true }: { size?: number; disc?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-label="The New Church" role="img">
      {disc && <circle cx="50" cy="50" r="50" fill="#f4c21a" />}
      {MARK_PATHS.map((d) => (
        <path key={d} d={d} fill="none" stroke={disc ? "#1a1a1a" : "#f4c21a"} strokeWidth={MARK_STROKE} strokeLinejoin="round" />
      ))}
    </svg>
  );
}
