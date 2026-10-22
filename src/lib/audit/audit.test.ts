import { describe, expect, it } from 'vitest'

import { auditCsv, auditDiff, deletedRow, describeAction } from './view'

describe('auditDiff (what changed)', () => {
  it('an update shows only the fields that changed', () => {
    expect(
      auditDiff(
        { id: 'x', sku: 'PNL-550', unit_cost: 120000, updated_at: 'a' },
        { id: 'x', sku: 'PNL-550', unit_cost: 115000, updated_at: 'b' },
      ),
    ).toEqual([{ field: 'unit_cost', before: 120000, after: 115000 }])
  })
  it('an insert lists the new values; a delete the old ones', () => {
    expect(auditDiff(null, { id: 'x', name: 'SPEWA' })).toEqual([
      { field: 'name', before: undefined, after: 'SPEWA' },
    ])
    expect(auditDiff({ id: 'x', name: 'SPEWA' }, null)).toEqual([
      { field: 'name', before: 'SPEWA', after: undefined },
    ])
  })
  it('app entries with plain values still show', () => {
    expect(auditDiff(10, 7)).toEqual([{ field: '(value)', before: 10, after: 7 }])
  })
})

describe('describeAction', () => {
  it('plain words for database changes and sign-ins', () => {
    expect(describeAction('db.update', 'components')).toBe('Changed components')
    expect(describeAction('db.insert', 'partners')).toBe('Added to partners')
    expect(describeAction('db.delete', 'testimonials')).toBe('Deleted from testimonials')
    expect(describeAction('auth.sign_in', 'auth.sessions')).toBe('Signed in')
    expect(describeAction('auth.sign_out', 'auth.sessions')).toBe('Signed out')
    expect(describeAction('pricing.rates.update', 'pricing_rates')).toBe('pricing.rates.update')
  })
})

describe('auditCsv', () => {
  it('one line per entry, quoted safely, with the changes', () => {
    const csv = auditCsv([
      {
        created_at: '2026-10-19T10:00:00Z',
        actor_email: 'boss@go4solar.app',
        actor_role: 'super_admin',
        action: 'db.update',
        entity: 'components',
        entity_id: 'x',
        source: 'trigger',
        before: { unit_cost: 120000, name: 'Panel, 550 "W"' },
        after: { unit_cost: 115000, name: 'Panel, 550 "W"' },
      },
    ])
    const [header, line] = csv.trim().split('\n')
    expect(header).toBe('When (Lagos),Who,Role,Action,Table,Row,Source,Changes')
    expect(line).toContain('boss@go4solar.app,super_admin,db.update,components,x,trigger')
    expect(line).toMatch(/,unit_cost: 120000 → 115000$/)
  })
  it('a cell starting with = + - @ cannot run as a spreadsheet formula', () => {
    const csv = auditCsv([
      {
        created_at: '2026-10-19T10:00:00Z',
        actor_email: '=HYPERLINK("x")',
        actor_role: null,
        action: 'db.insert',
        entity: 'partners',
        entity_id: null,
        source: 'trigger',
        before: null,
        after: { name: 'x' },
      },
    ])
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
  })
})

describe('parseAuditFilters (from the page address)', () => {
  it('reads person, Lagos dates, table and action; ignores anything malformed', async () => {
    const { parseAuditFilters } = await import('./view')
    expect(
      parseAuditFilters({
        who: '11111111-1111-4111-8111-111111111111',
        from: '2026-10-01',
        to: '2026-10-19',
        table: 'components',
        action: 'db.update',
      }),
    ).toEqual({
      who: '11111111-1111-4111-8111-111111111111',
      fromIso: '2026-10-01T00:00:00+01:00',
      toIso: '2026-10-19T23:59:59.999+01:00',
      table: 'components',
      action: 'db.update',
    })
    expect(
      parseAuditFilters({ who: 'x', from: '19/10/2026', table: 'drop table;', action: 'a b' }),
    ).toEqual({
      who: null,
      fromIso: null,
      toIso: null,
      table: null,
      action: null,
    })
  })
})

describe('deleted rows (Part W)', () => {
  it('a delete keeps the whole old row for restoring; other actions have none', () => {
    const row = { id: 'w1', phone_e164: '+2348000001234', first_name: 'Ada' }
    expect(deletedRow('db.delete', row)).toEqual(row)
    expect(deletedRow('waitlist.delete', row)).toEqual(row)
    expect(deletedRow('db.update', row)).toBeNull()
    expect(deletedRow('db.delete', null)).toBeNull()
  })

  it('waiting-list deletes read in plain words', () => {
    expect(describeAction('waitlist.delete', 'waitlist_consumers')).toBe(
      'Deleted a waiting-list entry',
    )
    expect(describeAction('waitlist.delete_test', 'waitlist')).toBe('Deleted all test entries')
  })
})
