'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { AgreementText } from '@/components/signature/AgreementText'

import { approveTemplate, createTemplateVersion } from '@/app/admin/(shell)/agreements/actions'

type Type = 'consumer' | 'guarantor' | 'installer' | 'vendor'
export type TemplateView = {
  id: string
  type: Type
  version: number
  status: 'draft' | 'approved'
  body_md: string
  approved_at: string | null
  created_at: string
  signedCount: number
}

const TYPES: Type[] = ['consumer', 'guarantor', 'installer', 'vendor']
const LABEL: Record<Type, string> = {
  consumer: 'Customer',
  guarantor: 'Guarantor',
  installer: 'Installer',
  vendor: 'Vendor',
}

export function TemplatesEditor({ rows }: { rows: TemplateView[] }) {
  const router = useRouter()
  const [type, setType] = useState<Type>('consumer')
  const versions = rows.filter((r) => r.type === type)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = versions.find((v) => v.id === selectedId) ?? versions[0] ?? null
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function run(fn: () => Promise<{ ok: true; id: string } | { ok: false; error: string }>) {
    setError(null)
    start(async () => {
      const r = await fn()
      if (!r.ok) return setError(r.error)
      setDraft(null)
      setSelectedId(r.id)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist">
        {TYPES.map((t) => (
          <Button
            key={t}
            role="tab"
            aria-selected={t === type}
            variant={t === type ? 'default' : 'outline'}
            onClick={() => {
              setType(t)
              setSelectedId(null)
              setDraft(null)
            }}
          >
            {LABEL[t]}
          </Button>
        ))}
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <ul className="space-y-2">
          {versions.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                onClick={() => {
                  setSelectedId(v.id)
                  setDraft(null)
                }}
                className={`w-full rounded-lg border p-3 text-left text-sm ${selected?.id === v.id ? 'border-brand-green bg-brand-mist' : ''}`}
              >
                <span className="font-semibold">Version {v.version}</span>{' '}
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${v.status === 'approved' ? 'bg-brand-green text-white' : 'bg-amber-100 text-amber-900'}`}
                >
                  {v.status}
                </span>
                <span className="text-muted-foreground block text-xs">
                  {v.signedCount} signed · created{' '}
                  {new Date(v.created_at).toLocaleDateString('en-GB', { timeZone: 'Africa/Lagos' })}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="space-y-3">
          {draft !== null ? (
            <>
              <p className="text-sm font-semibold">
                New version (copied from the newest). Placeholders like {'{{monthly}}'} are filled
                at signing.
              </p>
              <textarea
                aria-label="Agreement text"
                className="h-[60vh] w-full rounded-lg border p-3 font-mono text-xs"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  disabled={pending}
                  onClick={() => run(() => createTemplateVersion({ type, body: draft }))}
                >
                  Save as new draft version
                </Button>
                <Button variant="outline" onClick={() => setDraft(null)}>
                  Cancel
                </Button>
              </div>
            </>
          ) : selected ? (
            <>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setDraft(versions[0]?.body_md ?? '')}>
                  Create a new version
                </Button>
                {selected.status === 'draft' && (
                  <Button
                    className="bg-brand-green hover:bg-brand-dark"
                    disabled={pending}
                    onClick={() => {
                      if (
                        confirm(
                          `Approve ${LABEL[type]} version ${selected.version}? New signers will get this text.`,
                        )
                      )
                        run(() => approveTemplate(selected.id))
                    }}
                  >
                    Approve version {selected.version}
                  </Button>
                )}
              </div>
              <div className="max-h-[70vh] overflow-y-auto rounded-lg border bg-white p-4 text-sm">
                <AgreementText text={selected.body_md} />
              </div>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">No versions yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}
