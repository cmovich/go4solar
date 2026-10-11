import type { Metadata } from 'next'
import Link from 'next/link'

import { navFor } from '@/components/admin/nav'
import { adminTiles } from '@/lib/approvals/admin'
import { requireStaffWithMfa } from '@/lib/auth/roles'
import { formatNaira } from '@/lib/money'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Back office' }
export const dynamic = 'force-dynamic'

/** Back-office home: today's numbers, then the modules this role can use. */
export default async function AdminHomePage() {
  const { user, role } = await requireStaffWithMfa()
  const modules = navFor(role).filter((n) => n.href !== '/admin')
  const [tiles, permission] = await Promise.all([
    adminTiles(),
    role === 'super_admin'
      ? Promise.resolve(true)
      : createClient().then(
          async (s) => (await s.rpc('has_permission', { target: 'assisted_entry' })).data === true,
        ),
  ])
  const cards: { label: string; value: string; href: string; alert?: boolean }[] = [
    {
      label: 'Applications waiting',
      value: String(tiles.waiting),
      href: '/admin/applications?status=submitted',
    },
    {
      label: 'Overdue (over 48 h)',
      value: String(tiles.overdue),
      href: '/admin/applications',
      alert: tiles.overdue > 0,
    },
    {
      label: 'Approved this month',
      value: String(tiles.approvedThisMonth),
      href: '/admin/applications?status=approved',
    },
    { label: 'Jobs in progress', value: String(tiles.jobsInProgress), href: '/admin/jobs' },
  ]
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-brand-dark text-3xl font-bold">Back office</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Signed in as {user?.email} · role {role} · two-factor verified
      </p>

      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="admin-tiles">
        {cards.map((c) => (
          <li key={c.label}>
            <Link
              href={c.href}
              className={`block rounded-xl border-2 p-4 ${c.alert ? 'border-red-300 bg-red-50' : 'bg-brand-mist border-transparent'}`}
            >
              <span className="text-muted-foreground block text-xs font-semibold">{c.label}</span>
              <span
                className={`text-2xl font-bold ${c.alert ? 'text-red-700' : 'text-brand-dark'}`}
              >
                {c.value}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <section className="mt-4 rounded-xl border p-4">
        <h2 className="text-brand-dark text-sm font-bold">Funder balances remaining</h2>
        <ul className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
          {tiles.funders.map((f) => (
            <li key={f.name} className="flex justify-between gap-2">
              <span>{f.name}</span>
              <span className="font-semibold">{formatNaira(f.balance)}</span>
            </li>
          ))}
        </ul>
      </section>

      {permission && (
        <Link
          href="/admin/applications/new"
          className="bg-brand-green hover:bg-brand-dark mt-4 inline-block rounded-md px-4 py-2 text-sm font-semibold text-white"
        >
          New application on behalf of customer
        </Link>
      )}

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
