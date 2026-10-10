import 'server-only'

import type { KycProvider } from './index'

/**
 * QoreID adapter (REST + Web SDK for liveness). Credentials: QOREID_CLIENT_ID / QOREID_SECRET.
 *
 * IMPORTANT: written against QoreID's published API shape but NOT yet exercised against their
 * sandbox. Before switching KYC_PROVIDER=qoreid, run the contract tests against the sandbox and
 * confirm the endpoint paths and response fields below (marked VERIFY).
 */
const BASE = process.env.QOREID_BASE_URL ?? 'https://api.qoreid.com'

let cached: { token: string; expiresAt: number } | null = null

async function token(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token
  const clientId = process.env.QOREID_CLIENT_ID
  const secret = process.env.QOREID_SECRET
  if (!clientId || !secret) throw new Error('Missing QOREID_CLIENT_ID / QOREID_SECRET')
  const res = await fetch(`${BASE}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientId, secret }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`QoreID auth failed (${res.status})`)
  const body = (await res.json()) as { accessToken?: string; expiresIn?: number }
  if (!body.accessToken) throw new Error('QoreID auth: no token')
  cached = { token: body.accessToken, expiresAt: Date.now() + (body.expiresIn ?? 3600) * 1000 }
  return cached.token
}

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${await token()}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  })
  // Never include the request (it contains the NIN/BVN) in errors or logs.
  if (!res.ok && res.status !== 404)
    throw new Error(`QoreID ${path.split('/')[3] ?? 'call'} failed (${res.status})`)
  return res.status === 404 ? {} : ((await res.json()) as Record<string, unknown>)
}

function matched(summary: unknown, field: string): boolean {
  // VERIFY: QoreID returns a fieldMatches object in the summary.
  const fm = (summary as { fieldMatches?: Record<string, boolean> } | undefined)?.fieldMatches
  return fm?.[field] === true
}

export const qoreidKycProvider: KycProvider = {
  name: 'qoreid',

  async verifyNin({ nin, firstName, lastName, dob }) {
    const r = await post(`/v1/ng/identities/nin/${encodeURIComponent(nin)}`, {
      firstname: firstName,
      lastname: lastName,
      dob,
    }) // VERIFY
    const summary = (r.summary as Record<string, unknown> | undefined)?.nin_check
    const status =
      (summary as { status?: string } | undefined)?.status === 'EXACT_MATCH' ? 'passed' : 'failed'
    return {
      status,
      nameMatch: matched(summary, 'firstname') && matched(summary, 'lastname'),
      dobMatch: matched(summary, 'dob'),
      photoRef: typeof r.id === 'number' || typeof r.id === 'string' ? String(r.id) : undefined,
      providerRef: typeof r.id === 'number' || typeof r.id === 'string' ? String(r.id) : undefined,
    }
  },

  async verifyBvn({ bvn, firstName, lastName, dob }) {
    const r = await post(`/v1/ng/identities/bvn-basic/${encodeURIComponent(bvn)}`, {
      firstname: firstName,
      lastname: lastName,
      dob,
    }) // VERIFY
    const summary = (r.summary as Record<string, unknown> | undefined)?.bvn_check
    return {
      status:
        (summary as { status?: string } | undefined)?.status === 'EXACT_MATCH'
          ? 'passed'
          : 'failed',
      nameMatch: matched(summary, 'firstname') && matched(summary, 'lastname'),
      dobMatch: matched(summary, 'dob'),
      providerRef: r.id === undefined ? undefined : String(r.id),
    }
  },

  async verifyCac({ rcNumber, businessName }) {
    const r = await post(`/v1/ng/identities/cac-basic`, { regNumber: rcNumber }) // VERIFY
    const company =
      (r.cac as { companyName?: string; directors?: { name?: string }[] } | undefined) ?? {}
    const registeredName = company.companyName
    const nameMatch =
      !!registeredName &&
      registeredName.toLowerCase().includes(businessName.toLowerCase().split(' ')[0] ?? '')
    return {
      status: registeredName ? 'passed' : 'failed',
      nameMatch,
      registeredName,
      directors: (company.directors ?? []).map((d) => d.name ?? '').filter(Boolean),
      providerRef: r.id === undefined ? undefined : String(r.id),
    }
  },

  async createLivenessSession({ subjectId, ninPhotoRef }) {
    // VERIFY: QoreID Web SDK session creation (returns a token the SDK uses in the browser).
    const r = await post(`/v1/liveness/sessions`, {
      customerReference: subjectId,
      verificationId: ninPhotoRef,
    })
    return {
      sessionId: String(r.sessionId ?? r.id ?? ''),
      sdkToken: typeof r.token === 'string' ? r.token : undefined,
    }
  },

  async getLivenessResult(sessionId) {
    const res = await fetch(`${BASE}/v1/liveness/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { authorization: `Bearer ${await token()}` },
      signal: AbortSignal.timeout(20_000),
    }) // VERIFY
    if (!res.ok) return { status: 'pending', livenessPassed: false, faceMatchScore: null }
    const r = (await res.json()) as {
      status?: string
      liveness?: boolean
      faceMatch?: { confidence?: number }
    }
    if (r.status === 'PENDING' || r.status === 'IN_PROGRESS') {
      return { status: 'pending', livenessPassed: false, faceMatchScore: null }
    }
    const passed = r.liveness === true && (r.faceMatch?.confidence ?? 0) >= 0.8
    return {
      status: passed ? 'passed' : 'failed',
      livenessPassed: r.liveness === true,
      faceMatchScore: r.faceMatch?.confidence ?? null,
    }
  },
}
