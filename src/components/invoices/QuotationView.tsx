import { rcLabel } from '@/lib/company/schema'
import type { InvoiceData } from '@/lib/invoices/build'
import { invoiceDay } from '@/lib/invoices/dates'
import { formatNaira, formatPercent } from '@/lib/money'

/**
 * The quotation (or invoice) on the page, laid out like the PDF: company, customer, items with
 * rack, installation and delivery as separate lines, totals, deposit, monthly and notes.
 */
export function QuotationView({ d }: { d: InvoiceData }) {
  const c = d.company
  const rc = rcLabel(c.rcNumber)
  const label = d.kind === 'quotation' ? 'Quotation' : 'Invoice'
  return (
    <article className="overflow-hidden rounded-2xl border bg-white" data-testid="quotation">
      <header className="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-6">
        <div className="text-sm">
          <p className="text-brand-dark font-bold">{c.name}</p>
          <p className="text-muted-foreground">{c.address}</p>
          <p className="text-muted-foreground">
            {c.phone} · {c.email}
          </p>
          <p className="text-muted-foreground">{c.website}</p>
          {rc && <p className="text-muted-foreground">{rc}</p>}
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{label} ref.</dt>
          <dd className="font-semibold" data-testid="quotation-ref">
            {d.number}
          </dd>
          <dt className="text-muted-foreground">Date</dt>
          <dd className="font-semibold">{invoiceDay(d.issuedAt)}</dd>
          <dt className="text-muted-foreground">Valid until</dt>
          <dd className="font-semibold">{invoiceDay(d.validUntil)}</dd>
          <dt className="text-muted-foreground">For</dt>
          <dd className="font-semibold">{d.title}</dd>
        </dl>
      </header>
      <div className="bg-brand-dark flex items-center justify-between px-4 py-3 text-white sm:px-6">
        <p className="text-lg font-bold">{label}</p>
        <p className="text-brand-gold text-sm font-bold">{d.number}</p>
      </div>
      <div className="space-y-5 p-4 sm:p-6">
        <section className="text-sm">
          <p className="text-brand-green text-xs font-bold tracking-wider">BILL TO</p>
          <p className="font-semibold">{d.customer.name}</p>
          {d.customer.businessName && <p>{d.customer.businessName}</p>}
          <p className="text-muted-foreground">
            {[d.customer.phone, d.customer.email, d.customer.place].filter(Boolean).join(' · ')}
          </p>
        </section>

        <table className="w-full text-sm" data-testid="quotation-lines">
          <thead>
            <tr className="bg-brand-green text-left text-white">
              <th className="px-2 py-2 font-semibold">Item</th>
              <th className="hidden px-2 py-2 font-semibold sm:table-cell">Size / spec</th>
              <th className="px-2 py-2 text-right font-semibold">Qty</th>
              {!d.fixed && <th className="px-2 py-2 text-right font-semibold">Price</th>}
            </tr>
          </thead>
          <tbody>
            {d.lines.map((l, i) => (
              <tr key={i} className="border-b align-top" data-kind={l.kind}>
                <td className="px-2 py-2">
                  {l.item}
                  {l.spec && (
                    <span className="text-muted-foreground block text-xs sm:hidden">{l.spec}</span>
                  )}
                </td>
                <td className="text-muted-foreground hidden px-2 py-2 sm:table-cell">{l.spec}</td>
                <td className="px-2 py-2 text-right whitespace-nowrap">{l.qty}</td>
                {!d.fixed && (
                  <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums">
                    {l.hideAmount ? '' : formatNaira(l.amount)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        <section className="bg-brand-mist space-y-1 rounded-xl p-4 text-sm sm:ml-auto sm:w-80">
          <p className="flex justify-between gap-3">
            <span className="font-semibold">Total amount payable</span>
            <strong className="text-brand-green text-lg" data-testid="quotation-total">
              {formatNaira(d.totals.total)}
            </strong>
          </p>
          <p className="flex justify-between gap-3">
            <span>Deposit ({formatPercent(d.totals.depositShare)})</span>
            <strong>{formatNaira(d.totals.deposit)}</strong>
          </p>
          {d.fixed?.extra && (
            <p className="flex justify-between gap-3" data-testid="quotation-extra-delivery">
              <span>Delivery to {d.fixed.extra.state} (extra, paid with the deposit)</span>
              <strong>{formatNaira(d.fixed.extra.amount)}</strong>
            </p>
          )}
          <p className="flex justify-between gap-3">
            <span>Monthly payment</span>
            <strong>
              {formatNaira(d.totals.monthly)} × {d.totals.months} months
            </strong>
          </p>
          {d.fixed && (
            <p className="flex justify-between gap-3" data-testid="quotation-full-payment">
              <span>Or pay in full ({formatPercent(d.fixed.fullDiscount, 0)} off)</span>
              <strong>{formatNaira(d.fixed.fullPayment)}</strong>
            </p>
          )}
          <p className="text-muted-foreground pt-1 text-xs">
            {d.fixed
              ? 'One fixed price. No hidden charges. '
              : '0% interest: the total above is everything you pay. '}
            Late payments attract 0.75% of the overdue amount per day.
          </p>
        </section>

        <section>
          <p className="text-brand-green text-xs font-bold tracking-wider">NOTES</p>
          <ul
            className="text-muted-foreground mt-1 list-disc space-y-1 pl-5 text-sm"
            data-testid="quotation-notes"
          >
            {d.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
      </div>
    </article>
  )
}
