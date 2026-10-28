"use client";

import { useSyncExternalStore } from "react";

// Phones (portrait or landscape): below Tailwind's sm width, or too short for a board in the scene.
const QUERY = "(max-width: 639px), (max-height: 500px)";

const subscribe = (fn: () => void) => {
  const m = window.matchMedia(QUERY);
  m.addEventListener("change", fn);
  return () => m.removeEventListener("change", fn);
};

/** True on phone-sized screens. */
export function useSmallScreen() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
}

/** The same, outside React (e.g. in a frame loop). */
export const isSmallScreen = () => typeof window !== "undefined" && window.matchMedia(QUERY).matches;

// Touch screens (phones, tablets): no keyboard to press E on, so prompts say tap instead.
const TOUCH = "(pointer: coarse)";
const onTouchChange = (fn: () => void) => {
  const m = window.matchMedia(TOUCH);
  m.addEventListener("change", fn);
  return () => m.removeEventListener("change", fn);
};
/** True when the main pointer is a finger. */
export function useTouch() {
  return useSyncExternalStore(onTouchChange, () => window.matchMedia(TOUCH).matches, () => false);
}
