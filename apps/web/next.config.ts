import type { NextConfig } from "next";

const config: NextConfig = {
  // il container copia solo .next/standalone (vedi Dockerfile)
  output: "standalone",
  // @fleetcare/db esporta sorgente TypeScript
  transpilePackages: ["@fleetcare/db"],
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  async headers() {
    // HSTS lo mette Traefik
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default config;
