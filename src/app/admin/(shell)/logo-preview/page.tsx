import type { Metadata } from 'next'
import Image from 'next/image'

import { BrandLogo } from '@/components/brand/BrandLogo'
import { HERO_SLIDES } from '@/config/heroSlides'
import { requireStaffWithMfa } from '@/lib/auth/roles'

export const metadata: Metadata = { title: 'Logo preview' }
export const dynamic = 'force-dynamic'

function Panel({
  label,
  className,
  children,
}: {
  label: string
  className: string
  children: React.ReactNode
}) {
  return (
    <figure className="overflow-hidden rounded-xl border">
      <div className={`relative flex h-48 items-center justify-center p-6 ${className}`}>
        {children}
      </div>
      <figcaption className="text-muted-foreground border-t bg-white px-3 py-2 text-xs">
        {label}
      </figcaption>
    </figure>
  )
}

/** Staff only: the new logos on every background they will sit on, beside the current one. */
export default async function LogoPreviewPage() {
  await requireStaffWithMfa()
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-brand-dark text-3xl font-bold">Logo preview</h1>
      <p className="text-muted-foreground mt-1 mb-6 text-sm">
        New logo (transparent background) and its white version for dark green, compared with the
        current logo. The site uses the white version wherever the logo sits on dark green.
      </p>

      <h2 className="text-brand-dark mb-3 text-lg font-semibold">New logo</h2>
      <div className="grid gap-4 sm:grid-cols-3" data-testid="logo-new">
        <Panel label="Colour logo on white (sign-in, forms, admin header)" className="bg-white">
          <BrandLogo className="h-28 w-auto" />
        </Panel>
        <Panel label="Colour logo on dark green (for comparison)" className="bg-brand-dark">
          <BrandLogo className="h-28 w-auto" />
        </Panel>
        <Panel
          label="White logo on dark green (headers, footer, admin menu)"
          className="bg-brand-dark"
        >
          <BrandLogo onDark className="h-28 w-auto" />
        </Panel>
      </div>

      <h2 className="text-brand-dark mt-8 mb-3 text-lg font-semibold">
        White logo on the hero photos
      </h2>
      <div className="grid gap-4 sm:grid-cols-2" data-testid="logo-hero">
        {HERO_SLIDES.map((s, i) => (
          <Panel
            key={s.desktop}
            label={`Hero photo ${i + 1} with the dark-green overlay`}
            className=""
          >
            <Image src={s.desktop} alt="" fill sizes="50vw" className="object-cover" />
            <div className="from-brand-dark/95 via-brand-dark/85 to-brand-dark/70 absolute inset-0 bg-gradient-to-r" />
            <div className="relative">
              <BrandLogo onDark className="h-24 w-auto" />
            </div>
          </Panel>
        ))}
      </div>

      <h2 className="text-brand-dark mt-8 mb-3 text-lg font-semibold">
        Current logo (kept until you approve)
      </h2>
      <div className="grid gap-4 sm:grid-cols-2" data-testid="logo-old">
        <Panel label="go4solar-logo-old.png on white" className="bg-white">
          <Image
            src="/brand/go4solar-logo-old.png"
            alt="Current logo"
            width={690}
            height={524}
            className="h-28 w-auto"
          />
        </Panel>
        <Panel
          label="go4solar-logo-old.png on dark green, on its white plate (as today)"
          className="bg-brand-dark"
        >
          <span className="inline-flex rounded-lg bg-white px-4 py-2">
            <Image
              src="/brand/go4solar-logo-old.png"
              alt="Current logo"
              width={690}
              height={524}
              className="h-20 w-auto"
            />
          </span>
        </Panel>
      </div>
    </main>
  )
}
