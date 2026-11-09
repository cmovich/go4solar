import { describe, expect, it } from 'vitest'

import {
  canCreateQuotations,
  customerSchema,
  isTestQuotation,
  listFilters,
  quotationStatus,
  shareMessage,
  shareHref,
  STATUS_LABELS,
} from './rules'

describe('canCreateQuotations', () => {
  it('super admins always; other staff only with the permission; never customers', () => {
    expect(canCreateQuotations('super_admin', false)).toBe(true)
    expect(canCreateQuotations('content', true)).toBe(true)
    expect(canCreateQuotations('operations', false)).toBe(false)
    expect(canCreateQuotations('sales', false)).toBe(true)
    expect(canCreateQuotations('consumer', true)).toBe(false)
    expect(canCreateQuotations('installer', true)).toBe(false)
    expect(canCreateQuotations(null, true)).toBe(false)
  })
})

describe('customerSchema (all optional except the state)', () => {
  it('accepts a blank name and phone', () => {
    expect(customerSchema.parse({ name: '', phone: '', state: 'Lagos' })).toEqual({
      name: null,
      phone: null,
      state: 'Lagos',
    })
  })
  it('normalises a Nigerian phone and trims the name', () => {
    expect(
      customerSchema.parse({ name: '  Ada Obi ', phone: '0803 123 4567', state: 'FCT' }),
    ).toEqual({ name: 'Ada Obi', phone: '+2348031234567', state: 'FCT' })
  })
  it('refuses a bad phone, a one-letter name or no state', () => {
    expect(customerSchema.safeParse({ name: '', phone: '12', state: 'Lagos' }).success).toBe(false)
    expect(customerSchema.safeParse({ name: 'A', phone: '', state: 'Lagos' }).success).toBe(false)
    expect(customerSchema.safeParse({ name: '', phone: '' }).success).toBe(false)
  })
})

describe('quotationStatus', () => {
  const now = new Date('2026-11-09T12:00:00Z')
  const future = '2026-11-20T00:00:00Z'
  it('accepted beats everything; then expired; then shared; else created', () => {
    expect(
      quotationStatus(
        {
          accepted_at: '2026-11-08T00:00:00Z',
          shared_at: null,
          valid_until: '2026-11-01T00:00:00Z',
        },
        now,
      ),
    ).toBe('accepted')
    expect(
      quotationStatus(
        {
          accepted_at: null,
          shared_at: '2026-11-02T00:00:00Z',
          valid_until: '2026-11-08T00:00:00Z',
        },
        now,
      ),
    ).toBe('expired')
    expect(
      quotationStatus(
        { accepted_at: null, shared_at: '2026-11-02T00:00:00Z', valid_until: future },
        now,
      ),
    ).toBe('shared')
    expect(quotationStatus({ accepted_at: null, shared_at: null, valid_until: future }, now)).toBe(
      'created',
    )
    expect(STATUS_LABELS.created).toBe('Not shared yet')
  })
})

describe('shareMessage (WhatsApp)', () => {
  const base = {
    customerName: 'Ada Obi',
    reference: 'G4S-1A2B3C4D',
    total: 2_475_248,
    deposit: 495_050,
    monthly: 165_016,
    months: 12,
    sample: false,
    link: 'https://go4solar.app/q/abcdefghjkmn',
  }
  it('greets by first name and gives the total, deposit, monthly and the link', () => {
    expect(shareMessage(base)).toBe(
      'Hello Ada, here is your Go4Solar quotation G4S-1A2B3C4D.\n' +
        'Total amount payable: ₦2,475,248\n' +
        'Deposit: ₦495,050, then ₦165,016 a month for 12 months.\n' +
        'View it and tap "Accept and apply" to start: https://go4solar.app/q/abcdefghjkmn',
    )
  })
  it('without a name says Hello; while prices are SAMPLE it has no amounts', () => {
    const m = shareMessage({ ...base, customerName: null, sample: true })
    expect(m.startsWith('Hello, here is your Go4Solar quotation G4S-1A2B3C4D.')).toBe(true)
    expect(m).not.toContain('₦')
    expect(m).toContain('Your exact price will be confirmed')
    expect(m).toContain(base.link)
  })
})

describe('shareHref', () => {
  it('opens a chat with the customer when a phone is known, else lets staff pick a chat', () => {
    expect(shareHref('+2348031234567', 'Hi & bye')).toBe(
      'https://wa.me/2348031234567?text=Hi%20%26%20bye',
    )
    expect(shareHref(null, 'Hi')).toBe('https://wa.me/?text=Hi')
  })
})

describe('isTestQuotation', () => {
  it('test when the staff member is a test account or the phone is a test number', () => {
    expect(isTestQuotation(true, null)).toBe(true)
    expect(isTestQuotation(false, '+2348000000123')).toBe(true)
    expect(isTestQuotation(false, '+2348031234567')).toBe(false)
    expect(isTestQuotation(false, null)).toBe(false)
  })
})

describe('listFilters', () => {
  it('keeps a staff id and whole Lagos days; drops anything else', () => {
    expect(
      listFilters({
        staff: '7f1c8a52-3a0e-4c1b-9a43-1b2c3d4e5f60',
        from: '2026-11-01',
        to: '2026-11-09',
      }),
    ).toEqual({
      staff: '7f1c8a52-3a0e-4c1b-9a43-1b2c3d4e5f60',
      from: '2026-11-01T00:00:00+01:00',
      to: '2026-11-09T23:59:59.999+01:00',
      test: false,
    })
    expect(listFilters({ staff: 'nope', from: 'x', test: '1' })).toEqual({
      staff: null,
      from: null,
      to: null,
      test: true,
    })
  })
})
