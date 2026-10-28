import { WEND_ANSWERS } from "@/game/data/wend";
import { save } from "@/server/storage";
import { bad, clean, isEmail } from "@/server/validate";

// WEND results. Every finished game is logged; winners who claim a prize go to the Winners tab.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return bad("Invalid request");
  const answer = clean(body.answer, 30).toUpperCase();
  if (!WEND_ANSWERS.some((a) => a.word === answer)) return bad("Unknown game");
  const guesses = Math.max(1, Math.min(6, Math.floor(Number(body.guesses) || 6)));
  const won = !!body.won;
  if (body.claim) {
    if (!won) return bad("Only winners can claim");
    const name = clean(body.name, 80);
    const email = clean(body.email, 120).toLowerCase();
    if (name.length < 2) return bad("Please add your name");
    if (!isEmail(email)) return bad("Please add a valid email");
    await save("winners", { game: "WEND", answer, guesses, name, email, phone: clean(body.phone, 40) || null });
    return Response.json({ ok: true });
  }
  await save("games", { game: "WEND", answer, guesses, won, seconds: Math.max(0, Math.floor(Number(body.seconds) || 0)) });
  return Response.json({ ok: true });
}
