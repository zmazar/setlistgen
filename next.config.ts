import type { NextConfig } from "next";

// Note: this machine blocks Next's native SWC binary (Windows Application Control),
// so Turbopack is unavailable and the npm scripts run Next with `--webpack`.
const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
