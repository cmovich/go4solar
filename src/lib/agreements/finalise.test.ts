import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { isValidElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

const uploads: { path: string; body: Buffer }[] = []
const inserts: Record<string, unknown>[] = []
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    storage: {
      from: () => ({
        upload: async (p: string, body: Buffer) => {
          uploads.push({ path: p, body })
          return { error: null }
        },
      }),
    },
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        inserts.push(row)
        return { select: () => ({ single: async () => ({ data: row, error: null }) }) }
      },
    }),
  }),
}))
const sent: unknown[] = []
vi.mock('@/lib/providers/messaging', () => ({
  getMessagingProvider: async () => ({ send: async (m: unknown) => sent.push(m) }),
}))
vi.mock('@/lib/ratelimit/hitRateLimit', () => ({ hitRateLimit: async () => true }))

const { finaliseAgreement } = await import('./server')
const { AgreementDocument } = await import('@/lib/pdf/AgreementPdf')

/** All text inside a React element tree (without rendering function components). */
function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children)
  return ''
}

describe('finaliseAgreement', () => {
  it('stores the SHA-256 of the signed PDF and prints the fingerprint on the audit page', async () => {
    const signaturePng = readFileSync(path.join(process.cwd(), 'public/brand/go4solar-logo.png'))
    const row = await finaliseAgreement({
      type: 'consumer',
      template: { id: 't-1', version: 1, status: 'draft' } as never,
      subjectId: 'u-1',
      applicationId: 'app-1',
      folder: 'u-1/app-1',
      title: 'Solar payment plan agreement',
      reference: 'G4S-TEST',
      text: '# Solar Payment Plan Agreement\n\n## 1. Parties\nText',
      signaturePng,
      signerName: 'Ada Obi',
      signerTitle: null,
      typedName: 'Ada Obi',
      otpVerifiedAt: '2026-10-10T10:00:00Z',
      ip: '1.2.3.4',
      userAgent: 'test',
      emailTo: 'ada@x.test',
    })

    const pdf = uploads.find((u) => u.path.endsWith('.pdf'))!
    expect(pdf.path).toMatch(/^u-1\/app-1\/agreement-consumer-.+\.pdf$/)
    expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-')
    expect(inserts[0]!.pdf_sha256).toBe(createHash('sha256').update(pdf.body).digest('hex'))
    expect(row.content_sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(sent).toHaveLength(1) // emailed to the signer (outbox in mock mode)

    // The audit page prints the stored content fingerprint.
    const tree = AgreementDocument({
      title: 'T',
      reference: 'G4S-TEST',
      text: 'x',
      signaturePng,
      signerName: 'Ada Obi',
      signerTitle: null,
      audit: [{ label: 'Signed by', value: 'Ada Obi' }],
      fingerprint: String(row.content_sha256),
    })
    expect(textOf(tree)).toContain(String(row.content_sha256))
  }, 30_000)
})
