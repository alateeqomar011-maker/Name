import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native / WASM server dependencies must not be bundled.
  serverExternalPackages: ["@electric-sql/pglite", "onnxruntime-node", "sharp"],
  poweredByHeader: false,
  turbopack: { root: path.join(__dirname) },
  output: "standalone",
  experimental: {
    // Product photos can be large; the route handlers enforce their own limits.
    serverActions: { bodySizeLimit: "25mb" },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
