"use client";

import { useEffect, useState } from "react";

// Embedded YouTube players only play while the tab is in view: hidden, they pause; back in view,
// whatever we paused carries on (a video you paused yourself stays paused).

const ORIGIN = "https://www.youtube-nocookie.com";

/** A YouTube embed (src without the API parameters: they're added here) that pauses with the tab. */
export function YouTubeFrame({ src, ...rest }: React.IframeHTMLAttributes<HTMLIFrameElement> & { src: string }) {
  const ref = useTabPause();
  const api = `enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`;
  return <iframe ref={ref} src={`${src}${src.includes("?") ? "&" : "?"}${api}`} {...rest} />;
}

/** Ref for a YouTube embed iframe with the iframe API enabled. */
function useTabPause() {
  const [el, setEl] = useState<HTMLIFrameElement | null>(null);
  useEffect(() => {
    if (!el) return;
    // the player's state, from its own messages (-1 until it has told us: assume it autoplays)
    let state = -1;
    let pausedByUs = false;
    const post = (msg: object) => el.contentWindow?.postMessage(JSON.stringify(msg), ORIGIN);
    const listen = () => {
      post({ event: "listening", id: 1 });
      // loaded in a background tab: hold it until the tab is shown
      if (document.hidden) {
        post({ event: "command", func: "pauseVideo", args: [] });
        pausedByUs = true;
      }
    };
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== ORIGIN || e.source !== el.contentWindow || typeof e.data !== "string") return;
      try {
        const s = JSON.parse(e.data)?.info?.playerState;
        if (typeof s === "number") state = s;
      } catch {
        /* not a player message */
      }
    };
    const onVisibility = () => {
      if (document.hidden) {
        // playing, buffering or not reported yet
        if (state === 1 || state === 3 || state === -1) {
          post({ event: "command", func: "pauseVideo", args: [] });
          pausedByUs = true;
        }
      } else if (pausedByUs) {
        post({ event: "command", func: "playVideo", args: [] });
        pausedByUs = false;
      }
    };
    el.addEventListener("load", listen);
    window.addEventListener("message", onMessage);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      el.removeEventListener("load", listen);
      window.removeEventListener("message", onMessage);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [el]);
  return setEl;
}
