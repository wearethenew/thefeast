"use client";

import { useEffect, useState } from "react";
import { BREAKOUTS, breakoutName, breakoutTitle } from "../data/breakouts";
import { breakoutCall, type BreakoutState } from "../breakout";
import { useGame } from "../store";
import { Shell } from "./Shell";

// ---------- Breakout sessions (Saturday, in the Main Hall) ----------

/**
 * The breakout sessions board the hall's attendant opens: each session, what it's about and how
 * full it is; pick one and you have a numbered place (and an email to say so).
 */
export function BreakoutPanel({ onClose, ticket: given, firstName: givenName, doneLabel = "Back to the hall →" }: { onClose: () => void; ticket?: string; firstName?: string; doneLabel?: string }) {
  // in the hall: your torch's ticket; on the /breakout page: the one you entered
  const mine = useGame((s) => s.registered?.ticket ?? "");
  const myName = useGame((s) => s.registered?.firstName ?? "");
  const ticket = given ?? mine;
  const firstName = givenName ?? (given ? "" : myName);
  const [state, setState] = useState<BreakoutState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let live = true;
    breakoutCall(ticket, "status")
      .then((r) => live && setState(r))
      .catch((x) => live && setErr((x as Error).message));
    return () => {
      live = false;
    };
  }, [ticket]);
  const join = async (id: string) => {
    setBusy(id);
    setErr("");
    try {
      const r = await breakoutCall(ticket, "join", id);
      setState(r);
    } catch (x) {
      setErr((x as Error).message);
      // the places may have moved on: show them as they are now
      breakoutCall(ticket, "status").then(setState).catch(() => {});
    } finally {
      setBusy(null);
    }
  };
  const booked = state?.booked ? BREAKOUTS.find((b) => b.id === state.booked!.session) : null;
  return (
    <Shell kicker="Saturday 12 Dec · Breakout sessions" title={booked ? "You're in! 🔥" : "Pick your breakout session"} onClose={onClose} wide>
      {!state ? (
        <p className="text-white/70">{err || "Getting the sessions…"}</p>
      ) : !state.eligible ? (
        <p>Breakout sessions are for everyone joining us onsite on Saturday, 12 December.</p>
      ) : booked ? (
        <div>
          <p>
            {firstName ? `${firstName}, your` : "Your"} registration for <b>{breakoutTitle(booked)}</b> break-out session at The Feast 2026 is confirmed! Your confirmation is on its way to
            your email.
          </p>
          {/* your number in your session (the overall breakout number stays on the sheet) */}
          <div className="mt-4 rounded bg-gold px-4 py-3 text-center text-black">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em]">Your number in {booked.name}</div>
            <div className="text-2xl font-black">No. {state.booked!.sessionNumber ?? "–"}</div>
          </div>
          <button className="btn-gold mt-4 w-full py-3 text-[14px]" onClick={onClose}>
            {doneLabel}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-white/80">Choose the session you&apos;ll join on Saturday. Places are limited: each session shows how full it is.</p>
          {BREAKOUTS.map((b) => {
            const s = state.sessions.find((x) => x.id === b.id);
            const taken = s?.taken ?? 0;
            const full = taken >= b.cap;
            const pct = Math.min(100, Math.round((taken / b.cap) * 100));
            return (
              <div key={b.id} className="rounded-xl border border-white/15 bg-white/[0.04] p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-lg font-black leading-tight">{breakoutName(b)}</div>
                  {b.tag !== b.name && <div className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-gold">{b.tag}</div>}
                </div>
                <p className="mt-1.5 text-[13px] leading-snug text-white/75">{b.about}</p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${b.name}: ${pct}% full`}>
                  <div className={`h-full rounded-full ${full ? "bg-red-400" : "bg-gold"}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-3">
                  <span className="text-[12px] text-white/65">
                    {full ? "Full" : `${pct}% full`}
                  </span>
                  <button className="btn-gold px-4 py-2 text-[12px] disabled:cursor-not-allowed disabled:opacity-40" disabled={full || !!busy} onClick={() => join(b.id)}>
                    {full ? "Full" : busy === b.id ? "Saving…" : "Choose"}
                  </button>
                </div>
              </div>
            );
          })}
          {err && <div className="text-xs text-red-300">{err}</div>}
        </div>
      )}
    </Shell>
  );
}
