import { describe, expect, it } from 'vitest'

import { PLAN_IMAGE_MAX_WIDTH, planImagePath, planImageSize } from './image'

describe('planImageSize (4:3, never enlarged)', () => {
  it('a wide enough photo becomes 800 × 600', () => {
    expect(planImageSize(876, 690)).toEqual({ width: 800, height: 600 })
  })
  it('a small photo keeps its own width (no blur from enlarging)', () => {
    expect(planImageSize(618, 456)).toEqual({ width: 608, height: 456 })
  })
  it('a tall photo is limited by its height', () => {
    expect(planImageSize(600, 300)).toEqual({ width: 400, height: 300 })
  })
  it('the limit is 800 px wide', () => {
    expect(PLAN_IMAGE_MAX_WIDTH).toBe(800)
  })
})

describe('planImagePath', () => {
  it('a new name for every new picture (no stale copy in a browser cache)', () => {
    expect(planImagePath('oga-boss', 'a1b2c3d4e5f6')).toBe('plan/oga-boss-a1b2c3d4.webp')
  })
})
