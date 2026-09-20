import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  productionBrowserSourceMaps: false,
  turbopack: {},
  webpack(config) {
    if (process.env.PLAYWRIGHT_NO_CACHE) config.cache = false;
    return config;
  },
};

export default nextConfig;
