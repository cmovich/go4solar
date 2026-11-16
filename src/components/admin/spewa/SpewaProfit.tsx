import { formatNaira, formatPercent } from '@/lib/money'
import type { OfferProfit } from '@/lib/spewa/offer'

/**
 * Staff only (application page, Quote tab): a SPEWA offer file's profit. Partner price to SPEWA,
 * installation and logistics (at cost), the bad-debt provision on the financed amount, the
 * profit and its split. Never shown to customers or to the funder approver.
 */
export function SpewaProfit({
  p,
  badDebtShare,
  go4solarShare,
}: {
  p: OfferProfit
  badDebtShare: number
  go4solarShare: number
}) {
  const rows: [string, string][] = [
    ['Selling price of SPEWA equipment', formatNaira(p.sellingPrice)],
    ['Partner price (paid to SPEWA)', formatNaira(p.partnerPrice)],
    ['Equipment margin', formatNaira(p.equipmentMargin)],
    ['Accessories (our pricing)', formatNaira(p.accessoriesPrice)],
    ['Accessories margin', formatNaira(p.accessoriesMargin)],
    ['Installation and logistics (at cost)', formatNaira(p.installation)],
    ['Amount financed', formatNaira(p.financed)],
    ['Financing charge (in the total)', formatNaira(p.financingCharge)],
    [`Bad-debt provision (${formatPercent(badDebtShare, 1)} of financed)`, `− ${formatNaira(p.badDebt)}`],
  ]
  return (
    <section className="space-y-2 rounded-xl border p-3" data-testid="spewa-profit">
      <h3 className="text-brand-dark font-semibold">SPEWA offer: profit (staff only)</h3>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-right tabular-nums">{v}</dd>
          </div>
        ))}
        <dt className="text-brand-dark font-semibold">Profit</dt>
        <dd className="text-brand-dark text-right font-semibold tabular-nums" data-testid="spewa-profit-total">
          {formatNaira(p.profit)}
        </dd>
        <dt className="text-muted-foreground">Go4Solar ({formatPercent(go4solarShare)})</dt>
        <dd className="text-right tabular-nums" data-testid="spewa-profit-go4solar">
          {formatNaira(p.go4solar)}
        </dd>
        <dt className="text-muted-foreground">SPEWA ({formatPercent(1 - go4solarShare)})</dt>
        <dd className="text-right tabular-nums" data-testid="spewa-profit-spewa">
          {formatNaira(p.spewa)}
        </dd>
      </dl>
    </section>
  )
}
