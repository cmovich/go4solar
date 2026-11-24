import { redirect } from 'next/navigation'

/**
 * "Trade Lenda profiles" is retired (24 Nov 2026): everything is managed from Admin → Waiting list
 * (Edit, consent per funder, "Add to export queue"); batches are in Admin → Exports.
 */
export default function RetiredProfilesPage() {
  redirect('/admin/waitlist')
}
