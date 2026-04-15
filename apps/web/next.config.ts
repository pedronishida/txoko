import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@txoko/shared'],
  images: {
    unoptimized: true,
  },
}

export default nextConfig
