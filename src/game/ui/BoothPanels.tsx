"use client";

import { useMemo, useState } from "react";
import { BoardContext, Shell, label, post } from "./Shell";
import { MerchPanel } from "./MerchPanel";
import { RegisterPanel } from "./RegisterPanel";
import { BreakoutPanel } from "./BreakoutPanel";
import { WEND_ANSWERS, WEND_TRIES } from "../data/wend";
import { useGame } from "../store";
import { TentPanel } from "./VenueUI";
import { TorchFirst, useDraft, whoIs } from "./torchFirst";

// The panels the booth buttons open: Get your Torch (registration), Merch pre-order, the WEND
// game, and the help desks. One layer for the opening film and for walking the compound.

// the card frame and these panels live in their own files (the /register, /breakout and /merch pages use them
// without the rest of the game); re-exported for the world's boards and the hall
export { BoardContext, BreakoutPanel };

/** A product shot on a soft studio backdrop. */
// ---------- WEND ----------

/** The letters of a word in a new order (never the word itself). */
function scramble(word: string, seed: number) {
  const out = [...word];
  let k = seed;
  for (let tries = 0; tries < 20; tries++) {
    for (let i = out.length - 1; i > 0; i--) {
      k = (k * 16807) % 2147483647;
      const j = k % (i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    if (out.join("") !== word) break;
  }
  return out;
}

const WHEEL = 260;
/** Hints show at most this many letters, and never the first or the last. */
const MAX_HINTS = 2;

/** Which letters the hints show, in order: inner letters only, spread across the word. */
function hintOrder(word: string, seed: number) {
  const inner = Array.from({ length: Math.max(0, word.length - 2) }, (_, i) => i + 1);
  return scramble(inner.map((i) => String.fromCharCode(65 + i)).join(""), seed)
    .map((c) => c.charCodeAt(0) - 65)
    .slice(0, MAX_HINTS);
}

function WendPanel({ onClose }: { onClose: () => void }) {
  const [round, setRound] = useState(0);
  const [seed, setSeed] = useState(() => 1 + Math.floor(Math.random() * 100000));
  const target = WEND_ANSWERS[round];
  const answer = target.word;
  const letters = useMemo(() => scramble(answer, seed + round * 977), [answer, seed, round]);
  const [path, setPath] = useState<number[]>([]);
  const [dragging, setDragging] = useState(false);
  const [solved, setSolved] = useDraft<number[]>("wend:solved", []);
  const [tries, setTries] = useState(0);
  const [hints, setHints] = useState(0);
  const [shake, setShake] = useState(false);
  const [started, setStarted] = useState(() => Date.now());
  const registered = useGame((s) => s.registered);
  const [needTorch, setNeedTorch] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const claim = whoIs();
  const [err, setErr] = useState("");
  const done = solved.includes(round);
  const won = solved.length === WEND_ANSWERS.length;
  const word = path.map((i) => letters[i]).join("");
  // which letters the hints show is fixed per year (shuffling the wheel never shows new ones)
  const [hintSeed] = useState(() => 1 + Math.floor(Math.random() * 100000));
  const hinted = useMemo(() => hintOrder(answer, hintSeed + round * 31).slice(0, hints), [answer, hintSeed, round, hints]);

  const r = WHEEL / 2 - 34;
  const spot = (i: number) => {
    const a = (i / letters.length) * Math.PI * 2 - Math.PI / 2;
    return [WHEEL / 2 + Math.cos(a) * r, WHEEL / 2 + Math.sin(a) * r];
  };
  /** The letter under the pointer (works on the 3D booth board too: the browser does the hit test). */
  const under = (e: React.PointerEvent) => {
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-li]") as HTMLElement | null;
    return el ? Number(el.dataset.li) : -1;
  };
  const down = (e: React.PointerEvent) => {
    if (done) return;
    const i = under(e);
    if (i < 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
    setPath([i]);
    setErr("");
  };
  const move = (e: React.PointerEvent) => {
    if (!dragging) return;
    const i = under(e);
    if (i < 0) return;
    // back over the previous letter undoes the last step
    if (path.length > 1 && i === path[path.length - 2]) setPath(path.slice(0, -1));
    else if (!path.includes(i)) setPath([...path, i]);
  };
  const up = () => {
    if (!dragging) return;
    setDragging(false);
    if (path.length < 2) return setPath([]);
    const n = tries + 1;
    setTries(n);
    if (word === answer) {
      setSolved([...solved, round]);
      post("/api/game", { answer, guesses: Math.min(n, WEND_TRIES), won: true, seconds: (Date.now() - started) / 1000 }).catch(() => {});
    } else {
      setShake(true);
      setTimeout(() => setShake(false), 450);
      setErr(word.length < answer.length ? `Keep going: it's ${answer.length} letters` : "Not quite, try again");
      setTimeout(() => setPath([]), 450);
    }
  };
  /** Play a given year (the year picker), or the next one not yet solved. */
  const pick = (to: number) => {
    setRound(to);
    setPath([]);
    setTries(0);
    setHints(0);
    setErr("");
    setStarted(Date.now());
  };
  const next = () => {
    const left = WEND_ANSWERS.map((_, i) => (round + 1 + i) % WEND_ANSWERS.length).filter((i) => !solved.includes(i));
    pick(left[0] ?? 0);
  };

  return (
    <Shell kicker="WEND · The Feast 2026 word game" title={won ? "You know your Feasts! 🔥" : `The Feast ${target.year}: what was the theme?`} onClose={onClose} wide>
      {!won && (
        <>
          {/* pick the year to guess */}
          <div className="grid grid-cols-4 gap-1.5" role="tablist" aria-label="Pick a year">
            {WEND_ANSWERS.map((a, i) => (
              <button
                key={a.year}
                role="tab"
                aria-selected={i === round}
                className={`h-11 rounded-[2px] border font-[family-name:var(--font-label)] text-sm font-semibold transition ${
                  i === round ? "border-gold bg-gold text-black" : solved.includes(i) ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-200" : "border-white/20 bg-white/[0.06] text-white/85 hover:border-white/40"
                }`}
                onClick={() => i !== round && pick(i)}
              >
                {a.year}
                {solved.includes(i) && " ✓"}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[12px] text-white/70">
            Drag across the letters to connect them and spell the {target.year} theme. Every letter is used once. {solved.length} of {WEND_ANSWERS.length} years solved.
          </p>
          {/* the answer slots: your letters as you drag, the hints as faint guides */}
          <div className={`mt-3 flex justify-center gap-1 ${shake ? "animate-[shake_0.45s]" : ""}`}>
            {[...answer].map((ch, i) => {
              const shown = done ? ch : word[i] ?? "";
              const hint = !done && !shown && hinted.includes(i);
              return (
                <div
                  key={i}
                  className={`flex h-10 w-8 items-center justify-center rounded-md border text-lg font-black sm:w-9 ${
                    done ? "border-emerald-400 bg-emerald-500" : shown ? "border-gold bg-gold/20" : "border-white/25 bg-black/30"
                  }`}
                >
                  {shown || (hint ? <span className="text-white/35">{ch}</span> : "")}
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex justify-center">
            <div
              className="relative select-none"
              style={{ width: WHEEL, height: WHEEL, touchAction: "none" }}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
            >
              <div className="absolute inset-3 rounded-full border border-white/15 bg-white/5" />
              <svg className="pointer-events-none absolute inset-0" width={WHEEL} height={WHEEL}>
                {path.slice(1).map((p, k) => {
                  const [x1, y1] = spot(path[k]);
                  const [x2, y2] = spot(p);
                  return <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#f2b81f" strokeWidth="7" strokeLinecap="round" opacity="0.85" />;
                })}
              </svg>
              {letters.map((ch, i) => {
                const [x, y] = spot(i);
                const on = path.includes(i) || done;
                return (
                  <div
                    key={i}
                    data-li={i}
                    className={`absolute flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-xl font-black shadow-lg transition ${
                      on ? "scale-110 bg-gold text-black" : "bg-white text-black hover:scale-105"
                    }`}
                    style={{ left: x, top: y }}
                  >
                    {ch}
                  </div>
                );
              })}
            </div>
          </div>
          {err && <div className="mt-1 text-center text-xs text-amber-300">{err}</div>}
          <div className="mt-3 flex gap-2">
            {done ? (
              <>
                <div className="flex-1 self-center text-center font-bold">
                  🔥 {target.year}: {answer}!
                </div>
                <button className="btn-gold flex-1 py-2.5 text-xs" onClick={next}>
                  Next year →
                </button>
              </>
            ) : (
              <>
                <button className="btn-ghost flex-1 py-2.5 text-[11px]" onClick={() => setHints(Math.min(MAX_HINTS, hints + 1))} disabled={hints >= MAX_HINTS}>
                  💡 Hint: show a letter ({MAX_HINTS - hints} left)
                </button>
                <button className="btn-ghost flex-1 py-2.5 text-[11px]" onClick={() => setSeed(seed + 1)}>
                  🔀 Shuffle
                </button>
              </>
            )}
          </div>
        </>
      )}
      {won && (
        <div className="rounded-xl border border-white/10 bg-black/25 p-3">
          {claimed ? (
            <p>🏆 Prize claimed! We&apos;ll be in touch at {claim.email} to sort out your prize.</p>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setErr("");
                // a prize goes to a torch-bearer
                if (!registered) return setNeedTorch(true);
                try {
                  await post("/api/game", { answer, guesses: Math.min(tries, WEND_TRIES) || 1, won: true, claim: true, name: claim.name, email: claim.email, phone: claim.phone });
                  setClaimed(true);
                } catch (x) {
                  setErr((x as Error).message);
                }
              }}
            >
              <p className="font-bold">You connected every theme: {WEND_ANSWERS.map((a) => `${a.year} ${a.word}`).join(" · ")}. Claim your prize:</p>
              {registered && (
                <div className="mt-2 text-[13px] text-white/70">
                  Claiming as <b className="text-white">{claim.name}</b> · {claim.email}
                </div>
              )}
              {err && <div className="mt-1 text-xs text-red-300">{err}</div>}
              {needTorch && !registered ? (
                <div className="mt-2">
                  <TorchFirst what="claim your prize" back="game" />
                </div>
              ) : (
                <button className="btn-gold mt-2 w-full py-2.5 text-xs">Claim my prize</button>
              )}
            </form>
          )}
          <button
            className="btn-ghost mt-2 w-full py-2 text-[11px]"
            onClick={() => {
              setSolved([]);
              setClaimed(false);
              setSeed(seed + 7);
              next();
            }}
          >
            Play again
          </button>
        </div>
      )}
    </Shell>
  );
}

/** The open booth's panel (on its board in the world: see BoothBoards). */
export function BoothPanels({ id }: { id?: string } = {}) {
  const open = useGame((s) => s.panel);
  const panel = id ?? open;
  const set = useGame((s) => s.set);
  const close = () => set({ panel: null });
  if (!panel) return null;
  if (panel === "register") return <RegisterPanel onClose={close} />;
  if (panel === "merch") return <MerchPanel onClose={close} />;
  if (panel === "game") return <WendPanel onClose={close} />;
  return <TentPanel id={panel} onClose={close} />;
}
