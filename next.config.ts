import type { NextConfig } from "next";

// React needs eval in development only, to rebuild server error stacks in the browser
const isDev = process.env.NODE_ENV === "development";

// Everything the pages load comes from the app itself: the fonts are built into the image, no
// outside scripts, images or frames. No nonces: inline scripts and styles are allowed, so the
// pages stay prerendered. No upgrade-insecure-requests: HSTS keeps HTTPS, and it would get in
// the way of the local server on http://127.0.0.1.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

// Set by the app, not by nginx. Browsers ignore HSTS over plain HTTP, so local runs are not affected.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  // For browsers that do not know frame-ancestors
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Only features Chrome knows: an unknown one is an error in the browser console
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

const nextConfig: NextConfig = {
  /* config options here */
  // Self-contained server in .next/standalone for the Docker image
  output: "standalone",
  // The app does not name its software
  poweredByHeader: false,
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
