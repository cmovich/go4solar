import { describe, expect, it } from 'vitest'

import { defaultEssential } from './essential'

describe('defaultEssential (sensible pre-ticks)', () => {
  it('lights, fans, TVs and phone charging start ticked', () => {
    expect(defaultEssential({ category: 'lighting', name: 'LED bulb' })).toBe(true)
    expect(defaultEssential({ category: 'cooling', name: 'Ceiling fan' })).toBe(true)
    expect(defaultEssential({ category: 'cooling', name: 'Standing fan' })).toBe(true)
    expect(defaultEssential({ category: 'tv_electronics', name: '43" TV' })).toBe(true)
    expect(defaultEssential({ category: 'tv_electronics', name: 'Phone charger' })).toBe(true)
  })
  it('everything else starts unticked', () => {
    expect(defaultEssential({ category: 'cooling', name: 'AC 1 HP' })).toBe(false)
    expect(defaultEssential({ category: 'kitchen', name: 'Fridge' })).toBe(false)
    expect(defaultEssential({ category: 'tv_electronics', name: 'Decoder' })).toBe(false)
    expect(defaultEssential({ category: 'water_outdoor', name: 'Borehole pump 1 HP' })).toBe(false)
  })
})
