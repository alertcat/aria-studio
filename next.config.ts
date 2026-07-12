import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // STATIC_EXPORT=1 builds the read-only hosted showcase (out/)
  output: process.env.STATIC_EXPORT === "1" ? "export" : undefined,
  images: { unoptimized: true },
};

export default nextConfig;
