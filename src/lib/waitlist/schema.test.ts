import { describe, expect, it } from 'vitest'

describe('installer coverage: any of the 37 states', () => {
  it('an installer can pick any state; "Other" is no longer a choice', async () => {
    const { installerSchema, INSTALLER_STATES, INSTALLER_STATE_LABELS } = await import('./schema')
    expect(INSTALLER_STATES).toHaveLength(37)
    const base = {
      name: 'Bayo Installs',
      phone: '08031234567',
      yearsInBusiness: 5,
      installationsCompleted: 40,
      cacRegistered: true,
      consent: true as const,
    }
    expect(installerSchema.safeParse({ ...base, states: ['Kano', 'FCT', 'Rivers'] }).success).toBe(
      true,
    )
    expect(installerSchema.safeParse({ ...base, states: ['Other'] }).success).toBe(false)
    // Older sign-ups that chose "Other" still show a label in admin.
    expect(INSTALLER_STATE_LABELS.FCT).toBe('Abuja (FCT)')
    expect(INSTALLER_STATE_LABELS.Other).toBe('Other')
  })
})
