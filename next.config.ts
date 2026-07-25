import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: [
      '@phosphor-icons/react',
      'date-fns',
      'recharts',
    ],
  },
};

export default nextConfig;
