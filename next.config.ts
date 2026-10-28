import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // NEXT_DIST_DIR lets a production build sit beside a running dev server (e.g. ".next-prod")
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
