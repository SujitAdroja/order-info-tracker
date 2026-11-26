import type { MetadataRoute } from "next";

/** Section 11 / Phase 5: installable PWA. Icons come from scripts/generate-icons.mjs. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "KeepTrack — orders & returns",
    short_name: "KeepTrack",
    description: "Track your orders and never miss a return window.",
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
    // Android: shows KeepTrack in the share sheet for screenshots, photos,
    // PDFs and text. public/sw.js answers the POST (see the share spec).
    // Installed apps pick this up only after the PWA updates or is reinstalled.
    share_target: {
      action: "/share-target",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        title: "title",
        text: "text",
        url: "url",
        files: [
          {
            name: "files",
            accept: [
              "image/png",
              "image/jpeg",
              "image/webp",
              "image/heic",
              "image/heif",
              "application/pdf",
            ],
          },
        ],
      },
    },
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
