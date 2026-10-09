import type { Metadata } from 'next'

import { Button } from '@/components/ui/button'
import { requireStaffWithMfa } from '@/lib/auth/roles'

import { signOut } from '../login/actions'

export const metadata: Metadata = { title: 'Back office' }

// Placeholder. Prompt 8 adds the real admin shell (sidebar, pages by role).
export default async function AdminPage() {
  const { user, role } = await requireStaffWithMfa()

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-brand-dark text-3xl font-bold">Back office</h1>
      <p className="text-muted-foreground mt-2">
        Signed in as <span className="text-foreground font-medium">{user?.email}</span> · role{' '}
        <span className="text-foreground font-medium">{role}</span> · two-factor verified
      </p>
      <form action={signOut} className="mt-8">
        <Button type="submit" variant="outline">
          Sign out
        </Button>
      </form>
    </main>
  )
}
