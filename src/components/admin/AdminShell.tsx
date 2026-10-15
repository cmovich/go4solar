'use client'

import { Activity } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

import { siteConfig } from '@/config/site'
import type { AppRole } from '@/lib/auth/staffRoles'

import { navFor } from './nav'

import { Button } from '@/components/ui/button'

import { signOut } from '@/app/login/actions'

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super admin',
  credit_officer: 'Credit officer',
  operations: 'Operations',
  collections: 'Collections',
  finance: 'Finance',
  content: 'Content',
}

export function AdminShell({
  email,
  role,
  children,
}: {
  email: string | null
  role: AppRole | null
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const items = navFor(role)

  const nav = (
    <nav aria-label="Back office" className="space-y-1">
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors ${
              active
                ? 'bg-brand-green text-white'
                : 'text-white/80 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            {label}
          </Link>
        )
      })}
    </nav>
  )

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="bg-brand-dark hidden flex-col px-4 py-5 text-white lg:flex">
        <Link href="/admin" className="mb-6 inline-flex self-start rounded-md bg-white px-3 py-1.5">
          <Image
            src="/brand/go4solar-logo.png"
            alt={siteConfig.name}
            width={130}
            height={42}
            className="h-8 w-auto"
          />
        </Link>
        {nav}
        <p className="mt-auto pt-6 text-xs text-white/50">Back office · {siteConfig.name}</p>
      </aside>

      <div className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between gap-3 border-b bg-white px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls="admin-mobile-nav"
              className="hover:bg-brand-mist inline-flex h-10 w-10 items-center justify-center rounded-md lg:hidden"
            >
              <Activity className="h-5 w-5" aria-hidden />
              <span className="sr-only">Menu</span>
            </button>
            <Link href="/admin" className="inline-flex rounded-md bg-white px-2 py-1 lg:hidden">
              <Image
                src="/brand/go4solar-logo.png"
                alt={siteConfig.name}
                width={110}
                height={36}
                className="h-7 w-auto"
              />
            </Link>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-brand-dark hidden font-medium sm:inline">{email ?? ''}</span>
            <span className="bg-brand-mist text-brand-dark rounded-full px-2.5 py-1 text-xs font-semibold">
              {role ? (ROLE_LABELS[role] ?? role) : '—'}
            </span>
            <form action={signOut}>
              <Button type="submit" variant="outline" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </header>
        {open && (
          <div id="admin-mobile-nav" className="bg-brand-dark px-4 py-4 text-white lg:hidden">
            {nav}
          </div>
        )}
        <div className="flex-1">{children}</div>
      </div>
    </div>
  )
}
