import type { Metadata } from 'next'
import Link from 'next/link'

import { navFor } from '@/components/admin/nav'
import { requireStaffWithMfa } from '@/lib/auth/roles'

export const metadata: Metadata = { title: 'Back office' }

/** Dashboard placeholder: links to the modules this role can use. Funnel numbers arrive with Prompt 14. */
export default async function AdminHomePage() {
  const { user, role } = await requireStaffWithMfa()
  const modules = navFor(role).filter((n) => n.href !== '/admin')
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-brand-dark text-3xl font-bold">Back office</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Signed in as {user?.email} · role {role} · two-factor verified
      </p>
      <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((m) => (
          <li key={m.href}>
            <Link
              href={m.href}
              className="bg-brand-mist hover:border-brand-green flex min-h-20 items-center gap-3 rounded-xl border-2 border-transparent p-4 transition-colors"
            >
              <m.icon className="text-brand-green h-6 w-6" aria-hidden />
              <span className="text-brand-dark font-semibold">{m.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
