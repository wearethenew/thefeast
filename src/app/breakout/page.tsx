import type { Metadata } from "next";
import Client from "./Client";

export const metadata: Metadata = {
  title: "Breakout sessions · The Feast 2026",
  description: "Register for a breakout session on Saturday 12 December at The Feast 2026: The Torch, The Fusion Centre, Ogba.",
};

export default function Page() {
  return <Client />;
}
