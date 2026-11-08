import type { Registration } from "./store";

// Friday's breakout sessions, on this side: who the attendant stops. What they've answered is only
// ever on the sheet (/api/breakout), asked for afresh on every visit.

/**
 * Holds a torch (registered) and comes onsite on Friday: the pass says which days ("Fri 11 Dec",
 * "Fri · Sat"…). A torch from before the days were kept on the phone is asked about on the server.
 */
export const breakoutEligible = (r: Registration | null) => !!r?.ticket && !r.online && (!r.days || /\bFri\b/.test(r.days));

/**
 * Answers used to be kept on this browser too ("torch:breakout:<ticket>"), which stopped the usher
 * asking again after the row was cleared on the sheet. The sheet is the only record now: those old
 * keys are cleared.
 */
export function forgetOldBreakoutAnswers() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith("torch:breakout:")) localStorage.removeItem(k);
    }
  } catch {
    /* storage unavailable: nothing kept there either */
  }
}

export type BreakoutState = {
  eligible: boolean;
  answered: "yes" | "no" | null;
  booked: { session: string; number: number | null; sessionNumber: number | null } | null;
  sessions: { id: string; cap: number; taken: number }[];
};

/** Asks /api/breakout; throws with the server's message when it says no. */
export async function breakoutCall(ticket: string, action: "status" | "no" | "join", session?: string): Promise<BreakoutState> {
  const res = await fetch("/api/breakout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket, action, session }) });
  const data = await res.json().catch(() => ({ ok: false, error: "Something went wrong" }));
  if (!data.ok) throw new Error(data.error ?? "Something went wrong");
  return data;
}
