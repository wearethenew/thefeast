import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// The New's type (see The-New-App/brand.md): Manrope for text and UI, a bold serif for headings
// (DM Serif Display, the free stand-in for Larken), Geist Mono for eyebrows and labels
// The font files live in ./fonts (Google's own, Latin, from Fontsource; SIL Open Font License), so a
// build never has to reach Google Fonts: fetching them there made deploys fail now and then.
const manrope = localFont({ variable: "--font-display", src: "./fonts/manrope-latin-wght-normal.woff2", weight: "200 800", fallback: ["Arial", "sans-serif"] });
const serif = localFont({ variable: "--font-head", src: "./fonts/dm-serif-display-latin-400-normal.woff2", weight: "400", fallback: ["Georgia", "serif"] });
const mono = localFont({ variable: "--font-label", src: "./fonts/geist-mono-latin-wght-normal.woff2", weight: "100 900", fallback: ["ui-monospace", "monospace"] });
const allura = localFont({ variable: "--font-script", src: "./fonts/allura-latin-400-normal.woff2", weight: "400", fallback: ["cursive"] });

export const metadata: Metadata = {
  title: "The Feast 2026 · The Torch",
  description: "Light your torch and make the journey to The Feast 2026 at The Fusion Centre, Ogba, Lagos. 11–13 December 2026.",
};

export const viewport: Viewport = { themeColor: "#000000", width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${manrope.variable} ${serif.variable} ${mono.variable} ${allura.variable} antialiased`}>{children}</body>
    </html>
  );
}
