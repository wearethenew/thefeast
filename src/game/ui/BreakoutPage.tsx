"use client";

import { useState } from "react";
import { useGame } from "../store";
import { BreakoutPanel } from "./BreakoutPanel";
import { PageFrame } from "./PageFrame";
import { Shell, field, label } from "./Shell";

/** "TF26-ABCD-EFGH" from however it was typed, or null when it isn't a ticket ID. */
const readTicket = (v: string) => {
  const m = v.toUpperCase().replace(/[^A-Z0-9]/g, "").match(/^TF26([A-Z0-9]{4})([A-Z0-9]{4})$/);
  return m ? `TF26-${m[1]}-${m[2]}` : null;
};

/**
 * thefeast.wearethenew.org/breakout: register for a Saturday breakout session without walking into
 * the hall. Your ticket ID (on your pass) says who you are; the torch on this browser, if there is
 * one, fills it in. Who can book is checked on the server, as in the hall.
 */
export default function BreakoutPage() {
  const saved = useGame((s) => s.registered);
  const [typed, setTyped] = useState(saved?.ticket ?? "");
  const [ticket, setTicket] = useState<string | null>(saved?.ticket ?? null);
  const [err, setErr] = useState("");
  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const t = readTicket(typed);
    if (!t) return setErr("That doesn't look like a ticket ID: it's on your pass, like TF26-ABCD-EFGH");
    setErr("");
    setTicket(t);
  };
  return (
    <PageFrame>
      {ticket ? (
        <div className="w-full max-w-2xl">
          <BreakoutPanel
            key={ticket}
            ticket={ticket}
            firstName={ticket === saved?.ticket ? saved.firstName : ""}
            onClose={() => setTicket(null)}
            doneLabel="Done"
          />
          <button className="mx-auto mt-3 block text-[13px] text-white/70 underline-offset-4 hover:text-white hover:underline" onClick={() => setTicket(null)}>
            Use a different ticket ID
          </button>
        </div>
      ) : (
        <Shell kicker="Saturday 12 Dec · Breakout sessions" title="Register for a breakout session" onClose={() => (window.location.href = "/")}>
          <form onSubmit={go} className="space-y-3">
            <p className="text-white/80">
              Breakout sessions are for everyone joining us onsite on Saturday, 12 December. Enter the ticket ID on your pass (it&apos;s in your registration email) to pick
              your session.
            </p>
            <div>
              <label className={label}>Ticket ID</label>
              <input
                className={`${field} font-bold uppercase tracking-wider`}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="TF26-ABCD-EFGH"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                required
              />
            </div>
            {err && <div className="text-[13px] text-red-300">{err}</div>}
            <button className="btn-gold w-full py-3.5 text-[15px]">See the sessions →</button>
          </form>
        </Shell>
      )}
    </PageFrame>
  );
}
