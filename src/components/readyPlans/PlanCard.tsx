import { Sun } from 'lucide-react'
import Link from 'next/link'

import { formatNaira } from '@/lib/money'
import type { ReadyPlanOffer } from '@/lib/readyPlans/server'

/** Small pills: the system voltage (always) and the plan's own tag. */
export function PlanTags({ voltage, tag }: { voltage: number; tag: string | null }) {
  return (
    <p className="flex flex-wrap gap-1.5">
      <span className="bg-brand-dark rounded-full px-2.5 py-0.5 text-xs font-semibold text-white">
        {voltage} V system
      </span>
      {tag && (
        <span className="bg-brand-orange text-brand-dark rounded-full px-2.5 py-0.5 text-xs font-semibold">
          {tag}
        </span>
      )}
    </p>
  )
}

/**
 * One ready-made plan on the home page (card in the carousel / grid). `relative`: the link's
 * screen-reader text is positioned inside the card, so cards off to the side of the swipeable
 * row never widen the page.
 */
export function PlanCard({ offer, imageUrl }: { offer: ReadyPlanOffer; imageUrl: string | null }) {
  const p = offer.plan
  return (
    <article
      className="relative flex h-full w-[85vw] max-w-sm shrink-0 snap-start flex-col overflow-hidden rounded-2xl border bg-white shadow-sm sm:w-auto sm:max-w-none"
      data-testid={`ready-plan-${p.slug}`}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          className="aspect-[3/2] w-full object-cover"
          width={600}
          height={400}
        />
      ) : (
        <div className="bg-brand-mist flex aspect-[3/2] items-center justify-center">
          <Sun className="text-brand-orange size-12" aria-hidden />
        </div>
      )}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <PlanTags voltage={p.systemVoltage} tag={p.tag} />
        <h3 className="text-brand-dark text-xl font-bold">{p.name}</h3>
        <p className="text-muted-foreground text-sm">{p.summary}</p>
        {offer.card ? (
          <div className="mt-1 tabular-nums" data-testid="card-price">
            <p className="text-brand-dark text-lg font-bold">
              Deposit {formatNaira(offer.card.deposit)}
            </p>
            <p className="text-sm">
              then {formatNaira(offer.card.monthly)}/month for {offer.card.months} months
            </p>
          </div>
        ) : (
          <p className="text-sm" data-testid="card-price-later">
            Your exact price will be confirmed when we contact you.
          </p>
        )}
        {p.backup[0] && <p className="text-muted-foreground text-sm">Backup: {p.backup[0]}</p>}
        <Link
          href={`/plans/${p.slug}`}
          className="text-brand-blue mt-auto inline-flex min-h-11 items-center font-semibold underline"
        >
          See details<span className="sr-only"> of {p.name}</span>
        </Link>
      </div>
    </article>
  )
}
