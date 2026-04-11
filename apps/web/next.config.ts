import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@txoko/shared'],
  output: 'standalone',
}

export default nextConfig
