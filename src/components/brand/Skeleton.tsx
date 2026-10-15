/** Grey placeholder blocks while a page loads (announced to screen readers once). */
export function PageSkeleton({ rows = 4, wide = false }: { rows?: number; wide?: boolean }) {
  return (
    <main
      className={`mx-auto ${wide ? 'max-w-7xl' : 'max-w-3xl'} space-y-4 px-4 py-8 sm:px-6`}
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading…</span>
      <div className="h-8 w-2/3 animate-pulse rounded-md bg-slate-200" />
      <div className="h-4 w-1/3 animate-pulse rounded-md bg-slate-200" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
      ))}
    </main>
  )
}
