import type { NextConfig } from 'next'

import { deploySecretProblems } from './src/lib/config/secrets'
import { PDF_ASSETS_GLOB, PDFKIT_STANDARD_FONTS_GLOB } from './src/lib/pdf/assets'
import { securityHeaders } from './src/lib/security/headers'

// On Vercel (preview / production) the build stops if a secret that hashes personal data is
// missing, too short or a local test value. Local builds and tests are not affected.
const secretProblems = deploySecretProblems(process.env)
if (secretProblems.length) {
  throw new Error(
    `Missing or unsafe secrets for this Vercel ${process.env.VERCEL_ENV} build: ${secretProblems.join('; ')}. ` +
      'Add them in Vercel → Settings → Environment Variables, then redeploy.',
  )
}

const nextConfig: NextConfig = {
  // Live-mode e2e builds into .next-live so it never clobbers the normal build.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // KYC uploads (ID photos, statements, certificates) go through server actions: allow 10 MB.
  experimental: { serverActions: { bodySizeLimit: '10mb' } },
  // Never ship source maps to browsers.
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  // Read from disk at run time by the PDF code, but not found by Vercel's file tracing:
  // our fonts and logo, and pdfkit's built-in fonts (see src/lib/pdf/assets.ts).
  outputFileTracingIncludes: { '/**/*': [PDF_ASSETS_GLOB, PDFKIT_STANDARD_FONTS_GLOB] },
  async headers() {
    return securityHeaders({
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://*.supabase.co',
      dev: process.env.NODE_ENV !== 'production',
    })
  },
}

export default nextConfig
