import { describe, expect, it } from 'vitest'

import { mockKycProvider } from './mock'

const kyc = mockKycProvider
const person = { firstName: 'Amaka', lastName: 'Okoro', dob: '1990-05-14' }

describe('KYC provider contract (mock adapter)', () => {
  it('NIN 11111111111 passes with name/DOB match and a photo reference', async () => {
    const r = await kyc.verifyNin({ nin: '11111111111', ...person })
    expect(r).toMatchObject({ status: 'passed', nameMatch: true, dobMatch: true })
    expect(r.photoRef).toBeTruthy()
    expect(r.providerRef).toBeTruthy()
  })

  it('any other NIN starting with 1 passes (so a guarantor can differ from the applicant)', async () => {
    expect((await kyc.verifyNin({ nin: '12345678901', ...person })).status).toBe('passed')
  })

  it('NIN 00000000000 fails', async () => {
    expect((await kyc.verifyNin({ nin: '00000000000', ...person })).status).toBe('failed')
  })

  it('BVN 22222222222 passes; anything else fails', async () => {
    expect((await kyc.verifyBvn({ bvn: '22222222222', ...person })).status).toBe('passed')
    expect((await kyc.verifyBvn({ bvn: '33333333333', ...person })).status).toBe('failed')
  })

  it('CAC RC123456 passes and returns the registered name and directors', async () => {
    const r = await kyc.verifyCac({ rcNumber: 'RC123456', businessName: 'Amaka Stores' })
    expect(r.status).toBe('passed')
    expect(r.nameMatch).toBe(true)
    expect(r.registeredName).toBeTruthy()
    expect(r.directors?.length).toBeGreaterThan(0)
    expect((await kyc.verifyCac({ rcNumber: '1234567', businessName: 'X' })).status).toBe('passed')
    expect((await kyc.verifyCac({ rcNumber: 'RC999999', businessName: 'X' })).status).toBe('failed')
  })

  it('liveness: a session, then pending until ~2 s, then passed with a face-match score', async () => {
    const session = await kyc.createLivenessSession({ subjectId: 'app-1', ninPhotoRef: 'photo' })
    expect(session.sessionId).toBeTruthy()
    const now = Date.now()
    expect((await kyc.getLivenessResult(session.sessionId, now)).status).toBe('pending')
    const later = await kyc.getLivenessResult(session.sessionId, now + 2500)
    expect(later).toMatchObject({ status: 'passed', livenessPassed: true })
    expect(later.faceMatchScore).toBeGreaterThan(0.8)
  })

  it('never echoes the raw NIN/BVN back', async () => {
    const r = await kyc.verifyNin({ nin: '11111111111', ...person })
    expect(JSON.stringify(r)).not.toContain('11111111111')
  })
})
