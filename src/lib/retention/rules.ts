/**
 * What the retention job may delete (and nothing else):
 *  1. ID images from a KYC check that failed: NIN slip images when the NIN check failed, the CAC
 *     certificate when the CAC check failed — only if the latest check of that kind failed, no check
 *     of that kind ever passed, the failure is more than 30 days old, and the application did not
 *     go ahead (draft or declined).
 *  2. Waiting-list rows marked cleared more than 7 days ago.
 */
export const FAILED_KYC_DAYS = 30
export const CLEARED_GRACE_DAYS = 7

const IMAGES_FOR: Record<string, string[]> = {
  nin: ['nin_front', 'nin_back'],
  cac: ['cac_certificate'],
}
const NOT_GOING_AHEAD = new Set(['draft', 'declined'])

export type RetentionInput = {
  applications: { id: string; status: string }[]
  checks: { subjectId: string; kind: string; status: string; createdAt: string }[]
  documents: { id: string; applicationId: string | null; kind: string; storagePath: string }[]
  waitlist: {
    id: string
    table: 'waitlist_consumers' | 'waitlist_installers'
    clearedAt: string | null
  }[]
}

export function selectForPurge(input: RetentionInput, now: Date) {
  const day = 86_400_000
  const kycCutoff = now.getTime() - FAILED_KYC_DAYS * day
  const clearCutoff = now.getTime() - CLEARED_GRACE_DAYS * day
  const statusOf = new Map(input.applications.map((a) => [a.id, a.status]))

  /** Application ids whose check of this kind finally failed more than 30 days ago. */
  const failedLongAgo = (kind: string) => {
    const ids = new Set<string>()
    const bySubject = new Map<string, RetentionInput['checks']>()
    for (const c of input.checks.filter((x) => x.kind === kind)) {
      bySubject.set(c.subjectId, [...(bySubject.get(c.subjectId) ?? []), c])
    }
    for (const [id, list] of bySubject) {
      const sorted = [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      const last = sorted[sorted.length - 1]!
      if (sorted.some((c) => c.status === 'passed')) continue
      if (last.status === 'failed' && Date.parse(last.createdAt) < kycCutoff) ids.add(id)
    }
    return ids
  }

  const kycDocuments = Object.entries(IMAGES_FOR).flatMap(([kind, docKinds]) => {
    const failed = failedLongAgo(kind)
    return input.documents.filter(
      (d) =>
        d.applicationId !== null &&
        docKinds.includes(d.kind) &&
        failed.has(d.applicationId) &&
        NOT_GOING_AHEAD.has(statusOf.get(d.applicationId) ?? ''),
    )
  })
  const waitlist = input.waitlist.filter(
    (w) => w.clearedAt !== null && Date.parse(w.clearedAt) < clearCutoff,
  )
  return { kycDocuments, waitlist }
}

/**
 * Deleting is off until Semako switches it on (env RETENTION_ENABLED=true): until then every run,
 * including the weekly cron on go4solar.app, only counts what it would delete.
 */
export function retentionDryRun(
  env: Record<string, string | undefined>,
  dryParam: boolean,
): boolean {
  return dryParam || env.RETENTION_ENABLED !== 'true'
}
