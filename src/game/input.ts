// Shared player input: keyboard plus on-screen touch controls write here, game loops read it.

export const input = {
  up: false,
  down: false,
  left: false,
  right: false,
  action: false,
  /** analog stick from touch, -1..1 (x right, y forward) */
  stickX: 0,
  stickY: 0,
};

const KEYS: Record<string, keyof typeof input> = {
  KeyW: "up",
  ArrowUp: "up",
  KeyS: "down",
  ArrowDown: "down",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  KeyE: "action",
  Space: "action",
  Enter: "action",
};

let bound = false;
export function bindKeyboard() {
  if (bound || typeof window === "undefined") return;
  bound = true;
  const set = (e: KeyboardEvent, v: boolean) => {
    const k = KEYS[e.code];
    if (!k) return;
    if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
    (input as Record<string, boolean | number>)[k] = v;
    if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
  };
  window.addEventListener("keydown", (e) => set(e, true));
  window.addEventListener("keyup", (e) => set(e, false));
  window.addEventListener("blur", () => Object.assign(input, { up: false, down: false, left: false, right: false, action: false }));
}

/** Combined axes: x = steer/strafe (-1 left … 1 right), y = throttle/forward (-1 … 1). */
export function axes() {
  const x = (input.right ? 1 : 0) - (input.left ? 1 : 0) + input.stickX;
  const y = (input.up ? 1 : 0) - (input.down ? 1 : 0) + input.stickY;
  return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
}
