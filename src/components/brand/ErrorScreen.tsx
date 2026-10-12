import Image from 'next/image'
import Link from 'next/link'

import { siteConfig } from '@/config/site'

/** Brand-style full page for 404 / errors. Never shows technical details. */
export function ErrorScreen({
  code,
  title,
  body,
  action,
}: {
  code: string
  title: string
  body: string
  action?: React.ReactNode
}) {
  return (
    <main className="bg-brand-dark flex min-h-screen flex-col items-center justify-center px-4 py-16 text-center text-white">
      <span className="inline-flex rounded-md bg-white px-3 py-1.5">
        <Image
          src="/brand/go4solar-logo.png"
          alt={siteConfig.name}
          width={150}
          height={48}
          className="h-9 w-auto"
        />
      </span>
      <p className="text-brand-gold mt-10 text-sm font-bold tracking-widest">{code}</p>
      <h1 className="mt-2 text-3xl font-bold">{title}</h1>
      <p className="mt-3 max-w-md text-white/80">{body}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {action}
        <Link
          href="/"
          className="bg-brand-gold text-brand-dark rounded-lg px-6 py-3 font-semibold focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
        >
          Go to the home page
        </Link>
      </div>
      <p className="mt-10 text-sm text-white/70">
        Need help? {siteConfig.email} · {siteConfig.phones[0]}
      </p>
    </main>
  )
}
