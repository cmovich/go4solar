/** CSV / Excel / PDF links for a batch or one customer (`refId`). */
export function Downloads({ href, refId, label }: { href: string; refId?: string; label: string }) {
  const q = (format: string) =>
    `${href}?format=${format}${refId ? `&ref=${encodeURIComponent(refId)}` : ''}`
  return (
    <p className="mt-3 flex flex-wrap gap-3 text-sm" data-testid="downloads">
      <span className="font-medium">{label}:</span>
      <a href={q('csv')} className="text-brand-blue underline">
        CSV
      </a>
      <a href={q('xlsx')} className="text-brand-blue underline">
        Excel
      </a>
      <a href={q('pdf')} className="text-brand-blue underline" target="_blank" rel="noreferrer">
        PDF
      </a>
    </p>
  )
}
