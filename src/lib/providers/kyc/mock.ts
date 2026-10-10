import type { KycProvider } from './index'

const LIVENESS_MS = 2000
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Realistic mock: NINs starting with 1 (e.g. 11111111111) pass, 00000000000 fails; BVN 22222222222 passes;
 * CAC RC123456 (or 1234567) passes; liveness passes 2 s after the session starts.
 */
export const mockKycProvider: KycProvider = {
  name: 'mock',

  async verifyNin({ nin }) {
    await wait(400)
    const ok = /^1\d{10}$/.test(nin)
    return ok
      ? {
          status: 'passed',
          nameMatch: true,
          dobMatch: true,
          photoRef: 'mock-photo',
          providerRef: `mock-nin-${Date.now()}`,
        }
      : {
          status: 'failed',
          nameMatch: false,
          dobMatch: false,
          providerRef: `mock-nin-${Date.now()}`,
        }
  },

  async verifyBvn({ bvn }) {
    await wait(400)
    const ok = bvn === '22222222222'
    return {
      status: ok ? 'passed' : 'failed',
      nameMatch: ok,
      dobMatch: ok,
      providerRef: `mock-bvn-${Date.now()}`,
    }
  },

  async verifyCac({ rcNumber, businessName }) {
    await wait(400)
    const rc = rcNumber.toUpperCase().replace(/\s/g, '')
    const ok = rc === 'RC123456' || rc === '1234567'
    return ok
      ? {
          status: 'passed',
          nameMatch: true,
          registeredName: businessName.toUpperCase() + ' LIMITED',
          directors: ['Amaka Okoro'],
          providerRef: `mock-cac-${Date.now()}`,
        }
      : { status: 'failed', nameMatch: false, providerRef: `mock-cac-${Date.now()}` }
  },

  async createLivenessSession() {
    return { sessionId: `mock-${Date.now()}` }
  },

  async getLivenessResult(sessionId, now = Date.now()) {
    const started = Number(sessionId.replace(/^mock-/, ''))
    if (!Number.isFinite(started))
      return { status: 'failed', livenessPassed: false, faceMatchScore: null }
    if (now - started < LIVENESS_MS)
      return { status: 'pending', livenessPassed: false, faceMatchScore: null }
    return { status: 'passed', livenessPassed: true, faceMatchScore: 0.93 }
  },
}
