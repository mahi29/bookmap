import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Confirm-then-commit echoes up to 1000 parsed rows back through a Server Action.
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
