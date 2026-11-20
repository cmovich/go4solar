/**
 * SPEWA queue test data (service role). Test applications only (profiles.is_test): rows put in
 * the queue here are marked is_test and stay as labelled test data.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key!,
      Authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`)
  return (await res.json()) as T
}

/** True once migration 0038 (SPEWA routing) is applied. */
export async function spewaMigrated(): Promise<boolean> {
  if (!url || !key) return false
  const res = await fetch(`${url}/rest/v1/funder_queue?select=application_id&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  return res.ok
}

type App = {
  id: string
  consumer_id: string
  quote_id: string | null
  credit_flags: { livenessDeferred?: boolean } | null
}

/**
 * Test applications waiting for a decision (deposit paid, loan pending approval, quote on file)
 * that SPEWA has not decided yet (not queued, or queued and still waiting). `ready` = every
 * approval check passes (signed, guarantor signed, KYC). `skip` = ids already taken.
 */
export async function freeTestFiles(
  n: number,
  ready = false,
  skip: string[] = [],
): Promise<string[]> {
  const [apps, queued] = await Promise.all([
    rest<App[]>(
      'applications?select=id,consumer_id,quote_id,credit_flags&status=eq.submitted&order=submitted_at.desc&limit=300',
    ),
    rest<{ application_id: string }[]>('funder_queue?select=application_id&decision=neq.pending'),
  ])
  const inQueue = new Set([...queued.map((q) => q.application_id), ...skip])
  // Only these applicants' test flags (there are more than 1,000 test accounts: one request
  // returns at most 1,000 rows).
  const owners = [...new Set(apps.map((a) => a.consumer_id))]
  const test = new Set<string>()
  for (let i = 0; i < owners.length; i += 100) {
    const ids = owners.slice(i, i + 100).join(',')
    for (const t of await rest<{ id: string }[]>(
      `profiles?select=id&is_test=eq.true&id=in.(${ids})`,
    ))
      test.add(t.id)
  }
  const out: string[] = []
  for (const a of apps) {
    if (out.length >= n) break
    if (inQueue.has(a.id) || !test.has(a.consumer_id) || !a.quote_id) continue
    // Some old test files have a quote with nothing in it (no instalments): skip them.
    const quote = await rest<{ n: unknown }[]>(
      `quotes?select=n:result->instalments&id=eq.${a.quote_id}`,
    )
    if (!Array.isArray(quote[0]?.n)) continue
    const [loan] = await rest<{ status: string }[]>(`loans?select=status&application_id=eq.${a.id}`)
    if (loan?.status !== 'pending_approval') continue
    if (ready && !(await approvable(a))) continue
    out.push(a.id)
  }
  if (out.length < n) throw new Error(`only ${out.length} free test files (wanted ${n})`)
  return out
}

async function approvable(a: App): Promise<boolean> {
  const [deposit, signed, guarantee, checks] = await Promise.all([
    rest<unknown[]>(
      `payments?select=id&application_id=eq.${a.id}&kind=eq.deposit&status=eq.success&limit=1`,
    ),
    rest<unknown[]>(`agreements?select=id&application_id=eq.${a.id}&type=eq.consumer&limit=1`),
    rest<{ status: string }[]>(
      `guarantees?select=status&application_id=eq.${a.id}&order=created_at.desc&limit=1`,
    ),
    rest<{ kind: string; status: string }[]>(
      `kyc_checks?select=kind,status&subject_id=eq.${a.id}&order=created_at`,
    ),
  ])
  const latest = (k: string) => checks.filter((c) => c.kind === k).at(-1)?.status
  return (
    deposit.length > 0 &&
    signed.length > 0 &&
    guarantee[0]?.status === 'signed' &&
    latest('nin') === 'passed' &&
    latest('bvn') === 'passed' &&
    (Boolean(a.credit_flags?.livenessDeferred) || latest('liveness') === 'passed')
  )
}

/** Put test files in the SPEWA queue (as routing would after the deposit). */
export async function routeToSpewa(ids: string[]): Promise<void> {
  const [setting] = await rest<{ value: { funderId: string } }[]>(
    'settings?select=value&key=eq.funder_routing',
  )
  await rest('funder_queue?on_conflict=application_id', {
    method: 'POST',
    headers: { Prefer: 'return=representation,resolution=ignore-duplicates' },
    body: JSON.stringify(
      ids.map((id) => ({
        application_id: id,
        funder_id: setting!.value.funderId,
        deposit_share: 0.3,
        decision: 'pending',
        is_test: true,
      })),
    ),
  })
}

export const queueRow = async (id: string) =>
  (
    await rest<{ decision: string; decided_by: string | null; cheques_count: number | null }[]>(
      `funder_queue?select=decision,decided_by,cheques_count&application_id=eq.${id}`,
    )
  )[0]

export const loanOf = async (id: string) =>
  (
    await rest<{ status: string; funder_id: string | null }[]>(
      `loans?select=status,funder_id&application_id=eq.${id}`,
    )
  )[0]

export const auditRows = (action: string, id: string) =>
  rest<{ actor_id: string | null }[]>(
    `audit_log?select=actor_id&action=eq.${action}&entity_id=eq.${id}`,
  )

export const profileIdByEmail = async (email: string) =>
  (await rest<{ id: string }[]>(`profiles?select=id&email=eq.${encodeURIComponent(email)}`))[0]?.id
