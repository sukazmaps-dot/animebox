import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.shikimori.one",
      },
      {
        protocol: "https",
        hostname: "**.shikimori.me",
      },
      {
        protocol: "https",
        hostname: "cdn.anilist.co",
      },
      {
        protocol: "https",
        hostname: "s1.anilist.co",
      },
      {
        protocol: "https",
        hostname: "s2.anilist.co",
      },
      {
        protocol: "https",
        hostname: "s3.anilist.co",
      },
      {
        protocol: "https",
        hostname: "s4.anilist.co",
      },
      {
        protocol: "https",
        hostname: "cdn.myanimelist.net",
      },
      {
        protocol: "https",
        hostname: "api.jikan.moe",
      },
      {
        protocol: "https",
        hostname: "**.jikan.moe",
      },
    ],
  },
};

export default nextConfig;
