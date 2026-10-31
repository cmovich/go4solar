import { describe, expect, it } from 'vitest'

import { assumedEquipment } from '@/lib/sizing/defaults'

import { compatibility } from './compat'

const eq = assumedEquipment()
const inv = (kva: number) => eq.inverters.find((i) => i.kva === kva)!
const panel = eq.panel

describe('compatibility (builder)', () => {
  it('a matching set passes', () => {
    const r = compatibility({
      inverter: inv(5),
      battery: { voltage: 48, kwh: 10 },
      panels: { panel, count: 8 },
    })
    expect(r).toEqual({ blocking: [], warnings: [] })
  })

  it('battery voltage must match the inverter', () => {
    const r = compatibility({ inverter: inv(5), battery: { voltage: 24, kwh: 5 }, panels: null })
    expect(r.blocking).toEqual([
      'This 24 V battery does not work with the 5 kVA inverter (48 V). Choose a 48 V battery.',
    ])
  })

  it('too many panels for the inverter', () => {
    const r = compatibility({ inverter: inv(2.5), battery: null, panels: { panel, count: 8 } })
    expect(r.blocking[0]).toBe(
      '8 panels (4.4 kW) are more than the 2.5 kVA inverter can take (3 kW). Choose a bigger inverter or fewer panels.',
    )
  })

  it('panels that cannot be wired for the inverter’s voltage range', () => {
    const r = compatibility({
      inverter: { ...inv(5), mpptMin: 400 },
      battery: null,
      panels: { panel, count: 2 },
    })
    expect(r.blocking).toContain(
      "These panels cannot be wired to suit the 5 kVA inverter's voltage range.",
    )
  })

  it('a known load needs a big enough inverter', () => {
    const r = compatibility({ inverter: inv(2.5), battery: null, panels: null, loadKva: 3 })
    expect(r.blocking).toContain('Your load (3 kVA) needs at least a 3 kVA inverter.')
  })

  it('some items: checked against what the customer already has', () => {
    const r = compatibility({
      inverter: null,
      battery: { voltage: 24, kwh: 5 },
      panels: { panel, count: 20 },
      existing: { kva: 5, batteryV: 48 },
    })
    expect(r.blocking).toContain(
      'This 24 V battery does not work with your inverter (48 V). Choose a 48 V battery.',
    )
    expect(r.warnings.join(' ')).toMatch(
      /20 panels .* may be more than your 5 kVA inverter can take/,
    )
  })

  it('an inverter with no battery is allowed, with a warning', () => {
    const r = compatibility({ inverter: inv(5), battery: null, panels: { panel, count: 6 } })
    expect(r.blocking).toEqual([])
    expect(r.warnings).toContain('Without a battery the system only works while the sun shines.')
  })
})
