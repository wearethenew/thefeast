// Sound without audio files: everything is synthesised with Web Audio (music, engine, horns,
// city hum) and the danfo conductor speaks through the browser's speech synthesis.
// Browsers only allow audio after a user gesture, so `unlock()` is called from the first click.

type Engine = { osc: OscillatorNode; osc2: OscillatorNode; filter: BiquadFilterNode; gain: GainNode };

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicGain: GainNode | null = null;
let sfxGain: GainNode | null = null;
let engine: Engine | null = null;
let city: GainNode | null = null;
let musicTimer: ReturnType<typeof setInterval> | null = null;

export const audioState = { music: true, sound: true, unlocked: false };

export function unlock() {
  if (typeof window === "undefined") return;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = audioState.music ? 0.22 : 0;
    musicGain.connect(master);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = audioState.sound ? 0.6 : 0;
    sfxGain.connect(master);
  }
  if (ctx.state === "suspended") ctx.resume();
  audioState.unlocked = true;
  startMusic();
}

export function setMusic(on: boolean) {
  audioState.music = on;
  if (musicGain && ctx) musicGain.gain.setTargetAtTime(on ? 0.22 : 0, ctx.currentTime, 0.4);
}

export function setSound(on: boolean) {
  audioState.sound = on;
  if (sfxGain && ctx) sfxGain.gain.setTargetAtTime(on ? 0.6 : 0, ctx.currentTime, 0.2);
  if (!on && typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
}

// ---------- music: a warm worship-pad progression with a gentle arpeggio ----------

const CHORDS = [
  [62, 66, 69, 74], // D
  [59, 62, 66, 71], // Bm
  [55, 59, 62, 67], // G
  [57, 61, 64, 69], // A
];
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

function pad(freq: number, t: number, dur: number) {
  if (!ctx || !musicGain) return;
  const o1 = ctx.createOscillator();
  const o2 = ctx.createOscillator();
  o1.type = "sawtooth";
  o2.type = "triangle";
  o1.frequency.value = freq;
  o2.frequency.value = freq * 1.003;
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 900;
  f.Q.value = 0.4;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.05, t + 1.2);
  g.gain.linearRampToValueAtTime(0.04, t + dur - 1);
  g.gain.linearRampToValueAtTime(0, t + dur + 0.6);
  o1.connect(f);
  o2.connect(f);
  f.connect(g);
  g.connect(musicGain);
  o1.start(t);
  o2.start(t);
  o1.stop(t + dur + 0.8);
  o2.stop(t + dur + 0.8);
}

function pluck(freq: number, t: number) {
  if (!ctx || !musicGain) return;
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.06, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0008, t + 1.4);
  o.connect(g);
  g.connect(musicGain);
  o.start(t);
  o.stop(t + 1.5);
}

function startMusic() {
  if (!ctx || musicTimer) return;
  let bar = 0;
  const BAR = 4; // seconds per chord
  const schedule = () => {
    if (!ctx) return;
    const t = ctx.currentTime + 0.1;
    const chord = CHORDS[bar % CHORDS.length];
    chord.forEach((n) => pad(midi(n - 12), t, BAR));
    // arpeggio: eighth notes up the chord
    for (let i = 0; i < 8; i++) pluck(midi(chord[i % 4] + (i >= 4 ? 12 : 0)), t + i * (BAR / 8));
    bar++;
  };
  schedule();
  musicTimer = setInterval(schedule, 4000);
}

// ---------- road sounds ----------

export function setEngine(speed: number, on: boolean) {
  if (!ctx || !sfxGain) return;
  if (!engine && on) {
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc.type = "sawtooth";
    osc2.type = "square";
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 300;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(sfxGain);
    osc.start();
    osc2.start();
    engine = { osc, osc2, filter, gain };
    // city hum: filtered noise
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 500;
    bp.Q.value = 0.6;
    city = ctx.createGain();
    city.gain.value = 0.05;
    src.connect(bp);
    bp.connect(city);
    city.connect(sfxGain);
    src.start();
  }
  if (!engine) return;
  const t = ctx.currentTime;
  const rpm = 38 + Math.abs(speed) * 3.2 - Math.floor(Math.abs(speed) / 9) * 18; // crude gear changes
  engine.osc.frequency.setTargetAtTime(rpm, t, 0.1);
  engine.osc2.frequency.setTargetAtTime(rpm * 0.5, t, 0.1);
  engine.filter.frequency.setTargetAtTime(220 + Math.abs(speed) * 30, t, 0.1);
  engine.gain.gain.setTargetAtTime(on ? 0.16 + Math.min(0.12, Math.abs(speed) * 0.005) : 0, t, 0.2);
  if (city) city.gain.setTargetAtTime(on ? 0.05 : 0, t, 0.5);
}

/** Danfo horn: a two-tone blast. */
export function horn(long = false) {
  if (!ctx || !sfxGain) return;
  const t = ctx.currentTime;
  const dur = long ? 0.9 : 0.35;
  for (const f of [392, 494]) {
    const o = ctx.createOscillator();
    o.type = "square";
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.07, t + 0.02);
    g.gain.setValueAtTime(0.07, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.05);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1800;
    o.connect(lp);
    lp.connect(g);
    g.connect(sfxGain);
    o.start(t);
    o.stop(t + dur + 0.1);
  }
}

/** A thud for knocks and potholes. */
export function thump(strength = 1) {
  if (!ctx || !sfxGain) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(110, t);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.4 * strength, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  o.connect(g);
  g.connect(sfxGain);
  o.start(t);
  o.stop(t + 0.35);
}

/** The conductor shouting, via the browser's voice (en-NG if the device has one). */
export function say(text: string) {
  if (!audioState.sound || typeof speechSynthesis === "undefined") return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voices = speechSynthesis.getVoices();
  u.voice = voices.find((v) => v.lang === "en-NG") ?? voices.find((v) => /en-(GB|ZA|KE|IN)/.test(v.lang)) ?? null;
  u.rate = 1.15;
  u.pitch = 0.9;
  u.volume = 1;
  speechSynthesis.speak(u);
}
