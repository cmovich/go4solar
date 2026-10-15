import { AdminShell } from '@/components/admin/AdminShell'
import { requireStaffWithMfa } from '@/lib/auth/roles'

export const dynamic = 'force-dynamic'

/** Every back-office page: staff only, two-factor verified. /admin/mfa sits outside this group. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireStaffWithMfa()
  return (
    <AdminShell email={session.user?.email ?? null} role={session.role}>
      {children}
    </AdminShell>
  )
}
