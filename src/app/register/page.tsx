import type { Metadata } from "next";
import Client from "./Client";

export const metadata: Metadata = {
  title: "Register · The Feast 2026",
  description: "Register for The Feast 2026: The Torch, 11–13 December at The Fusion Centre, Ogba, Lagos, and get your check-in pass.",
};

export default function Page() {
  return <Client />;
}
