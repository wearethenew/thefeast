import { MERCH, naira } from "@/game/data/merch";
import { save } from "@/server/storage";
import { bad, clean, isEmail } from "@/server/validate";

// Merch pre-order from the Merch booth.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return bad("Invalid request");
  const name = clean(body.name, 80);
  const email = clean(body.email, 120).toLowerCase();
  const phone = clean(body.phone, 40);
  const item = MERCH.find((m) => m.id === body.item);
  const size = clean(body.size, 20);
  const quantity = Math.max(1, Math.min(20, Math.floor(Number(body.quantity) || 1)));
  if (name.length < 2) return bad("Please add your name");
  if (!isEmail(email)) return bad("Please add a valid email");
  if (!item) return bad("Pick an item");
  if (!item.sizes.includes(size)) return bad("Pick a size");
  const design = item.designs ? (item.designs.find((d) => d === body.design) ?? item.designs[0]) : null;
  const color = item.colors.find((c) => c.name === body.color)?.name ?? item.colors[0].name;
  await save("merch", { name, email, phone, item: item.name, size, quantity, total: naira(item.price * quantity), notes: clean(body.notes, 300) || null, color, design });
  return Response.json({ ok: true });
}
