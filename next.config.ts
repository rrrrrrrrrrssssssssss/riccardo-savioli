import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Photos and videos uploaded from the admin get a new, unique file name each time, so browsers
  // and Vercel's CDN can keep them for a year instead of checking back on every visit.
  async headers() {
    return [
      {
        source: "/projects/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
