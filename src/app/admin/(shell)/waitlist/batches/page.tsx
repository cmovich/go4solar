import { redirect } from 'next/navigation'

/** "Batches sent" moved to Admin → Exports (every funder's batches), 24 Nov 2026. */
export default function RetiredBatchesPage() {
  redirect('/admin/exports')
}
