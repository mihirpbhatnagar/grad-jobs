import type { MetadataRoute } from "next";

// Lets the site be added to a phone's home screen and open full-screen like an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Grad Jobs",
    short_name: "Grad Jobs",
    description: "UK graduate roles starting in 2027",
    start_url: "/my-jobs",
    display: "standalone",
    background_color: "#f6f5f2",
    theme_color: "#f6f5f2",
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png" },
      { src: "/icon/512", sizes: "512x512", type: "image/png" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
