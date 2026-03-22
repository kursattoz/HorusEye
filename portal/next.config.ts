import path from "path";
import type { NextConfig } from "next";
import withSerwist from "@serwist/next";

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  reactCompiler: true,
  // react-pdf and pdfjs-dist are ESM-only; transpile so Turbopack bundles them.
  transpilePackages: ['react-pdf', 'pdfjs-dist'],
  // Acknowledge Turbopack usage — serwist webpack config only applies to production builds.
  turbopack: {},
  // Fix: @serwist/next webpack plugin resolves from the monorepo workspace root,
  // but node_modules live in portal/. Tell webpack's resolver to look here first.
  webpack: (config) => {
    config.resolve ??= {};
    config.resolve.modules = [
      path.join(__dirname, "node_modules"),
      ...(Array.isArray(config.resolve.modules) ? config.resolve.modules : ["node_modules"]),
    ];
    return config;
  },
};

export default withSerwist({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
})(nextConfig);
