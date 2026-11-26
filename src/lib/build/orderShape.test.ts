import { describe, expect, it } from 'vitest'

import { builderSteps, nextBuilderStep, orderShape, prevBuilderStep } from './orderShape'

describe('order shape (installation and delivery rule)', () => {
  it('one type of product, any quantity, is a single-item order', () => {
    expect(orderShape(['inverter'])).toBe('single')
    expect(orderShape(['battery', 'battery'])).toBe('single')
    expect(orderShape(['panels'])).toBe('single')
    // Accessories never make it a two-type order (cables with one inverter stay single).
    expect(orderShape(['inverter', 'accessories', 'dc_wire'])).toBe('single')
    expect(orderShape(['accessories'])).toBe('single')
  })
  it('two or more types is a system (ask about installer and delivery)', () => {
    expect(orderShape(['inverter', 'battery'])).toBe('multi')
    expect(orderShape(['inverter', 'panels'])).toBe('multi')
    expect(orderShape(['inverter', 'battery', 'panels', 'accessories'])).toBe('multi')
    expect(orderShape(['battery', 'panels'])).toBe('multi')
    expect(orderShape(['lights', 'panels'])).toBe('multi')
  })
  it('nothing chosen yet', () => {
    expect(orderShape([])).toBe('empty')
  })
})

describe('builder question order', () => {
  const base = { scope: 'complete' as const, site: {} }
  it('single item, no panels: items → summary (no installer, delivery, mounting or roof)', () => {
    expect(builderSteps({ ...base, shape: 'single', panels: false })).toEqual([
      'start',
      'items',
      'summary',
    ])
  })
  it('system without panels: installer and delivery early, no mounting or roof', () => {
    expect(builderSteps({ ...base, shape: 'multi', panels: false })).toEqual([
      'start',
      'items',
      'installer',
      'wire',
      'summary',
    ])
  })
  it('panels: mounting first; roof type, rack and height only for a roof', () => {
    expect(
      builderSteps({ ...base, shape: 'multi', panels: true, site: { mounting: 'roof' } }),
    ).toEqual([
      'start',
      'items',
      'installer',
      'mounting',
      'roofType',
      'rack',
      'height',
      'wire',
      'summary',
    ])
    expect(
      builderSteps({ ...base, shape: 'multi', panels: true, site: { mounting: 'ground' } }),
    ).toEqual(['start', 'items', 'installer', 'mounting', 'wire', 'summary'])
    // Not answered yet: the roof questions are not shown before the mounting answer.
    expect(builderSteps({ ...base, shape: 'single', panels: true })).toEqual([
      'start',
      'items',
      'mounting',
      'summary',
    ])
    expect(
      builderSteps({ ...base, shape: 'single', panels: true, site: { mounting: 'roof' } }),
      // No installation for a single item, so the building height is not asked.
    ).toEqual(['start', 'items', 'mounting', 'roofType', 'rack', 'summary'])
  })
  it('"just some items" asks what they already have first', () => {
    expect(builderSteps({ ...base, scope: 'some', shape: 'single', panels: false })).toEqual([
      'start',
      'existing',
      'items',
      'summary',
    ])
  })
  it('next and back follow the same list', () => {
    const f = {
      ...base,
      shape: 'multi' as const,
      panels: true,
      site: { mounting: 'carpark' as const },
    }
    expect(nextBuilderStep('items', f)).toBe('installer')
    expect(nextBuilderStep('installer', f)).toBe('mounting')
    expect(nextBuilderStep('mounting', f)).toBe('wire')
    expect(prevBuilderStep('wire', f)).toBe('mounting')
    expect(prevBuilderStep('start', f)).toBeNull()
    expect(nextBuilderStep('summary', f)).toBe('summary')
  })
})
