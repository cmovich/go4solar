import { describe, expect, it } from 'vitest'

import { adviceFacts, ruleBasedAdvice } from './advice'

const base = {
  inverterKva: 5,
  batteryKwh: 10,
  usableShare: 0.81,
  panelKw: 3.3,
  loadKva: null as number | null,
  monthly: 250000,
  months: 12,
  systemPrice: 3_500_000,
  blocking: [] as string[],
  warnings: [] as string[],
}

describe('adviceFacts (numbers from our engine only)', () => {
  it('backup at the inverter’s full load and at the known load', () => {
    expect(adviceFacts(base)).toEqual([
      'Your battery stores about 8.1 kWh you can use: about 2 hours with the 5 kVA inverter at full load.',
      'Your 3.3 kW of panels make roughly 13 kWh on a sunny day.',
      'You pay ₦250,000 a month for 12 months; the total amount payable is ₦3,500,000 with 0% interest.',
    ])
    expect(adviceFacts({ ...base, loadKva: 2 })[0]).toBe(
      'Your battery stores about 8.1 kWh you can use: about 5.1 hours at your 2 kVA load.',
    )
  })
  it('problems come first', () => {
    const f = adviceFacts({
      ...base,
      blocking: ['This 24 V battery does not work with the 5 kVA inverter (48 V).'],
    })
    expect(f[0]).toMatch(/^Fix this first:/)
  })
  it('nothing chosen → a nudge', () => {
    expect(
      adviceFacts({ ...base, inverterKva: 0, batteryKwh: 0, panelKw: 0, systemPrice: 0 }),
    ).toEqual([
      'Choose an inverter, a battery and panels, or tell us your load to get a starting set.',
    ])
  })
  it('the rule-based advice is the facts as one paragraph', () => {
    expect(ruleBasedAdvice(adviceFacts(base))).toBe(adviceFacts(base).join(' '))
  })
})
