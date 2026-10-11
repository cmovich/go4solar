'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatNaira, formatPercent } from '@/lib/money'

import {
  approve,
  askForMoreInfo,
  decline,
  resendCustomerLink,
  reviewCheck,
} from '@/app/admin/(shell)/applications/actions'

type Result = { ok: true } | { ok: false; error: string; blockers?: string[] }

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
      } else setError([r.error, ...(r.blockers ?? [])].join(' · '))
    })
  }
  return { pending, error, done, run }
}

function Feedback({ error, done }: { error: string | null; done: string | null }) {
  return (
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
}

export type FunderChoice = {
  id: string
  name: string
  annualRate: number
  balanceAvailable: number
  drawn: number
  funderInterest: number
  grossProfit: number
  netProfit: number
  netPerMonth: number
  annualReturn: number | null
  netShare: number
  loss: boolean
  belowMinimum: boolean
}

/** Approve with a funder (profit per funder), decline with a reason, or ask for more information. */
export function DecisionPanel({
  applicationId,
  open,
  blockers,
  options,
  role,
  amount,
  limit,
  minNetMarginShare,
}: {
  applicationId: string
  open: boolean
  blockers: string[]
  options: FunderChoice[]
  role: string | null
  amount: number
  limit: number
  minNetMarginShare: number
}) {
  const { pending, error, done, run } = useRun()
  const [funderId, setFunderId] = useState(options.find((o) => !o.loss)?.id ?? '')
  const [reason, setReason] = useState('')
  const [info, setInfo] = useState('')
  const chosen = options.find((o) => o.id === funderId)
  const needsBoss =
    role !== 'super_admin' &&
    (amount > limit || (chosen ? chosen.netShare < minNetMarginShare : false))

  if (!open) return <Feedback error={error} done={done} />

  return (
    <section className="space-y-5 rounded-2xl border-2 p-5" data-testid="decision-panel">
      <h2 className="text-brand-dark text-lg font-bold">Decision</h2>

      {blockers.length > 0 ? (
        <div
          className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
          data-testid="approval-blockers"
        >
          <p className="font-semibold">Cannot approve yet:</p>
          <ul className="mt-1 list-disc pl-5">
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div>
          <p className="text-sm">
            Choose the funder. Amount financed {formatNaira(amount)}; credit officer limit{' '}
            {formatNaira(limit)}; minimum net margin {formatPercent(minNetMarginShare)}.
          </p>
          {options.length === 0 ? (
            <p className="mt-2 text-sm text-red-700">
              No funder fits this loan (ticket size, tenure or balance).
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm" data-testid="funder-options">
                <thead>
                  <tr className="bg-brand-green text-left text-white">
                    <th className="px-2 py-2" />
                    <th className="px-2 py-2">Funder</th>
                    <th className="px-2 py-2 text-right">Drawn</th>
                    <th className="px-2 py-2 text-right">Interest</th>
                    <th className="px-2 py-2 text-right">Gross profit</th>
                    <th className="px-2 py-2 text-right">Net profit</th>
                    <th className="px-2 py-2 text-right">Per month</th>
                    <th className="px-2 py-2 text-right">Annual return</th>
                    <th className="px-2 py-2 text-right">Balance after</th>
                  </tr>
                </thead>
                <tbody>
                  {options.map((o) => (
                    <tr
                      key={o.id}
                      className={`even:bg-brand-mist ${o.loss ? 'text-red-700' : o.belowMinimum ? 'text-amber-700' : ''}`}
                    >
                      <td className="px-2 py-2">
                        <input
                          type="radio"
                          name="funder"
                          aria-label={o.name}
                          checked={funderId === o.id}
                          onChange={() => setFunderId(o.id)}
                        />
                      </td>
                      <td className="px-2 py-2 font-semibold">
                        {o.name}{' '}
                        <span className="font-normal">({formatPercent(o.annualRate, 1)})</span>
                      </td>
                      <td className="px-2 py-2 text-right">{formatNaira(o.drawn)}</td>
                      <td className="px-2 py-2 text-right">{formatNaira(o.funderInterest)}</td>
                      <td className="px-2 py-2 text-right">{formatNaira(o.grossProfit)}</td>
                      <td className="px-2 py-2 text-right font-bold">{formatNaira(o.netProfit)}</td>
                      <td className="px-2 py-2 text-right">{formatNaira(o.netPerMonth)}</td>
                      <td className="px-2 py-2 text-right">
                        {o.annualReturn === null ? '—' : formatPercent(o.annualReturn, 1)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {formatNaira(o.balanceAvailable - o.drawn)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-muted-foreground mt-1 text-xs">
                Red = loss. Amber = below the minimum net margin: only a super admin can approve.
                Net profit includes the payment fees already recorded.
              </p>
            </div>
          )}
          {needsBoss && (
            <p className="mt-2 text-sm font-semibold text-amber-800">
              This approval needs a super admin.
            </p>
          )}
          <Button
            type="button"
            className="bg-brand-green hover:bg-brand-dark mt-3 h-12 w-full font-semibold"
            disabled={pending || !funderId || needsBoss}
            onClick={() =>
              run(() => approve(applicationId, funderId), 'Approved. The customer has been told.')
            }
          >
            Approve with {chosen?.name ?? 'the chosen funder'}
          </Button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="more-info">Request more information</Label>
          <Input
            id="more-info"
            value={info}
            placeholder="What should the customer fix?"
            onChange={(e) => setInfo(e.target.value)}
          />
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={pending}
            onClick={() => run(() => askForMoreInfo(applicationId, info), 'Sent to the customer.')}
          >
            Ask the customer
          </Button>
        </div>
        <div className="space-y-2">
          <Label htmlFor="decline-reason">Decline (the deposit is refunded in full)</Label>
          <Input
            id="decline-reason"
            value={reason}
            placeholder="Reason"
            onChange={(e) => setReason(e.target.value)}
          />
          <Button
            type="button"
            variant="destructive"
            className="w-full"
            disabled={pending}
            onClick={() => {
              if (confirm('Decline this application and refund the deposit?'))
                run(
                  () => decline(applicationId, reason),
                  'Declined. The deposit refund has started.',
                )
            }}
          >
            Decline and refund
          </Button>
        </div>
      </div>
      <Feedback error={error} done={done} />
    </section>
  )
}

/** Clear or fail a KYC check that went to manual review (reason recorded). */
export function KycReviewButtons({
  applicationId,
  checkId,
}: {
  applicationId: string
  checkId: string
}) {
  const { pending, error, done, run } = useRun()
  const [reason, setReason] = useState('')
  return (
    <div className="mt-2 space-y-2">
      <Input
        aria-label="Reason for the record"
        placeholder="Reason for the record"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          className="bg-brand-green hover:bg-brand-dark"
          disabled={pending}
          onClick={() =>
            run(() => reviewCheck(applicationId, checkId, 'clear', reason), 'Cleared.')
          }
        >
          Clear
        </Button>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={pending}
          onClick={() =>
            run(() => reviewCheck(applicationId, checkId, 'fail', reason), 'Marked failed.')
          }
        >
          Fail
        </Button>
      </div>
      <Feedback error={error} done={done} />
    </div>
  )
}

export function ResendLinkButton({ applicationId }: { applicationId: string }) {
  const { pending, error, done, run } = useRun()
  return (
    <div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          run(() => resendCustomerLink(applicationId), 'A new link was sent to the customer.')
        }
      >
        Send the customer a new link
      </Button>
      <Feedback error={error} done={done} />
    </div>
  )
}
