import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // SPA estatica — deploy em Cloudflare Pages sem server
  output: 'export',
  transpilePackages: ['@txoko/shared'],
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
}

export default nextConfig
