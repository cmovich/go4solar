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

export const metadata: Metadata = {
  title: {
    default: `${siteConfig.name} — Solar on a monthly payment plan`,
    template: `%s · ${siteConfig.name}`,
  },
  description:
    'Go4Solar imports solar systems directly from the manufacturers so Nigerian homes and small businesses can pay from a 20% deposit and spread the rest over monthly payments.',
  metadataBase: new URL(siteConfig.url),
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
