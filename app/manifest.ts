import type { MetadataRoute } from "next";

/** Section 11 / Phase 5: installable PWA. Icons come from scripts/generate-icons.mjs. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "KeepTrack — returns & warranties",
    short_name: "KeepTrack",
    description: "Never miss a return window or lose warranty proof.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#14665a",
    categories: ["productivity", "shopping"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Orders on the way",
        url: "/dashboard?tab=orders",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Add a purchase",
        url: "/add",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Needs review",
        url: "/dashboard?tab=review",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
