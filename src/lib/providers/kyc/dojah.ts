import 'server-only'

import type { KycProvider } from './index'

/** Backup provider (Dojah). Same interface; not implemented yet — selecting it fails loudly. */
function notYet(): never {
  throw new Error('The Dojah KYC adapter is not implemented yet. Use KYC_PROVIDER=mock or qoreid.')
}

export const dojahKycProvider: KycProvider = {
  name: 'dojah',
  verifyNin: async () => notYet(),
  verifyBvn: async () => notYet(),
  verifyCac: async () => notYet(),
  createLivenessSession: async () => notYet(),
  getLivenessResult: async () => notYet(),
}
