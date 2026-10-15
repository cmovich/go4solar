'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import {
  assign,
  installed,
  payout,
  pickup,
  saveSerials,
  schedule,
  uploadPhoto,
} from '@/app/admin/(shell)/jobs/actions'

type Result = { ok: true } | { ok: false; error: string }

function useRun() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const run = (fn: () => Promise<Result>, success: string) => {
    setError(null)
    setDone(null)
    start(async () => {
      const r = await fn()
      if (r.ok) {
        setDone(success)
        router.refresh()
      } else setError(r.error)
    })
  }
  const feedback = (
    <>
      {error && (
        <Alert variant="destructive" className="mt-2">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {done && (
        <p className="text-brand-green mt-2 text-sm font-semibold" role="status">
          {done}
        </p>
      )}
    </>
  )
  return { pending, run, feedback }
}

const select = 'border-input h-10 w-full rounded-md border bg-white px-3 text-sm'

/** Assign an installer to an approved loan (Phase 1: by hand). */
export function AssignJobForm({ loanId }: { loanId: string }) {
  const { pending, run, feedback } = useRun()
  const [v, setV] = useState({
    installerName: '',
    installerPhone: '',
    source: 'go4solar_store',
    vendorName: '',
    date: '',
  })
  return (
    <form
      className="grid gap-2 sm:grid-cols-5"
      onSubmit={(e) => {
        e.preventDefault()
        run(
          () =>
            assign({
              loanId,
              installerName: v.installerName,
              installerPhone: v.installerPhone,
              equipmentSource: v.source as 'go4solar_store' | 'vendor',
              vendorName: v.source === 'vendor' ? v.vendorName : null,
              scheduledDate: v.date || null,
            }),
          'Installer assigned; the customer has been told.',
        )
      }}
    >
      <Input
        aria-label="Installer"
        placeholder="Installer"
        value={v.installerName}
        onChange={(e) => setV({ ...v, installerName: e.target.value })}
      />
      <Input
        aria-label="Installer phone"
        placeholder="Installer phone"
        value={v.installerPhone}
        onChange={(e) => setV({ ...v, installerPhone: e.target.value })}
      />
      <select
        aria-label="Equipment from"
        className={select}
        value={v.source}
        onChange={(e) => setV({ ...v, source: e.target.value })}
      >
        <option value="go4solar_store">Go4Solar store (OEM stock)</option>
        <option value="vendor">A vendor</option>
      </select>
      {v.source === 'vendor' ? (
        <Input
          aria-label="Vendor name"
          placeholder="Vendor name"
          value={v.vendorName}
          onChange={(e) => setV({ ...v, vendorName: e.target.value })}
        />
      ) : (
        <Input
          aria-label="Installation date"
          type="date"
          value={v.date}
          onChange={(e) => setV({ ...v, date: e.target.value })}
        />
      )}
      <Button type="submit" disabled={pending} className="bg-brand-green hover:bg-brand-dark">
        Assign
      </Button>
      {v.source === 'vendor' && (
        <Input
          aria-label="Installation date"
          type="date"
          value={v.date}
          onChange={(e) => setV({ ...v, date: e.target.value })}
        />
      )}
      <div className="sm:col-span-5">{feedback}</div>
    </form>
  )
}

/** Everything staff do on one job, from pickup to installed, plus the payout confirmation. */
export function JobControls({
  jobId,
  status,
  scheduledDate,
  serials,
  canPayout,
  payoutConfirmed,
}: {
  jobId: string
  status: 'assigned' | 'picked_up' | 'installed' | 'commissioned'
  scheduledDate: string | null
  serials: { panels: string[]; batteries: string[]; inverters: string[] }
  canPayout: boolean
  payoutConfirmed: boolean
}) {
  const { pending, run, feedback } = useRun()
  const [date, setDate] = useState(scheduledDate ?? '')
  const [code, setCode] = useState('')
  const [s, setS] = useState({
    panels: serials.panels.join('\n'),
    batteries: serials.batteries.join('\n'),
    inverters: serials.inverters.join('\n'),
  })
  const lines = (t: string) =>
    t
      .split(/[\n,]/)
      .map((x) => x.trim())
      .filter(Boolean)
  const editable = status === 'assigned' || status === 'picked_up'

  return (
    <div className="space-y-6">
      {editable && (
        <section className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="job-date">Installation date</Label>
            <div className="flex gap-2">
              <Input
                id="job-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                disabled={pending || !date}
                onClick={() =>
                  run(() => schedule(jobId, date), 'Date saved; the customer has been told.')
                }
              >
                Save date
              </Button>
            </div>
          </div>
          {status === 'assigned' && (
            <div className="space-y-1">
              <Label htmlFor="pickup-code">
                Pickup code from the installer (store / vendor release)
              </Label>
              <div className="flex gap-2">
                <Input
                  id="pickup-code"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => run(() => pickup(jobId, code), 'Equipment released.')}
                >
                  Release
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      {editable && (
        <section className="space-y-2">
          <h2 className="text-brand-dark font-bold">Serial numbers (one per line)</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {(['panels', 'batteries', 'inverters'] as const).map((k) => (
              <div key={k} className="space-y-1">
                <Label htmlFor={`serials-${k}`}>{k[0]!.toUpperCase() + k.slice(1)}</Label>
                <textarea
                  id={`serials-${k}`}
                  className="h-28 w-full rounded-md border p-2 font-mono text-xs"
                  value={s[k]}
                  onChange={(e) => setS({ ...s, [k]: e.target.value })}
                />
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(
                () =>
                  saveSerials(jobId, {
                    panels: lines(s.panels),
                    batteries: lines(s.batteries),
                    inverters: lines(s.inverters),
                  }),
                'Serial numbers saved.',
              )
            }
          >
            Save serial numbers
          </Button>
        </section>
      )}

      {editable && (
        <section className="space-y-2">
          <h2 className="text-brand-dark font-bold">Commissioning photos</h2>
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const form = new FormData(e.currentTarget)
              form.set('jobId', jobId)
              run(() => uploadPhoto(form), 'Photo added.')
              e.currentTarget.reset()
            }}
          >
            <input
              aria-label="Commissioning photo"
              type="file"
              name="photo"
              accept="image/jpeg,image/png,image/webp"
            />
            <Button type="submit" variant="outline" disabled={pending}>
              Upload
            </Button>
          </form>
        </section>
      )}

      {editable && (
        <Button
          type="button"
          className="bg-brand-green hover:bg-brand-dark h-12 w-full font-semibold"
          disabled={pending}
          onClick={() =>
            run(() => installed(jobId), 'Marked installed; the customer has been asked to confirm.')
          }
        >
          Mark installed
        </Button>
      )}

      {status === 'installed' && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Waiting for the customer to confirm on their dashboard that the system is installed and
          working.
        </p>
      )}

      {status === 'commissioned' && (
        <section className="space-y-2">
          <h2 className="text-brand-dark font-bold">Installer / vendor payout</h2>
          {payoutConfirmed ? (
            <p className="text-brand-green text-sm font-semibold">Payout confirmed.</p>
          ) : canPayout ? (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => run(() => payout(jobId), 'Payout confirmed.')}
            >
              Confirm payout
            </Button>
          ) : (
            <p className="text-muted-foreground text-sm">
              Finance confirms the payout. The person who approved the loan cannot.
            </p>
          )}
        </section>
      )}
      {feedback}
    </div>
  )
}
