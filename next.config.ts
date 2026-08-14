import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@cloudbase/node-sdk", "sharp"],
};

export default nextConfig;
