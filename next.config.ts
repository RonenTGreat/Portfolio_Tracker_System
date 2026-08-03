import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Typed hrefs across the app. Graduated out of `experimental` in Next 16.
  typedRoutes: true,
};

export default nextConfig;
