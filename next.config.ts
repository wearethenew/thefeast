import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // NEXT_DIST_DIR lets a production build sit beside a running dev server (e.g. ".next-prod")
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // no Next.js "N" badge in the corner while developing (it never shows on the live site anyway)
  devIndicators: false,
};

export default nextConfig;
