import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import nextConfig from '../../../next.config'
import { PDF_ASSETS_GLOB, PDFKIT_STANDARD_FONTS_GLOB, pdfAssets } from './assets'

const PDF_MODULES = ['AgreementPdf.tsx', 'WaitlistReport.tsx', 'ForecastPdf.tsx']

/**
 * Fix-up 1 (#2, #3): signing failed with a 500 on Vercel ("Cannot find module
 * .../pdfkit/js/standard-fonts/Helvetica.cjs"). pdfkit loads its built-in fonts through a
 * "#standard-fonts/*" package import, which Vercel's file tracing does not follow, so those files
 * were left out of the server function. next.config.ts must list them (and our own PDF assets).
 */
describe('PDF assets are packaged with the server functions', () => {
  it('every PDF module loads its fonts and logo from the PDF assets folder, never public/', () => {
    for (const file of PDF_MODULES) {
      const source = readFileSync(path.join(__dirname, file), 'utf8')
      expect(source, file).not.toMatch(/['"]public['"]|public\//)
      expect(source, file).toContain('pdfAssets')
    }
  })

  it('the asset files exist', () => {
    for (const p of Object.values(pdfAssets)) expect(existsSync(p), p).toBe(true)
  })

  it('next.config lists the PDF assets folder for every route', () => {
    const includes = nextConfig.outputFileTracingIncludes ?? {}
    expect(includes['/**/*']).toContain(PDF_ASSETS_GLOB)
    for (const p of Object.values(pdfAssets)) {
      expect(
        path
          .relative(process.cwd(), p)
          .startsWith(PDF_ASSETS_GLOB.replace('./', '').replace('/**/*', '')),
      ).toBe(true)
    }
  })

  it("next.config ships pdfkit's built-in fonts with every route (they are loaded at run time)", () => {
    const includes = nextConfig.outputFileTracingIncludes ?? {}
    expect(includes['/**/*']).toContain(PDFKIT_STANDARD_FONTS_GLOB)
    const helvetica = path.join(
      process.cwd(),
      'node_modules/pdfkit/js/standard-fonts/Helvetica.cjs',
    )
    expect(existsSync(helvetica)).toBe(true)
    expect(PDFKIT_STANDARD_FONTS_GLOB).toBe('./node_modules/pdfkit/js/standard-fonts/**/*')
  })
})

describe('PDF logo', () => {
  it('is the current colour logo (the same file the website uses), not the old one', async () => {
    const pdfLogo = readFileSync('src/lib/pdf/assets/go4solar-logo.png')
    expect(pdfLogo.equals(readFileSync('public/brand/go4solar-logo.png'))).toBe(true)
    expect(pdfLogo.equals(readFileSync('public/brand/go4solar-logo-old.png'))).toBe(false)
  })
})
