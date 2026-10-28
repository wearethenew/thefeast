import { save } from "@/server/storage";
import { bad, clean } from "@/server/validate";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const text = clean(body?.text, 2000);
  if (text.length < 5) return bad("Please write a little more");
  await save("testimonies", { name: clean(body.name, 80), text, published: false });
  return Response.json({ ok: true });
}
