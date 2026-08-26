import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@indago/contracts"],
  experimental: {},
};

export default nextConfig;
