import "server-only";

export const clean = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

export function bad(message: string, status = 400) {
  return Response.json({ ok: false, error: message }, { status });
}
