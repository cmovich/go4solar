import type { NextConfig } from 'next'

import { securityHeaders } from './src/lib/security/headers'

const nextConfig: NextConfig = {
  // Live-mode e2e builds into .next-live so it never clobbers the normal build.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // KYC uploads (ID photos, statements, certificates) go through server actions: allow 10 MB.
  experimental: { serverActions: { bodySizeLimit: '10mb' } },
  // Never ship source maps to browsers.
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  async headers() {
    return securityHeaders({
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://*.supabase.co',
      dev: process.env.NODE_ENV !== 'production',
    })
  },
}

export default nextConfig
