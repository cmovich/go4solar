import { storedBuild } from '@/lib/build/stored'

/** While prices are SAMPLE: the system only (items and notes), never an amount. */
export function SampleQuotation({ builder, reference }: { builder: unknown; reference: string }) {
  const b = storedBuild(builder)
  if (!b) return null
  return (
    <article className="rounded-2xl border bg-white p-4 sm:p-6" data-testid="quotation-sample">
      <p className="text-muted-foreground text-sm">Quotation ref. {reference}</p>
      <ul className="mt-3 divide-y text-sm">
        {b.lines.map((l) => (
          <li key={l.name} className="flex justify-between py-2">
            <span>{l.name}</span>
            <span className="text-muted-foreground">{l.qty}</span>
          </li>
        ))}
        {b.extras.map((e) => (
          <li key={e.label} className="py-2">
            {e.label}
          </li>
        ))}
      </ul>
      {b.notes.length > 0 && (
        <ul className="text-muted-foreground mt-3 list-disc pl-5 text-sm">
          {b.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      <p className="bg-brand-mist mt-4 rounded-xl p-3 text-sm">
        Your exact price will be confirmed when we contact you.
      </p>
    </article>
  )
}
