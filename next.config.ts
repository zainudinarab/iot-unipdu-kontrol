import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['firebase-admin'],
  transpilePackages: ['jwks-rsa', 'jose'],
};

export default nextConfig;
