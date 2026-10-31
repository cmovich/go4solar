import { z } from 'zod'

// One schema per form, shared by the admin form and its server action.
const text = (max: number, label: string) =>
  z
    .string()
    .trim()
    .min(1, `Enter the ${label}`)
    .max(max, `Keep the ${label} to ${max} characters or fewer`)

export const testimonialSchema = z.object({
  id: z.uuid().optional(),
  clientName: text(40, 'first name').refine((v) => !/\s/.test(v), 'First name only'),
  clientCity: text(60, 'city'),
  clientQuote: text(220, 'quote'),
  systemSize: text(60, 'system size'),
  installerName: text(80, 'installer name'),
  installerPhoto: z.string().nullable().optional(),
  jobPhoto: z.string().nullable().optional(),
  consentClient: z.boolean(),
  consentInstaller: z.boolean(),
})
export type TestimonialInput = z.infer<typeof testimonialSchema>

export const partnerSchema = z.object({
  id: z.uuid().optional(),
  name: text(80, 'name'),
  logo: z.string().nullable().optional(),
  websiteUrl: z
    .string()
    .trim()
    .refine((v) => v === '' || /^https?:\/\/\S+$/i.test(v), 'Start the web address with https://'),
})
export type PartnerInput = z.infer<typeof partnerSchema>

/** A testimonial goes on the home page only with written consent from both people. */
export function publishProblem(t: {
  consentClient: boolean
  consentInstaller: boolean
}): string | null {
  return t.consentClient && t.consentInstaller
    ? null
    : 'Tick both consents (client and installer) before publishing.'
}

/** The list after moving one id up or down (unchanged at either end or if the id is missing). */
export function moveInList<T>(ids: readonly T[], id: T, dir: 'up' | 'down'): T[] {
  const list = [...ids]
  const i = list.indexOf(id)
  const j = dir === 'up' ? i - 1 : i + 1
  if (i < 0 || j < 0 || j >= list.length) return list
  ;[list[i], list[j]] = [list[j]!, list[i]!]
  return list
}

/** A roof type card in the quote wizard (Part E). */
export const roofTypeSchema = z.object({
  id: z.uuid().optional(),
  name: text(80, 'name'),
  description: z.string().trim().max(200).optional(),
  photo: z.string().nullable().optional(),
  needsRack: z.boolean(),
})
export type RoofTypeInput = z.infer<typeof roofTypeSchema>
