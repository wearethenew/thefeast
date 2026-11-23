import type { Metadata } from "next";
import Client from "./Client";

export const metadata: Metadata = {
  title: "Merch · The Feast 2026",
  description: "Pre-order The Feast 2026: The Torch merch and pick it up at the Merch booth.",
};

export default function Page() {
  return <Client />;
}
