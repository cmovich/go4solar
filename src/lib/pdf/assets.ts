import path from 'node:path'

/**
 * Fonts (Inter, with the ₦ glyph) and logo for server-rendered PDFs, read from disk at run time.
 * next.config.ts lists this folder in outputFileTracingIncludes so every server function ships it.
 */
export const PDF_ASSETS_GLOB = './src/lib/pdf/assets/**/*'

/**
 * pdfkit (inside @react-pdf/renderer) loads its built-in fonts through a "#standard-fonts/*"
 * package import whenever it starts a document, even though our PDFs use Inter. Vercel's file
 * tracing does not follow that import, so the files were missing on Vercel and signing failed
 * with "Cannot find module .../pdfkit/js/standard-fonts/Helvetica.cjs" (Fix-up 1 #2/#3).
 */
export const PDFKIT_STANDARD_FONTS_GLOB = './node_modules/pdfkit/js/standard-fonts/**/*'

const dir = path.join(process.cwd(), 'src', 'lib', 'pdf', 'assets')

export const pdfAssets = {
  interRegular: path.join(dir, 'Inter-Regular.ttf'),
  interBold: path.join(dir, 'Inter-Bold.ttf'),
  logo: path.join(dir, 'go4solar-logo.png'),
}
