import Image from 'next/image'
import Link from 'next/link'

import { Footer } from '@/components/landing/Footer'
import { siteConfig } from '@/config/site'

/** Shared layout for /privacy and /terms; `draft` shows the notice above the footer. */
export function LegalPage({
  title,
  updated,
  draft,
  children,
}: {
  title: string
  updated: string
  /** True until Go4Solar's lawyer has approved the text (/privacy approved 15 October 2026). */
  draft: boolean
  children: React.ReactNode
}) {
  return (
    <>
      <header className="bg-brand-dark">
        <div className="mx-auto flex max-w-3xl items-center px-4 py-3 sm:px-6">
          <Link
            href="/"
            aria-label={`${siteConfig.name} home`}
            className="inline-flex rounded-md bg-white px-3 py-1.5"
          >
            <Image
              src="/brand/go4solar-logo.png"
              alt={siteConfig.name}
              width={150}
              height={48}
              className="h-9 w-auto"
            />
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-brand-dark text-3xl font-bold">{title}</h1>
        <p className="text-muted-foreground mt-1 text-sm">Last updated {updated}</p>
        <div className="prose-legal mt-6 space-y-4 text-[15px] leading-relaxed">{children}</div>
      </main>
      {draft && (
        <div
          className="bg-amber-100 px-4 py-3 text-center text-sm font-semibold text-amber-900"
          data-testid="legal-draft"
        >
          DRAFT – pending legal review
        </div>
      )}
      <Footer />
    </>
  )
}

export function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-brand-dark pt-4 text-xl font-bold">{children}</h2>
}
