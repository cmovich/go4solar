import { describe, expect, it } from 'vitest'

import { navFor } from './nav'

describe('navFor', () => {
  const hrefs = (role: Parameters<typeof navFor>[0], perms: string[] = []) =>
    navFor(role, perms).map((n) => n.href)
  it('super admins see Quotations', () => {
    expect(hrefs('super_admin')).toContain('/admin/quotations')
  })
  it('other staff see Quotations only with the create_quotations permission', () => {
    expect(hrefs('content')).not.toContain('/admin/quotations')
    expect(hrefs('content', ['create_quotations'])).toContain('/admin/quotations')
    expect(hrefs('content', ['create_quotations'])).toContain('/admin/testimonials')
  })
  it('sales sees the waiting list (read; Edit and ticks), the Trade Lenda profiles and Quotations, nothing else', () => {
    expect(hrefs('sales')).toEqual([
      '/admin/waitlist',
      '/admin/waitlist/profiles',
      '/admin/quotations',
    ])
  })
  it('Trade Lenda sees its batches and nothing else', () => {
    expect(hrefs('funder_partner')).toEqual(['/admin/funder'])
    expect(hrefs('funder_partner', ['create_quotations'])).toEqual(['/admin/funder'])
  })
  it('funder approver sees SPEWA approvals and nothing else, even with a permission', () => {
    expect(hrefs('funder_approver')).toEqual(['/admin/spewa'])
    expect(hrefs('funder_approver', ['create_quotations'])).toEqual(['/admin/spewa'])
  })
  it('SPEWA approvals: super admin and credit officer, not other staff', () => {
    expect(hrefs('super_admin')).toContain('/admin/spewa')
    expect(hrefs('credit_officer')).toContain('/admin/spewa')
    expect(hrefs('operations')).not.toContain('/admin/spewa')
    expect(hrefs('sales')).not.toContain('/admin/spewa')
  })
  it('a permission never opens the back office to a non-staff role', () => {
    expect(hrefs('installer', ['create_quotations'])).toEqual([])
    expect(hrefs(null, ['create_quotations'])).toEqual([])
  })
})
