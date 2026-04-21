import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";
import { withWorkflow } from "workflow/next";

const bundleAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  cacheComponents: true,
  reactCompiler: true,
  experimental: {
    inlineCss: true,
  },
  images: {
    minimumCacheTTL: 31536000,
    qualities: [65, 75, 80],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cards.scryfall.io",
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/insights/vitals.js",
        destination: "https://cdn.vercel-insights.com/v1/speed-insights/script.js",
      },
      {
        source: "/insights/events.js",
        destination: "https://cdn.vercel-insights.com/v1/script.js",
      },
      {
        source: "/hfi/events/:slug*",
        destination: "https://vitals.vercel-insights.com/v1/:slug*",
      },
      {
        source: "/hfi/vitals",
        destination: "https://vitals.vercel-insights.com/v2/vitals",
      },
    ];
  },
};

export default withWorkflow(bundleAnalyzer(nextConfig));
