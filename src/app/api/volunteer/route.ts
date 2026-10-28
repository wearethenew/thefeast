import { save } from "@/server/storage";
import { bad, clean } from "@/server/validate";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return bad("Invalid request");
  const teams = Array.isArray(body.teams) ? body.teams.map((t: unknown) => clean(t, 60)).filter(Boolean).slice(0, 10) : [];
  if (!teams.length) return bad("Pick at least one team");
  await save("volunteers", { name: clean(body.name, 80), contact: clean(body.contact, 120) || null, teams });
  return Response.json({ ok: true });
}
