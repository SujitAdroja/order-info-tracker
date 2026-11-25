import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets Playwright run its own dev server next to `npm run dev` (one per dist dir).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
