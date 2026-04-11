import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@txoko/shared'],
  output: 'export',
  images: {
    unoptimized: true,
  },
}

export default nextConfig
