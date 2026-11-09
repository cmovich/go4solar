import { AdminShell } from '@/components/admin/AdminShell'
import { requireBackOfficeWithMfa } from '@/lib/auth/roles'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Every back-office page: staff (or sales, who only reach Quotations: each other page checks its
 * own role), two-factor verified. /admin/mfa sits outside this group.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireBackOfficeWithMfa()
  // Extra permissions that add menu items (super admins see everything anyway).
  const permissions: string[] = []
  if (session.role !== 'super_admin' && session.role !== 'sales') {
    const { data } = await (
      await createClient()
    ).rpc('has_permission', {
      target: 'create_quotations',
    })
    if (data) permissions.push('create_quotations')
  }
  return (
    <AdminShell email={session.user?.email ?? null} role={session.role} permissions={permissions}>
      {children}
    </AdminShell>
  )
}
