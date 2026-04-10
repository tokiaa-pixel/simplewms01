import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // 型エラーがあってもビルドを止めない（Vercel CI での意図しない失敗を防ぐ）
  typescript: {
    ignoreBuildErrors: false,
  },
  // ESLint エラーがあってもビルドを止めない
  eslint: {
    ignoreDuringBuilds: false,
  },
}

export default nextConfig
