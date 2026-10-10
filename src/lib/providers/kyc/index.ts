/**
 * KYC provider interface. Results never contain the raw NIN/BVN: only match flags, a provider
 * reference and (for NIN) a photo reference used for the face match.
 */
export type CheckStatus = 'passed' | 'failed'

export type PersonInput = { firstName: string; lastName: string; dob: string }

export type NinResult = {
  status: CheckStatus
  nameMatch: boolean
  dobMatch: boolean
  photoRef?: string
  providerRef?: string
}
export type BvnResult = {
  status: CheckStatus
  nameMatch: boolean
  dobMatch: boolean
  providerRef?: string
}
export type CacResult = {
  status: CheckStatus
  nameMatch: boolean
  registeredName?: string
  directors?: string[]
  providerRef?: string
}
export type LivenessSession = {
  sessionId: string
  /** Hosted flow to open, or a token for the provider's web SDK. Mock: neither. */
  sessionUrl?: string
  sdkToken?: string
}
export type LivenessResult = {
  status: 'pending' | 'passed' | 'failed'
  livenessPassed: boolean
  faceMatchScore: number | null
}

export type KycProvider = {
  name: 'mock' | 'qoreid' | 'dojah'
  verifyNin(input: PersonInput & { nin: string }): Promise<NinResult>
  verifyBvn(input: PersonInput & { bvn: string }): Promise<BvnResult>
  verifyCac(input: { rcNumber: string; businessName: string }): Promise<CacResult>
  createLivenessSession(input: {
    subjectId: string
    ninPhotoRef?: string
  }): Promise<LivenessSession>
  /** `now` is injectable for tests. */
  getLivenessResult(sessionId: string, now?: number): Promise<LivenessResult>
}

/** KYC_PROVIDER=mock (default) | qoreid | dojah. */
export async function getKycProvider(): Promise<KycProvider> {
  switch (process.env.KYC_PROVIDER) {
    case 'qoreid':
      return (await import('./qoreid')).qoreidKycProvider
    case 'dojah':
      return (await import('./dojah')).dojahKycProvider
    default:
      return (await import('./mock')).mockKycProvider
  }
}
