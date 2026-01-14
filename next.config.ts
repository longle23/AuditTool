import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Tăng timeout cho API routes (file lớn cần nhiều thời gian)
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
  },
};

export default nextConfig;
