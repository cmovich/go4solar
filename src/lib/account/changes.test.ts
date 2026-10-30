import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeSupabase } from '@/test/fakeSupabase'

// "Request a change": customers ask, staff decide (audited); verified details never change directly.
let db = fakeSupabase({ change_requests: [['consumer_id', 'field', 'status']] })
const updateUserById = vi.fn(async () => ({ data: {}, error: null }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ ...db.client, auth: { admin: { updateUserById } } }),
}))
const notifyCustomer = vi.fn(async () => {})
vi.mock('@/lib/notify/customer', () => ({
  notifyCustomer: (...a: unknown[]) => notifyCustomer(...(a as [])),
}))
const sendEmailVerification = vi.fn(async () => {})
vi.mock('@/lib/auth/emailVerification', () => ({
  sendEmailVerification: (...a: unknown[]) => sendEmailVerification(...(a as [])),
}))

const { requestChange, decideChange } = await import('./changes')

const LOVE = 'u-love'
const STAFF = 'u-staff'

beforeEach(() => {
  db = fakeSupabase({ change_requests: [['consumer_id', 'field', 'status']] })
  updateUserById.mockClear()
  notifyCustomer.mockClear()
  db.seed('profiles', {
    id: LOVE,
    full_name: 'Love Lounge',
    phone_e164: '+2348031112222',
    email: 'love@x.test',
  })
  db.seed('applications', {
    id: 'app-1',
    consumer_id: LOVE,
    install_address: { line1: '1 Old Road', city: 'Ikeja', lga: 'Ikeja', state: 'Lagos' },
    created_at: '2026-10-30T10:00:00Z',
  })
})

describe('requestChange (customer)', () => {
  it('records a pending request with the current value; the profile is not touched', async () => {
    const r = await requestChange(db.client as never, LOVE, {
      field: 'name',
      newValue: 'Love A. Lounge',
      reason: 'Middle name',
    })
    expect(r.ok).toBe(true)
    expect(db.rows('change_requests')[0]).toMatchObject({
      consumer_id: LOVE,
      field: 'name',
      current_value: 'Love Lounge',
      new_value: 'Love A. Lounge',
      status: 'pending',
    })
    expect(db.rows('profiles')[0]!.full_name).toBe('Love Lounge')
  })

  it('one open request per detail', async () => {
    await requestChange(db.client as never, LOVE, { field: 'phone', newValue: '08039990000' })
    const again = await requestChange(db.client as never, LOVE, {
      field: 'phone',
      newValue: '08039990001',
    })
    expect(again).toMatchObject({ ok: false })
  })
})

describe('decideChange (staff)', () => {
  const open = async (field: string, newValue: string) => {
    await requestChange(db.client as never, LOVE, { field, newValue })
    return db.rows('change_requests').find((r) => r.field === field)!.id as string
  }

  it('approve a name: applied, request closed, audited, customer told', async () => {
    const id = await open('name', 'Love A. Lounge')
    const r = await decideChange(STAFF, { id, decision: 'approve' })
    expect(r.ok).toBe(true)
    expect(db.rows('profiles')[0]!.full_name).toBe('Love A. Lounge')
    expect(db.rows('change_requests')[0]).toMatchObject({ status: 'approved', decided_by: STAFF })
    expect(db.rows('audit_log')[0]).toMatchObject({
      actor_id: STAFF,
      action: 'change_request.approve',
      before: { name: 'Love Lounge' },
      after: { name: 'Love A. Lounge' },
    })
    expect(notifyCustomer).toHaveBeenCalled()
  })

  it('approve an email: login email changes and the new email must be confirmed again', async () => {
    const id = await open('email', 'new@x.test')
    await decideChange(STAFF, { id, decision: 'approve' })
    expect(updateUserById).toHaveBeenCalledWith(LOVE, { email: 'new@x.test', email_confirm: true })
    expect(db.rows('profiles')[0]).toMatchObject({ email: 'new@x.test', email_verified_at: null })
    expect(sendEmailVerification).toHaveBeenCalled()
  })

  it('approve an address: the installation address of the latest application', async () => {
    const id = await open('address', '7 New Street, Lekki')
    await decideChange(STAFF, { id, decision: 'approve' })
    expect(db.rows('applications')[0]!.install_address).toMatchObject({
      line1: '7 New Street, Lekki',
      state: 'Lagos',
    })
  })

  it('reject: nothing changes except the request; a note is kept', async () => {
    const id = await open('phone', '08039990000')
    await decideChange(STAFF, {
      id,
      decision: 'reject',
      note: 'Please call us from the new number',
    })
    expect(db.rows('profiles')[0]!.phone_e164).toBe('+2348031112222')
    expect(db.rows('change_requests')[0]).toMatchObject({
      status: 'rejected',
      decision_note: 'Please call us from the new number',
    })
    expect(db.rows('audit_log')[0]!.action).toBe('change_request.reject')
  })

  it('a request already decided cannot be decided again', async () => {
    const id = await open('name', 'Love A. Lounge')
    await decideChange(STAFF, { id, decision: 'approve' })
    expect((await decideChange(STAFF, { id, decision: 'reject' })).ok).toBe(false)
  })
})
