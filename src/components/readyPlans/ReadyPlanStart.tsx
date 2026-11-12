'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'

import { InvoiceLink } from '@/components/invoices/InvoiceLink'
import { QuotationView } from '@/components/invoices/QuotationView'
import { AcceptAndApply } from '@/components/quotations/AcceptSharedQuotation'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { HeightStep, MountingStep, RoofTypePicker } from '@/components/waitlist/QuoteQuestions'
import type { InvoiceData } from '@/lib/invoices/build'
import type { NgStateId } from '@/lib/nigeria/states'
import type { SiteAnswers } from '@/lib/wizard/questions'
import type { RoofTypeCard } from '@/lib/wizard/server'

import { acceptReadyPlan, readyPlanQuotation } from '@/app/(public)/plans/[slug]/actions'

type Step = 'mounting' | 'roofType' | 'height' | 'quotation'
const TITLES: Record<Step, string> = {
  mounting: 'Where should the panels be mounted?',
  roofType: 'What type of roof do you have?',
  height: 'How tall is the building?',
  quotation: 'Your quotation',
}

/** Base64url of the answers, for the PDF link (no personal details in it). */
const encodeSite = (site: SiteAnswers) =>
  btoa(JSON.stringify(site)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export function ReadyPlanStart({
  slug,
  planName,
  months,
  state,
  roofTypes,
}: {
  slug: string
  planName: string
  months: number
  state: NgStateId
  roofTypes: RoofTypeCard[]
}) {
  const [step, setStep] = useState<Step>('mounting')
  const [site, setSite] = useState<SiteAnswers>({})
  const [doc, setDoc] = useState<InvoiceData | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const choice = { slug, months, state }

  function toQuotation(next: SiteAnswers) {
    setSite(next)
    setStep('quotation')
    window.scrollTo({ top: 0 })
    start(async () => {
      setError(null)
      const r = await readyPlanQuotation({ ...choice, site: next })
      if (r.ok) setDoc(r.doc)
      else setError(r.error)
    })
  }
  const back: Step | null =
    step === 'roofType'
      ? 'mounting'
      : step === 'height'
        ? 'roofType'
        : step === 'quotation'
          ? site.mounting === 'roof'
            ? 'height'
            : 'mounting'
          : null
  const pdf = `/plans/${slug}/pdf?${new URLSearchParams({
    months: String(months),
    state,
    site: encodeSite(site),
  })}`

  return (
    <div className="space-y-6">
      <h1 className="text-brand-dark text-2xl font-bold tracking-tight">{TITLES[step]}</h1>
      {step !== 'quotation' && (
        <p className="text-muted-foreground text-sm">
          For the installer&rsquo;s notes only: the price of {planName} stays the same.
        </p>
      )}

      {step === 'mounting' && (
        <MountingStep
          value={site}
          pending={false}
          onSave={(mounting, mountingOther) => {
            const next = { ...site, mounting, mountingOther }
            if (mounting === 'roof') {
              setSite(next)
              setStep('roofType')
            } else toQuotation(next)
          }}
        />
      )}
      {step === 'roofType' && (
        <RoofTypePicker
          roofTypes={roofTypes}
          selected={site.roofTypeId}
          pending={false}
          onPick={(r) => {
            setSite((cur) => (r ? { ...cur, roofTypeId: r.id, roofTypeName: r.name } : cur))
            setStep('height')
          }}
        />
      )}
      {step === 'height' && (
        <HeightStep
          value={site.building}
          pending={false}
          onSave={(building) => toQuotation({ ...site, building })}
        />
      )}

      {step === 'quotation' && (
        <div className="space-y-5" data-testid="ready-quotation">
          {pending || doc === undefined ? (
            <p className="text-muted-foreground text-sm" aria-busy="true">
              Preparing your quotation…
            </p>
          ) : doc ? (
            <>
              <QuotationView d={doc} />
              <InvoiceLink href={pdf} testId="quotation-pdf" />
            </>
          ) : (
            <p className="bg-brand-mist rounded-xl p-4 text-sm" data-testid="quotation-later">
              Your exact price will be confirmed when we contact you.
            </p>
          )}
          <p className="text-muted-foreground text-sm">
            To go ahead, accept the quotation and give your details. We then set up your payment
            plan with you step by step.
          </p>
          <AcceptAndApply
            name={null}
            phone={null}
            accept={(contact) => acceptReadyPlan({ ...choice, site, contact })}
          />
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap gap-3">
        {back && (
          <Button type="button" variant="ghost" onClick={() => setStep(back)}>
            ‹ Back
          </Button>
        )}
        <Button asChild variant="ghost">
          <Link href={`/plans/${slug}`}>Back to {planName}</Link>
        </Button>
      </div>
    </div>
  )
}
