import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: siteConfig.name,
    short_name: siteConfig.name,
    description: siteConfig.description,
    lang: "it",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f4f0e8",
    theme_color: "#a8def3",
    icons: [
      { src: "/icons/app-192.png?v=2", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/app-512.png?v=2", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/app-maskable-512.png?v=2", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
