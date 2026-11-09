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
  it('a permission never opens the back office to a non-staff role', () => {
    expect(hrefs('installer', ['create_quotations'])).toEqual([])
    expect(hrefs(null, ['create_quotations'])).toEqual([])
  })
})
