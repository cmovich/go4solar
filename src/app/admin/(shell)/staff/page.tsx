import type { Metadata } from 'next'

import { StaffTable, type StaffRowView } from '@/components/admin/staff/StaffTable'
import { STAFF_ROLES, isStaffRole, requireRole } from '@/lib/auth/roles'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Staff' }

/** super_admin only: invite staff, set roles and the assisted-entry permission, disable logins. */
export default async function StaffPage() {
  const session = await requireRole('super_admin')
  const supabase = await createClient()
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role')
    .in('role', [...STAFF_ROLES])
    .order('created_at')
  if (error) throw new Error(error.message)
  const { data: perms } = await supabase.from('staff_permissions').select('profile_id, permission')

  // Ban state lives in auth; read it with the service role.
  const admin = createAdminClient()
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const banned = new Set(
    (users?.users ?? [])
      .filter((u) => {
        const until = (u as { banned_until?: string | null }).banned_until
        return until ? new Date(until) > new Date() : false
      })
      .map((u) => u.id),
  )

  const rows: StaffRowView[] = profiles.flatMap((p) =>
    isStaffRole(p.role)
      ? [
          {
            id: p.id,
            email: p.email,
            fullName: p.full_name,
            role: p.role,
            assistedEntry: (perms ?? []).some(
              (x) => x.profile_id === p.id && x.permission === 'assisted_entry',
            ),
            waitlistDelete: (perms ?? []).some(
              (x) => x.profile_id === p.id && x.permission === 'waitlist_delete',
            ),
            disabled: banned.has(p.id),
            isMe: p.id === session.user?.id,
          },
        ]
      : [],
  )

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-brand-dark text-3xl font-bold">Staff</h1>
      <p className="text-muted-foreground mt-1 mb-6 text-sm">
        Every staff account needs two-factor login. Roles follow the PRD staff table; assisted entry
        and deleting waiting-list entries can be given to any role.
      </p>
      <StaffTable rows={rows} />
    </main>
  )
}
