import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SessionInfo } from '@/lib/auth/session'
import { DEFAULT_VISION_SETTINGS } from '@/lib/vision/spend'
import { fakeSupabase } from '@/test/fakeSupabase'

let db = fakeSupabase()
let session: SessionInfo = { user: null, role: null, aal: null }
vi.mock('@/lib/auth/session', () => ({ getSessionInfo: async () => session }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => db.client }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => db.client }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { saveVisionSettings } = await import('./actions')

beforeEach(() => {
  db = fakeSupabase()
  db.seed('settings', { key: 'vision', value: DEFAULT_VISION_SETTINGS })
})

describe('saveVisionSettings (admin "Photo lookup")', () => {
  it('only a super admin with two-factor; nothing written otherwise', async () => {
    session = { user: { id: 'ops', email: 'o@x.test' }, role: 'operations', aal: 'aal2' }
    expect(await saveVisionSettings(DEFAULT_VISION_SETTINGS)).toMatchObject({ ok: false })
    expect(db.rows('audit_log')).toEqual([])
  })

  it('saves (no longer SAMPLE) with an audit row; a negative cap is refused', async () => {
    session = { user: { id: 'sa', email: 's@x.test' }, role: 'super_admin', aal: 'aal2' }
    expect(await saveVisionSettings({ ...DEFAULT_VISION_SETTINGS, dailyCapNaira: 2000 })).toEqual({
      ok: true,
    })
    const saved = db
      .rows('settings')
      .find((r) => r.key === 'vision' && (r.value as { sample?: boolean }).sample === false)
    expect(saved?.value).toMatchObject({ dailyCapNaira: 2000, sample: false })
    expect(db.rows('audit_log')[0]).toMatchObject({ action: 'vision.settings.update' })
    expect(
      await saveVisionSettings({ ...DEFAULT_VISION_SETTINGS, dailyCapNaira: -5 }),
    ).toMatchObject({ ok: false })
  })
})
