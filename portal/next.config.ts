import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // react-pdf and pdfjs-dist are ESM-only; transpile so Turbopack bundles them.
  transpilePackages: ['react-pdf', 'pdfjs-dist'],
};

export default nextConfig;
