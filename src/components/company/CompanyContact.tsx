'use client'

import { useEffect, useState } from 'react'

import { companyPhones, DEFAULT_COMPANY } from '@/lib/company/schema'

type Contact = { email: string; phones: string[] }

const DEFAULT_CONTACT: Contact = {
  email: DEFAULT_COMPANY.email,
  phones: companyPhones(DEFAULT_COMPANY.phone),
}

/**
 * "email · phone" from the admin "Company details" setting, for the error screens (which run in
 * the browser). Shows the default details until the saved ones arrive; never throws.
 */
export function CompanyContact({ className }: { className?: string }) {
  const [c, setC] = useState<Contact>(DEFAULT_CONTACT)
  useEffect(() => {
    let live = true
    fetch('/api/company')
      .then((r) => (r.ok ? (r.json() as Promise<Contact>) : null))
      .then((d) => {
        if (live && d?.email && Array.isArray(d.phones)) setC({ email: d.email, phones: d.phones })
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])
  return (
    <span className={className} data-testid="company-contact">
      {c.email} · {c.phones.join(' · ')}
    </span>
  )
}
