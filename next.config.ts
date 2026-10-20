import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output is what Azure App Service runs (`node server.js`). See docs/DEPLOYMENT.md.
  output: "standalone",
  // Cache Components are intentionally off (ADR-003): every page is authenticated and
  // tenant-specific, so nothing may be prerendered into a shared static shell.
  cacheComponents: false,
  // Do not advertise the framework in response headers.
  poweredByHeader: false,
  experimental: {
    // Workaround for a Next.js 16.4 Turbopack dev regression: after a `next dev` restart
    // with a warm dev filesystem cache, the first HMR message is `restart`, which leaves a
    // stale hmrVersion and makes the dev server send a perpetual `reloadPage` ("HMR hash
    // mismatch"), so the page reloads many times a second and never settles. Disabling the
    // dev FS cache stops the loop. Dev-only: production `next build` (standalone) is not
    // affected and uses turbopackFileSystemCacheForBuild. Remove once the upstream fix lands.
    // See vercel/next.js issues #100251 and #100267.
    turbopackFileSystemCacheForDev: false,
  },
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
