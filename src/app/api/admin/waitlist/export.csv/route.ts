import { NextResponse } from 'next/server'

import { requireStaffWithMfa } from '@/lib/auth/roles'
import { PLAN_LABELS } from '@/lib/quotes/buildEstimate'
import { createAdminClient } from '@/lib/supabase/admin'
import { listConsumers, listInstallers } from '@/lib/waitlist/admin'
import { READY_WHEN_LABELS, STATE_LABELS } from '@/lib/waitlist/schema'

export const dynamic = 'force-dynamic'

function cell(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const line = (cells: unknown[]) => cells.map(cell).join(',')

/** Staff only. Everything on the waiting list (complete, incomplete, installers) as CSV. */
export async function GET() {
  const session = await requireStaffWithMfa()
  const [complete, incomplete, installers] = await Promise.all([
    listConsumers({ tab: 'complete' }),
    listConsumers({ tab: 'incomplete' }),
    listInstallers(),
  ])

  const rows: string[] = []
  rows.push(
    line([
      'type',
      'status',
      'created_at',
      'first_name',
      'surname',
      'phone',
      'whatsapp',
      'email',
      'state',
      'lga',
      'consent_at',
      'applicant_type',
      'business_name',
      'business_type',
      'cac_number',
      'contact_role',
      'staff_count',
      'hours_per_day',
      'days_per_week',
      'generator_spend_monthly',
      'electricity_spend_monthly',
      'plan',
      'deposit_share',
      'deposit',
      'monthly',
      'system_price',
      'financing',
      'ready_when',
      'running_w',
      'surge_w',
      'daily_kwh',
      'appliances',
      'sample_prices',
      'duplicate_of',
      'entered_by',
      'entry_channel',
      'id',
    ]),
  )
  for (const l of [...complete, ...incomplete]) {
    rows.push(
      line([
        'consumer',
        l.status,
        l.createdAt,
        l.firstName,
        l.surname,
        l.phone,
        l.whatsapp,
        l.email,
        l.state ? (STATE_LABELS[l.state] ?? l.state) : '',
        l.lga,
        l.consentAt,
        l.applicantType ?? '',
        l.business?.businessName,
        l.business?.businessType,
        l.business?.cacNumber,
        l.business?.contactRole,
        l.business?.staffCount,
        l.business?.hoursPerDay,
        l.business?.daysPerWeek,
        l.business?.generatorSpendMonthly,
        l.business?.electricitySpendMonthly,
        l.plan ? PLAN_LABELS[l.plan] : '',
        l.depositShare,
        l.deposit,
        l.monthly,
        l.systemPrice,
        l.financing,
        l.readyWhen ? READY_WHEN_LABELS[l.readyWhen] : '',
        l.loadTotals.runningW,
        l.loadTotals.surgeW,
        l.loadTotals.dailyKwh,
        l.loadItems.map((i) => `${i.qty}× ${i.name} ${i.watts}W ${i.hoursPerDay}h`).join('; '),
        l.sample ? 'yes' : 'no',
        l.duplicateOf,
        l.enteredByName,
        l.entryChannel,
        l.id,
      ]),
    )
  }
  rows.push('')
  rows.push(
    line([
      'type',
      'created_at',
      'name',
      'business_name',
      'phone',
      'whatsapp',
      'email',
      'states',
      'lgas',
      'years_in_business',
      'installations_completed',
      'cac_registered',
      'consent_at',
      'entered_by',
      'id',
    ]),
  )
  for (const r of installers) {
    rows.push(
      line([
        'installer',
        r.created_at,
        r.name,
        r.business_name,
        r.phone_e164,
        r.whatsapp_e164,
        r.email,
        r.states.join('; '),
        r.lgas,
        r.years_in_business,
        r.installations_completed,
        r.cac_registered ? 'yes' : 'no',
        r.consent_at,
        r.enteredByName,
        r.id,
      ]),
    )
  }

  await createAdminClient()
    .from('waitlist_exports')
    .insert({
      kind: 'csv',
      row_count: complete.length + incomplete.length + installers.length,
      exported_by: session.user?.id ?? null,
    })

  const stamp = new Date().toISOString().slice(0, 10)
  // BOM so Excel on Windows reads the ₦-free UTF-8 text (names with accents) correctly.
  return new NextResponse(`﻿${rows.join('\r\n')}`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="go4solar-waiting-list-${stamp}.csv"`,
      'cache-control': 'no-store',
    },
  })
}
