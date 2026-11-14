import { describe, expect, it } from 'vitest'

import { HOME_FALLBACK_COUNT, homePlanSplit } from './home'

const plan = (slug: string, showOnHome = false) => ({ slug, showOnHome })
const slugs = (ps: { slug: string }[]) => ps.map((p) => p.slug)

describe('homePlanSplit (which plans the home page shows at once)', () => {
  it('ticked plans first, in their order; the rest under "See more"', () => {
    const s = homePlanSplit([plan('a', true), plan('b'), plan('c', true), plan('d')])
    expect(slugs(s.shown)).toEqual(['a', 'c'])
    expect(slugs(s.more)).toEqual(['b', 'd'])
  })
  it('no plan ticked: the first three by order', () => {
    expect(HOME_FALLBACK_COUNT).toBe(3)
    const s = homePlanSplit(['a', 'b', 'c', 'd', 'e'].map((x) => plan(x)))
    expect(slugs(s.shown)).toEqual(['a', 'b', 'c'])
    expect(slugs(s.more)).toEqual(['d', 'e'])
  })
  it('every plan ticked: nothing more to show', () => {
    expect(homePlanSplit([plan('a', true), plan('b', true)]).more).toEqual([])
  })
  it('no plans at all', () => {
    expect(homePlanSplit([])).toEqual({ shown: [], more: [] })
  })
})
