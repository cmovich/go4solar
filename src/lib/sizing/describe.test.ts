import { describe, expect, it } from 'vitest'

import { makeItem } from '@/lib/load/load.fixture'
import { computeLoadTotals } from '@/lib/load/totals'

import { DEFAULT_SIZING_SETTINGS, assumedEquipment } from './defaults'
import { backupLines } from './describe'
import { sizeSystem } from './size'
import type { GridInput, Plan, SystemSize } from './types'

const home = computeLoadTotals([
  makeItem({ id: 'e', watts: 1000, essential: true, dayHours: 6, nightHours: 6, hoursPerDay: 12 }),
  makeItem({ id: 'r', watts: 1000, dayHours: 6, nightHours: 6, hoursPerDay: 12 }),
])
const sized = (plan: Plan, grid: GridInput | null = null, settings = DEFAULT_SIZING_SETTINGS) =>
  sizeSystem(home, plan, settings, {
    sun: { annual: 5.09, rainy: 4.46 },
    grid,
    equipment: assumedEquipment(),
  })

describe('backupLines (what the plan card says)', () => {
  it('no grid: backup with the plan’s items on, at typical night use, the rainy-season note, why the inverter is bigger', () => {
    const lines = backupLines(sized('comfort'), 'comfort')
    expect(lines).toEqual([
      'Backup with everything on ≈ 8.1 h',
      'At your typical night use ≈ 16.2 h (all night)',
      'In the rainy season, expect less backup on cloudy days.',
      'Inverter upsized to 7.5 kVA to connect your 14 panels.',
    ])
  })

  it('Essentials says "your essential items"', () => {
    expect(backupLines(sized('essential'), 'essential')[0]).toBe(
      'Backup with your essential items on ≈ 8.1 h',
    )
  })

  it('with grid: backup with grid AND on days with no grid; 24-hour has no rainy note', () => {
    const lines = backupLines(
      sized('independence', { mode: 'A', pattern: 'daily', dayHours: 0, nightHours: 4 }),
      'independence',
    )
    expect(lines).toContain('With grid as you described ≈ 12 h (all night)')
    expect(lines).toContain('On days with no grid, backup ≈ 7.1 h')
    expect(lines.join(' ')).not.toMatch(/rainy/)
  })

  it('a rounded-down battery shows the shortfall', () => {
    const lines = backupLines(
      sized(
        'independence',
        { mode: 'A', pattern: 'daily', dayHours: 0, nightHours: 4 },
        {
          ...DEFAULT_SIZING_SETTINGS,
          allowRoundDown: true,
        },
      ),
      'independence',
    )
    expect(lines.some((l) => /^Battery rounded down: about .* h short of the plan$/.test(l))).toBe(
      true,
    )
  })

  it('estimates stored before Part B: the two old backup figures only', () => {
    const old: SystemSize = {
      inverterKva: 1,
      batteryKwh: 7.5,
      panelCount: 4,
      panelKw: 2.2,
      backupHoursFullLoad: 11.3,
      realisticBackupHours: null,
    }
    expect(backupLines(old, 'comfort')).toEqual(['Backup with everything on ≈ 11.3 h'])
  })
})
