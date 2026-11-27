import { describe, expect, it } from 'vitest'

import {
  CONFIG_TABLES,
  MEDIA_FOLDERS,
  NEVER_COPY,
  PRIMARY_KEY,
  rewriteHost,
  cleanRow,
  supabaseRef,
  targetProblem,
} from './copy'

describe('staging copy plan', () => {
  it('copies only settings and price tables, never customer data', () => {
    for (const t of NEVER_COPY) expect(CONFIG_TABLES).not.toContain(t)
    for (const t of ['waitlist_consumers', 'profiles', 'quotes', 'applications', 'testimonials'])
      expect(NEVER_COPY).toContain(t)
    for (const t of CONFIG_TABLES) expect(PRIMARY_KEY[t]).toBeTruthy()
    // Funders before the routing rules that point at them.
    expect(CONFIG_TABLES.indexOf('funders')).toBeLessThan(
      CONFIG_TABLES.indexOf('funder_routing_rules'),
    )
  })

  it('reads the project ref from a Supabase URL', () => {
    expect(supabaseRef('https://moqcgqrcmtzovsmtwkna.supabase.co')).toBe('moqcgqrcmtzovsmtwkna')
    expect(supabaseRef('not a url')).toBeNull()
  })

  it('refuses the live database (or the same database) as the target', () => {
    const live = 'https://moqcgqrcmtzovsmtwkna.supabase.co'
    expect(targetProblem(live, live)).toMatch(/live/i)
    expect(targetProblem(live, 'https://abcdefghijklmnopqrst.supabase.co')).toBeNull()
    expect(
      targetProblem(
        'https://abcdefghijklmnopqrst.supabase.co',
        'https://abcdefghijklmnopqrst.supabase.co',
      ),
    ).toMatch(/same/i)
    expect(targetProblem(live, '')).toMatch(/target/i)
  })

  it('drops links to people and personal contact details', () => {
    expect(
      cleanRow('funders', {
        id: 'f1',
        name: 'Trade Lenda',
        contact_email: 'someone@example.com',
        created_by: 'u1',
        updated_by: 'u2',
      }),
    ).toEqual({
      id: 'f1',
      name: 'Trade Lenda',
      contact_email: null,
      created_by: null,
      updated_by: null,
    })
    expect(
      cleanRow('pricing_rates', { tenure_months: 12, spread: 0.1, pricing_rate: 0.3 }),
    ).toEqual({
      tenure_months: 12,
      spread: 0.1,
    })
    expect(cleanRow('components', { id: 'c1', sku: 'PNL-550' })).toEqual({
      id: 'c1',
      sku: 'PNL-550',
    })
  })

  it('points picture links at staging; copies no photos of people', () => {
    const live = 'https://moqcgqrcmtzovsmtwkna.supabase.co'
    const staging = 'https://abcdefghijklmnopqrst.supabase.co/'
    expect(
      rewriteHost(
        {
          image_url: `${live}/storage/v1/object/public/site-media/plan/a.webp`,
          n: 3,
          tags: [`${live}/x`],
        },
        live,
        staging,
      ),
    ).toEqual({
      image_url:
        'https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/site-media/plan/a.webp',
      n: 3,
      tags: ['https://abcdefghijklmnopqrst.supabase.co/x'],
    })
    expect([...MEDIA_FOLDERS].sort()).toEqual(['logo', 'plan', 'roof'])
  })
})
