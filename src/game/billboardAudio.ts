// "I Accelerate" is the soundtrack from the moment the site opens, played by a YouTube player
// (see ui/SongPlayer; its controls are on the road billboard, world/RoadScreen). Browsers only allow sound after a tap, so it starts muted and the first
// tap or key turns it up; the volume steps down as you walk into the compound and the hall.

export type YTPlayer = { unMute(): void; mute(): void; isMuted(): boolean; setVolume(v: number): void; playVideo(): void; pauseVideo(): void; getPlayerState(): number };

let player: YTPlayer | null = null;
/** Background music: the song sits right under everything else (5%). */
export const SONG_VOLUME = 5;
let volume = SONG_VOLUME;
let unmuted = false;
/** Paused from the billboard's controls (not by switching tabs). */
let paused = false;
/** Held while you're inside the Main Hall (the LED wall has the floor): back on when you come out. */
let quiet = false;
/** Is the song (and the billboard's picture) stopped right now, for either reason? */
export const songHeld = () => paused || quiet;
const listeners = new Set<() => void>();

// the song only plays while the tab is in view: paused when you switch away, back on when you return
let pausedByTab = false;
if (typeof document !== "undefined")
  document.addEventListener("visibilitychange", () => {
    if (!player) return;
    if (document.hidden) {
      // playing or buffering
      if ([1, 3].includes(player.getPlayerState())) {
        player.pauseVideo();
        pausedByTab = true;
      }
    } else if (pausedByTab && !songHeld()) {
      pausedByTab = false;
      player.playVideo();
    }
  });

/** Opened in a background tab: hold the song until the tab is shown. */
export function pauseIfHidden(p: YTPlayer) {
  if (!document.hidden) return;
  p.pauseVideo();
  pausedByTab = true;
}

export function setSongPlayer(p: YTPlayer | null) {
  player = p;
  if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") (window as unknown as { __song?: YTPlayer | null }).__song = p;
  if (p && unmuted) unmuteBillboard();
}

export function unmuteBillboard() {
  unmuted = true;
  if (player) {
    // the level first, so it never comes in loud
    player.setVolume(volume);
    player.unMute();
    if (!songHeld()) player.playVideo();
  }
  listeners.forEach((l) => l());
}

/** 0–100. */
export function setBillboardVolume(v: number) {
  if (v === volume) return;
  volume = v;
  if (player && unmuted) player.setVolume(v);
}

export const billboardUnmuted = () => unmuted;
/** The song's current level (0–100). */
export const songVolume = () => volume;

export const songPaused = () => paused;

/** Inside the Main Hall: the song and the billboard's video stop; out again, they carry on. */
export function setSongQuiet(q: boolean) {
  if (q === quiet) return;
  quiet = q;
  if (quiet) player?.pauseVideo();
  else if (!paused) player?.playVideo();
  listeners.forEach((l) => l());
}

/** The play / pause button on the billboard: the song and the billboard's picture together. */
export function togglePlay() {
  paused = !paused;
  if (songHeld()) player?.pauseVideo();
  else player?.playVideo();
  listeners.forEach((l) => l());
}

/** The speaker button on the billboard. */
export function toggleSong() {
  if (!unmuted) return unmuteBillboard();
  unmuted = false;
  player?.mute();
  listeners.forEach((l) => l());
}

/** Autoplay with sound worked (the browser allowed it without a tap). */
export function markAutoplayed() {
  unmuted = true;
  player?.setVolume(volume);
  listeners.forEach((l) => l());
}
export function onSongChange(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
