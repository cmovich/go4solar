import type { Database } from '@/lib/supabase/database.types'

type ApplicationStatus = Database['public']['Enums']['application_status']

export type TimelineStep = { label: string; state: 'done' | 'current' | 'todo' | 'failed' }

/** Signed → Guarantor signed → Deposit paid → Under review → Approved → Installed. */
export function timeline(input: {
  consumerSigned: boolean
  guarantorSigned: boolean
  depositPaid: boolean
  applicationStatus: ApplicationStatus
  installed: boolean
}): TimelineStep[] {
  const approved = input.applicationStatus === 'approved'
  const declined = input.applicationStatus === 'declined'
  const reviewed = approved || declined
  const done = [
    input.consumerSigned,
    input.guarantorSigned,
    input.depositPaid,
    reviewed,
    approved,
    approved && input.installed,
  ]
  const labels = [
    'Signed',
    'Guarantor signed',
    'Deposit paid',
    'Under review',
    'Approved',
    'Installed',
  ]
  const firstOpen = done.findIndex((d) => !d)
  return labels.map((label, i) => {
    if (i === 3 && declined) return { label: 'Not approved', state: 'failed' }
    if (declined && i > 3) return { label, state: 'todo' }
    return { label, state: done[i] ? 'done' : i === firstOpen ? 'current' : 'todo' }
  })
}
