import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeSupabase } from '@/test/fakeSupabase'

let db = fakeSupabase()
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => db.client }))
const sent: { channel: string; to: string; template: string; payload: { text: string } }[] = []
vi.mock('@/lib/providers/messaging', () => ({
  getMessagingProvider: async () => ({
    send: async (m: (typeof sent)[number]) => (sent.push(m), { id: 'm', status: 'queued' }),
  }),
}))

const { setConsent } = await import('./consents')

const LEAD = '11111111-1111-4111-8111-111111111111'
const TL = 'tl-funder'
const SP = 'sp-funder'
const ops = { id: 'ops-1', role: 'operations' as const }
const sales = { id: 'sales-1', role: 'sales' as const }

beforeEach(() => {
  db = fakeSupabase()
  sent.length = 0
  db.seed('waitlist_consumers', { id: LEAD, is_test: false })
  db.seed('funders', { id: TL, name: 'Trade Lenda', contact_email: 'ops@tradelenda.test' })
  db.seed('funders', { id: SP, name: 'SPEWA programme funds', contact_email: null })
})

describe('setConsent', () => {
  it('Sales records consent for one funder: who, when, note, audited', async () => {
    expect(
      await setConsent({ waitlistId: LEAD, funderId: TL, on: true, note: 'on the call' }, sales),
    ).toEqual({ ok: true })
    const [c] = db.rows('lead_funder_consents')
    expect(c).toMatchObject({
      funder_id: TL,
      consented_by: 'sales-1',
      consent_note: 'on the call',
      withdrawn_at: null,
    })
    expect(db.rows('audit_log').map((a) => a.action)).toEqual(['lead_consent.on'])
  })

  it('a role that cannot tick is refused, nothing saved', async () => {
    const r = await setConsent(
      { waitlistId: LEAD, funderId: TL, on: true },
      { id: 'f', role: 'finance' },
    )
    expect(r.ok).toBe(false)
    expect(db.rows('lead_funder_consents')).toHaveLength(0)
  })

  it('withdrawn before any export: recorded, the funder is not emailed (nothing was shared)', async () => {
    await setConsent({ waitlistId: LEAD, funderId: TL, on: true }, ops)
    const r = await setConsent(
      { waitlistId: LEAD, funderId: TL, on: false, note: 'changed mind' },
      ops,
    )
    expect(r).toEqual({ ok: true, notified: false })
    expect(db.rows('lead_funder_consents')[0]).toMatchObject({
      withdrawn_by: 'ops-1',
      withdrawn_note: 'changed mind',
    })
    expect(sent).toHaveLength(0)
  })

  it('withdrawn after an export: marked in that funder’s batch and the funder’s contact is emailed', async () => {
    db.seed('funder_batches', { id: 'b-tl', funder_id: TL, number: 'TL-Batch-004', version: 1 })
    db.seed('funder_batches', { id: 'b-sp', funder_id: SP, number: 'SP-Batch-001', version: 1 })
    db.seed('funder_batch_items', {
      id: 'i-tl',
      batch_id: 'b-tl',
      waitlist_id: LEAD,
      consent_withdrawn_at: null,
    })
    db.seed('funder_batch_items', {
      id: 'i-sp',
      batch_id: 'b-sp',
      waitlist_id: LEAD,
      consent_withdrawn_at: null,
    })
    await setConsent({ waitlistId: LEAD, funderId: TL, on: true }, ops)
    const r = await setConsent({ waitlistId: LEAD, funderId: TL, on: false }, ops)
    expect(r).toEqual({ ok: true, notified: true })
    const items = db.rows('funder_batch_items')
    expect(items.find((i) => i.id === 'i-tl')!.consent_withdrawn_at).toBeTruthy()
    expect(items.find((i) => i.id === 'i-sp')!.consent_withdrawn_at).toBeNull() // other funder untouched
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      channel: 'email',
      to: 'ops@tradelenda.test',
      template: 'consent_withdrawn',
    })
    expect(sent[0]!.payload.text).toContain('TL-Batch-004')
    expect(db.rows('lead_funder_consents')[0]!.funder_told_at).toBeTruthy()
    const withdraw = db.rows('audit_log').find((a) => a.action === 'lead_consent.withdraw')!
    expect(withdraw.after).toMatchObject({ exportedIn: ['TL-Batch-004'], funderEmailed: true })
  })

  it('cannot withdraw a consent that was never given', async () => {
    const r = await setConsent({ waitlistId: LEAD, funderId: SP, on: false }, ops)
    expect(r.ok).toBe(false)
  })

  it('consent given again after a withdrawal is active again', async () => {
    await setConsent({ waitlistId: LEAD, funderId: TL, on: true }, ops)
    await setConsent({ waitlistId: LEAD, funderId: TL, on: false }, ops)
    await setConsent({ waitlistId: LEAD, funderId: TL, on: true, note: 'agreed again' }, sales)
    expect(db.rows('lead_funder_consents')).toHaveLength(1)
    expect(db.rows('lead_funder_consents')[0]).toMatchObject({
      withdrawn_at: null,
      consent_note: 'agreed again',
    })
  })
})
