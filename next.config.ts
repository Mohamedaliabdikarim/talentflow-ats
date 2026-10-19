import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output is what Azure App Service runs (`node server.js`). See docs/DEPLOYMENT.md.
  output: "standalone",
  // Cache Components are intentionally off (ADR-003): every page is authenticated and
  // tenant-specific, so nothing may be prerendered into a shared static shell.
  cacheComponents: false,
  // Do not advertise the framework in response headers.
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
