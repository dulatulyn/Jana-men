import type { NextConfig } from "next";

const AI_URL = process.env.AI_URL || "http://localhost:8001";

const nextConfig: NextConfig = {
  output: "standalone",
  devIndicators: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return [{ source: "/ai/:path*", destination: `${AI_URL}/:path*` }];
  },
};

export default nextConfig;
