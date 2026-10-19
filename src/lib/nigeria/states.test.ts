import { describe, expect, it } from 'vitest'

import { NG_STATE_IDS, isNgStateId, stateLabel } from './states'

describe('Nigerian states (nationwide coverage)', () => {
  it('all 36 states and the FCT, in one A–Z list by the name people see', () => {
    expect(NG_STATE_IDS).toHaveLength(37)
    const labels = NG_STATE_IDS.map(stateLabel)
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)))
    expect(labels.slice(0, 3)).toEqual(['Abia', 'Abuja (FCT)', 'Adamawa'])
    expect(labels.at(-1)).toBe('Zamfara')
  })
  it('no state is special any more', async () => {
    const mod = (await import('./states')) as Record<string, unknown>
    expect(mod.LAUNCH_STATE_IDS).toBeUndefined()
    expect(mod.isLaunchState).toBeUndefined()
    expect(isNgStateId('Kano')).toBe(true)
    expect(isNgStateId('Other')).toBe(false)
  })
})
