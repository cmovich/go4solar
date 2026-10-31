import { describe, expect, it } from 'vitest'

import { buildContactSchema, buildSelectionSchema, systemSummary } from './schema'

describe('buildSelectionSchema', () => {
  it('accepts a selection and drops zero quantities', () => {
    const p = buildSelectionSchema.parse({
      scope: 'complete',
      state: 'Lagos',
      items: [
        { sku: 'INV-5', qty: 1 },
        { sku: 'PNL-550', qty: 0 },
      ],
      site: { mounting: 'roof' },
      installer: 'go4solar',
    })
    expect(p.items).toEqual([{ sku: 'INV-5', qty: 1 }])
  })
  it('refuses nonsense', () => {
    expect(
      buildSelectionSchema.safeParse({
        scope: 'all',
        state: 'Lagos',
        items: [],
        site: {},
        installer: 'go4solar',
      }).success,
    ).toBe(false)
    expect(
      buildSelectionSchema.safeParse({
        scope: 'complete',
        state: 'Narnia',
        items: [],
        site: {},
        installer: 'go4solar',
      }).success,
    ).toBe(false)
    expect(
      buildSelectionSchema.safeParse({
        scope: 'complete',
        state: 'Lagos',
        items: [{ sku: 'X', qty: 5000 }],
        site: {},
        installer: 'go4solar',
      }).success,
    ).toBe(false)
  })
})

describe('buildContactSchema', () => {
  it('normalises the phone and needs consent', () => {
    const c = buildContactSchema.parse({
      firstName: 'Love',
      surname: 'Lounge',
      phone: '0803 123 4567',
      email: 'love@example.org',
      lga: 'Ikeja',
      consent: true,
    })
    expect(c.phone).toBe('+2348031234567')
    expect(
      buildContactSchema.safeParse({ ...c, phone: '0803 123 4567', consent: false }).success,
    ).toBe(false)
  })
})

describe('systemSummary (stored with a builder quote)', () => {
  it('inverter, battery total and panels from the selection', () => {
    expect(
      systemSummary(
        { inverterKva: 5, batteries: [{ kwh: 5, qty: 2 }], panels: { watts: 550, count: 6 } },
        0.81,
      ),
    ).toEqual({
      inverterKva: 5,
      batteryKwh: 10,
      panelCount: 6,
      panelKw: 3.3,
      backupHoursFullLoad: 2, // 10 × 0.81 ÷ (5 kVA × 0.8)
      realisticBackupHours: null,
    })
    expect(systemSummary({ inverterKva: null, batteries: [], panels: null }, 0.81)).toMatchObject({
      inverterKva: 0,
      batteryKwh: 0,
      backupHoursFullLoad: 0,
    })
  })
})
