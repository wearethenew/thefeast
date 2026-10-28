"use client";

import { useEffect, useRef } from "react";
import { billboardUnmuted, markAutoplayed, pauseIfHidden, setSongPlayer, songHeld, songVolume, type YTPlayer } from "../billboardAudio";
import { ACCELERATE } from "../data/media";

type YTNamespace = { Player: new (el: HTMLElement, opts: Record<string, unknown>) => unknown };
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let api: Promise<YTNamespace> | null = null;
function loadApi() {
  api ??= new Promise((resolve) => {
    if (window.YT?.Player) return resolve(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT!);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  });
  return api;
}

/**
 * The soundtrack, "I Accelerate", the whole song on loop: an unseen player (the picture is on the
 * road billboard, which has the pause and sound buttons). It tries to start with sound; where the
 * browser insists on a tap first, it plays muted until the first tap.
 */
export function SongPlayer() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true;
    loadApi().then((YT) => {
      if (!alive || !host.current) return;
      new YT.Player(host.current, {
        videoId: ACCELERATE,
        width: 144,
        height: 81,
        host: "https://www.youtube-nocookie.com",
        // no autoplay: it starts below, once its volume is set
        playerVars: { autoplay: 0, start: 60, loop: 1, playlist: ACCELERATE, playsinline: 1, controls: 0, rel: 0, modestbranding: 1, disablekb: 1, cc_load_policy: 0, iv_load_policy: 3 },
        events: {
          onReady: (e: { target: YTPlayer }) => {
            const p = e.target;
            // the background level (5%) before a single note plays: never loud, then turned down
            p.setVolume(songVolume());
            setSongPlayer(p);
            p.unMute();
            if (songHeld()) return;
            p.playVideo();
            pauseIfHidden(p);
            // if the browser refused sound, fall back to muted playback until the first tap
            setTimeout(() => {
              // they've already tapped for sound (on phones, "Tap to begin"): keep it on and playing
              if (billboardUnmuted()) {
                p.unMute();
                if (!songHeld()) p.playVideo();
              } else if (p.getPlayerState() === 1 && !p.isMuted()) markAutoplayed();
              else {
                p.mute();
                p.playVideo();
              }
              pauseIfHidden(p);
            }, 1500);
          },
        },
      });
    });
    return () => {
      alive = false;
      setSongPlayer(null);
    };
  }, []);
  // (unseen, but on the page: a player moved off-screen is frozen by the browser and ignores its
  // pause and volume)
  return (
    <div aria-hidden className="pointer-events-none fixed bottom-0 left-0 -z-10 h-[81px] w-[144px] overflow-hidden opacity-[0.01]">
      <div ref={host} />
    </div>
  );
}
