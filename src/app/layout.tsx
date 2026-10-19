import type { Metadata } from 'next'
import { Inter } from 'next/font/google'

import { CookieNotice } from '@/components/legal/CookieNotice'
import { siteConfig } from '@/config/site'

import './globals.css'

// latin-ext is required: the naira sign ₦ (U+20A6) lives there. Without it Windows Chrome
// falls back to a system font and draws a struck-through N. Inter is the only font we load.
const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-inter',
})

const TITLE = 'Go4Solar — Go 4 Solar, Pay Easy'
const DESCRIPTION =
  'Solar for homes and businesses across Nigeria, starting from a 20% deposit. Get your solar installed and pay the rest in monthly payments.'

export const metadata: Metadata = {
  title: {
    default: TITLE,
    template: `%s · ${siteConfig.name}`,
  },
  description: DESCRIPTION,
  metadataBase: new URL(siteConfig.url),
  // Share cards (WhatsApp, Facebook, X) cannot show the total payable, so they make no interest
  // claim (our rule: "no interest" only beside the total amount payable).
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    siteName: siteConfig.name,
    locale: 'en_NG',
    type: 'website',
  },
  twitter: { card: 'summary', title: TITLE, description: DESCRIPTION },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${inter.variable} font-sans`}>
      <body className="bg-background text-foreground min-h-screen antialiased">
        {children}
        <CookieNotice />
      </body>
    </html>
  )
}
