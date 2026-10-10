import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Live-mode e2e builds into .next-live so it never clobbers the normal build.
  distDir: process.env.NEXT_DIST_DIR || '.next',
}

export default nextConfig
