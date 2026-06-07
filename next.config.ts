import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";
import { withWorkflow } from "workflow/next";

const bundleAnalyzer = withBundleAnalyzer({
  enabled: process.env["ANALYZE"] === "true",
});

const nextConfig: NextConfig = {
  cacheComponents: true,
  reactCompiler: true,
  experimental: {
    inlineCss: true,
    optimizePackageImports: [
      "lucide-react",
      "@base-ui/react",
      "@dnd-kit/core",
      "@dnd-kit/sortable",
      "@dnd-kit/utilities",
    ],
  },
  images: {
    formats: ["image/avif", "image/webp"],
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

  async headers() {
    // script-src includes the two Vercel Insights origins that are proxied via
    // rewrites() — cdn.vercel-insights.com (speed insights + events script)
    // and vitals.vercel-insights.com (telemetry endpoint).
    // Shipped as Report-Only so we can observe violations before enforcing.
    const csp = [
      "script-src 'self' https://cdn.vercel-insights.com https://vitals.vercel-insights.com",
      "frame-ancestors 'none'",
    ].join("; ");

    const securityHeaders = [
      {
        key: "Content-Security-Policy-Report-Only",
        value: csp,
      },
      {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      },
      {
        key: "X-Content-Type-Options",
        value: "nosniff",
      },
      {
        key: "Referrer-Policy",
        value: "strict-origin-when-cross-origin",
      },
    ];

    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default withWorkflow(bundleAnalyzer(nextConfig));
