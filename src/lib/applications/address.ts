import { z } from 'zod'

import { isNgStateId } from '@/lib/nigeria/states'

/** The installation address (application wizard and pay in full). */
export const installAddressSchema = z.object({
  line1: z.string().trim().min(4, 'Enter the street address').max(160),
  city: z.string().trim().min(2, 'Enter the town or city').max(80),
  state: z.string().refine(isNgStateId, 'Choose the state'),
  lga: z.string().trim().min(2, 'Enter the LGA').max(80),
})
export type InstallAddress = z.infer<typeof installAddressSchema>
