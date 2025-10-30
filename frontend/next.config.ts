import type { NextConfig } from "next";

// Enable static export and GitHub Pages compatibility.
// When running on GitHub Actions, serve under "/PrismWall" path.
const isCI = process.env.GITHUB_ACTIONS === "true";
const repo = "PrismWall";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  // Only set these when building in CI for GitHub Pages project site
  basePath: isCI ? `/${repo}` : "",
  assetPrefix: isCI ? `/${repo}/` : "",
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;


