'use server'

import { revalidatePath } from 'next/cache'

import { staffActor } from '@/lib/auth/staffActor'
import { inputsFromWaitlist, type ScenarioInputs } from '@/lib/forecast/scenario'
import { saveScenario, scenarioInputsSchema, waitlistLeadSummaries } from '@/lib/reports/forecast'

const PROFIT_ROLES = ['super_admin', 'finance']

async function profitStaff() {
  const actor = await staffActor()
  return actor && PROFIT_ROLES.includes(actor.role ?? '') ? actor : null
}

export async function saveForecast(input: { id?: string; name: string; inputs: unknown }) {
  const actor = await profitStaff()
  if (!actor)
    return { ok: false as const, error: 'Only super admin and finance can save forecasts.' }
  const r = await saveScenario({ ...input, actorId: actor.id })
  revalidatePath('/admin/forecasts')
  return r
}

/** "From the waiting list": today's sign-ups (test data only if shown) into the current inputs. */
export async function fromWaitlist(current: unknown, includeTest: boolean) {
  const actor = await profitStaff()
  if (!actor) return { ok: false as const, error: 'Only super admin and finance can do this.' }
  const p = scenarioInputsSchema.safeParse(current)
  if (!p.success) return { ok: false as const, error: 'Check the inputs first.' }
  const leads = await waitlistLeadSummaries(includeTest)
  const { inputs, summary } = inputsFromWaitlist(leads, p.data as ScenarioInputs)
  // Numbers that now come from real sign-ups are no longer sample values.
  const fromSignUps = summary.complete > 0
  return {
    ok: true as const,
    summary,
    inputs: {
      ...inputs,
      sampleInputs: inputs.sampleInputs.filter(
        (s) => !(fromSignUps && (s.startsWith('System price') || s.startsWith('New customers'))),
      ),
    },
  }
}
