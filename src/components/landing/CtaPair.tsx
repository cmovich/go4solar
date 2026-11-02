import Link from 'next/link'

/**
 * Part G: the two ways in, side by side (they wrap neatly on small phones): "Calculate my load"
 * (orange; start here) and "Get started" (the builder, for people who know their load).
 */
export function CtaPair({ onDark = false, place }: { onDark?: boolean; place: string }) {
  return (
    <div className="flex flex-wrap gap-3" data-testid={`cta-${place}`}>
      <Link
        href="/calculate"
        className="bg-brand-orange hover:bg-brand-orange/90 focus-visible:ring-brand-gold text-brand-dark inline-flex min-h-14 min-w-[min(100%,15rem)] flex-1 flex-col items-center justify-center rounded-lg px-6 py-2 text-lg font-semibold shadow-lg shadow-black/20 transition-colors [text-shadow:none] focus-visible:ring-2 focus-visible:outline-none sm:flex-none"
      >
        Calculate my load
        <span className="text-brand-dark/80 text-xs font-medium">Start from here</span>
      </Link>
      <Link
        href="/build"
        className={`inline-flex min-h-14 min-w-[min(100%,15rem)] flex-1 flex-col items-center justify-center rounded-lg border-2 px-6 py-2 text-lg font-semibold transition-colors [text-shadow:none] focus-visible:ring-2 focus-visible:outline-none sm:flex-none ${
          onDark
            ? 'focus-visible:ring-brand-gold border-white bg-white/10 text-white hover:bg-white/20'
            : 'border-brand-green text-brand-dark hover:bg-brand-mist focus-visible:ring-brand-green bg-white'
        }`}
      >
        Get started
        <span
          className={`text-xs font-medium ${onDark ? 'text-white/85' : 'text-muted-foreground'}`}
        >
          Click here if you know your load already
        </span>
      </Link>
    </div>
  )
}

/** A light band with the two buttons (mid-page and at the bottom of the home page). */
export function CtaBand({ place, title }: { place: string; title: string }) {
  return (
    <section className="bg-brand-mist">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <h2 className="text-brand-dark text-2xl font-bold tracking-tight">{title}</h2>
        <div className="mt-5">
          <CtaPair place={place} />
        </div>
      </div>
    </section>
  )
}
