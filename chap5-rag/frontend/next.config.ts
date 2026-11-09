import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  devIndicators: false,
  redirects: async () => [
    { source: "/", destination: "/app/chat", permanent: false },
    { source: "/app", destination: "/app/chat", permanent: false },
  ],
};

export default nextConfig;
