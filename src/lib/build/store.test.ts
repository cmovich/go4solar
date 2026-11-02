import { describe, expect, it } from 'vitest'

import { makeItem } from '@/lib/load/load.fixture'

import {
  kvaFromItems,
  parseBuilderState,
  sanitiseBuilderState,
  serialiseBuilderState,
  setChoice,
  choiceKey,
} from './store'

describe('builder progress (saved on this device)', () => {
  it('round-trips and drops a corrupt or old save', () => {
    const state = {
      step: 'items' as const,
      scope: 'complete' as const,
      state: 'Lagos' as const,
      items: [{ sku: 'INV-5', qty: 1 }],
      site: {},
      installer: null,
      depositPct: 20,
      tenure: 12 as const,
      loadKva: 3,
    }
    expect(parseBuilderState(serialiseBuilderState(state))).toEqual(state)
    expect(parseBuilderState('nonsense')).toBeNull()
    expect(parseBuilderState(JSON.stringify({ version: 0 }))).toBeNull()
    expect(parseBuilderState(null)).toBeNull()
  })
})

describe('kvaFromItems (the calculator’s load as kVA)', () => {
  it('running watts ÷ 0.8, rounded up to 0.1 kVA', () => {
    expect(kvaFromItems([makeItem({ id: 'a', watts: 1000, qty: 2 })])).toBe(2.5)
    expect(kvaFromItems([makeItem({ id: 'a', watts: 410 })])).toBe(0.6)
    expect(kvaFromItems([])).toBeNull()
  })
})

describe('setChoice (one item per bar; accessories one per kind)', () => {
  const items = [{ sku: 'INV-5', qty: 1 }]
  const groupOf = (sku: string) =>
    sku.startsWith('INV') ? 'inverter' : sku.startsWith('DCB') ? 'acc:dc_breaker' : 'panels'
  it('replaces the choice in the same bar and keeps the others', () => {
    expect(setChoice(items, 'INV-7.5', 1, groupOf)).toEqual([{ sku: 'INV-7.5', qty: 1 }])
    expect(setChoice(items, 'PNL-550', 6, groupOf)).toEqual([
      { sku: 'INV-5', qty: 1 },
      { sku: 'PNL-550', qty: 6 },
    ])
  })
  it('qty 0 removes it', () => {
    expect(setChoice(items, 'INV-5', 0, groupOf)).toEqual([])
  })
  it('choiceKey: wires and pipes are their own bars; other accessories by kind', () => {
    expect(choiceKey({ group: 'dc_wire', kind: 'dc_wire' })).toBe('dc_wire')
    expect(choiceKey({ group: 'accessories', kind: 'dc_breaker' })).toBe('acc:dc_breaker')
    expect(choiceKey({ group: 'inverter', kind: null })).toBe('inverter')
  })
})

describe('sanitiseBuilderState (saved progress checked against today\u2019s catalogue)', () => {
  const base = {
    step: 'items' as const,
    scope: 'complete' as const,
    state: 'Lagos' as const,
    items: [{ sku: 'INV-5', qty: 1 }],
    site: {},
    installer: null,
    depositPct: 20,
    tenure: 12 as const,
  }
  const known = new Set(['INV-5', 'PNL-550'])

  it('drops items no longer in the catalogue', () => {
    const s = sanitiseBuilderState(
      {
        ...base,
        items: [
          { sku: 'GONE', qty: 2 },
          { sku: 'INV-5', qty: 1 },
        ],
      },
      known,
    )
    expect(s.items).toEqual([{ sku: 'INV-5', qty: 1 }])
  })

  it('without a state or a choice of scope, starts at the first screen', () => {
    expect(sanitiseBuilderState({ ...base, state: undefined }, known).step).toBe('start')
    expect(sanitiseBuilderState({ ...base, scope: undefined, step: 'summary' }, known).step).toBe(
      'start',
    )
  })

  it('later screens with nothing chosen go back to the items', () => {
    const s = sanitiseBuilderState(
      { ...base, step: 'summary', items: [{ sku: 'GONE', qty: 1 }] },
      known,
    )
    expect(s.step).toBe('items')
  })

  it('a valid save is kept as it is', () => {
    expect(sanitiseBuilderState(base, known)).toEqual(base)
  })

  it('parseBuilderState drops impossible numbers', () => {
    const raw = (o: object) => JSON.stringify({ version: 1, state: { ...base, ...o } })
    expect(parseBuilderState(raw({ items: [{ sku: 'INV-5', qty: Number.NaN }] }))).toBeNull()
    expect(parseBuilderState(raw({ loadKva: 5000 }))).toBeNull()
    expect(parseBuilderState(raw({ items: [{ sku: 'INV-5', qty: 1e9 }] }))).toBeNull()
  })
})
