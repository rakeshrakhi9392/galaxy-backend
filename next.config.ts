import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@galaxy/schemas"],
  serverExternalPackages: ["ffmpeg-static", "ffprobe-static"],
  turbopack: {
    // Avoid monorepo/root inference issues when multiple lockfiles exist on the machine.
    root: __dirname,
  },
};

export default nextConfig;
