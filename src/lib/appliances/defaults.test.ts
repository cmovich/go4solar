import { describe, expect, it } from 'vitest'

import { dayNightDefaults } from './defaults'

describe('dayNightDefaults (appliance_library row → calculator defaults)', () => {
  it('uses the row’s own day/night/essential columns (migration 0024)', () => {
    expect(
      dayNightDefaults({
        category: 'cooling',
        default_hours: 8,
        default_day_hours: 3,
        default_night_hours: 5,
        default_essential: true,
      }),
    ).toEqual({ defaultDayHours: 3, defaultNightHours: 5, defaultEssential: true })
  })

  it('before the migration: splits the hours the way the migration does', () => {
    const split = (category: string, default_hours: number) =>
      dayNightDefaults({ category, default_hours })
    expect(split('kitchen', 24)).toMatchObject({ defaultDayHours: 12, defaultNightHours: 12 })
    expect(split('lighting', 6)).toMatchObject({ defaultDayHours: 0, defaultNightHours: 6 })
    expect(split('laundry', 1)).toMatchObject({ defaultDayHours: 1, defaultNightHours: 0 })
    expect(split('tv_electronics', 6)).toMatchObject({
      defaultDayHours: 2.5,
      defaultNightHours: 3.5,
    })
    expect(split('cooling', 8)).toMatchObject({ defaultDayHours: 3, defaultNightHours: 5 })
    // Pre-ticks follow the default rule (lights, fans, TVs, phone charging).
    expect(
      dayNightDefaults({ category: 'lighting', name: 'LED bulb', default_hours: 6 })
        .defaultEssential,
    ).toBe(true)
    expect(
      dayNightDefaults({ category: 'kitchen', name: 'Fridge', default_hours: 24 }).defaultEssential,
    ).toBe(false)
  })
})
