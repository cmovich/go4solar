import { redirect } from 'next/navigation'

/** The profile form moved to Admin → Waiting list → Edit (23 Nov 2026): old links still work. */
export default async function OldProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/admin/waitlist/${encodeURIComponent(id)}/edit`)
}
