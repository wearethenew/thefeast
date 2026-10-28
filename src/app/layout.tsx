import type { Metadata, Viewport } from "next";
import { Allura, DM_Serif_Display, Geist_Mono, Manrope } from "next/font/google";
import "./globals.css";

// The New's type (see The-New-App/brand.md): Manrope for text and UI, a bold serif for headings
// (DM Serif Display, the free stand-in for Larken), Geist Mono for eyebrows and labels
const manrope = Manrope({ variable: "--font-display", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });
const serif = DM_Serif_Display({ variable: "--font-head", subsets: ["latin"], weight: "400" });
const mono = Geist_Mono({ variable: "--font-label", subsets: ["latin"], weight: ["400", "500", "600"] });
const allura = Allura({ variable: "--font-script", subsets: ["latin"], weight: "400" });

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
