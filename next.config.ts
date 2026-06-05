import type { NextConfig } from "next";

// Static export so this can deploy free to GitHub Pages (no server needed —
// it's a client-side localStorage app). For a PROJECT page served from
// https://<user>.github.io/<repo>, set NEXT_PUBLIC_BASE_PATH=/<repo> in CI.
// For a USER/ORG site (https://<name>.github.io root) or Vercel, leave it unset.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
  env: {
    // Stamped when the config is evaluated, i.e. when `npm run build` starts
    // (within seconds of the artifacts in this ~45s CI build — good enough to
    // tell deploys apart). Rendered as a footer stamp so a glance at the live
    // page settles every "is it deployed or is it my cache?" debate.
    NEXT_PUBLIC_BUILD_STAMP: new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC",
  },
};

export default nextConfig;
