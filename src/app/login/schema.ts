import { z } from 'zod'

// One schema per form, shared by the client form and the server action.
export const signInSchema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(8, 'At least 8 characters'),
  next: z.string().optional(),
})

export const signUpSchema = signInSchema.extend({
  fullName: z.string().trim().min(2, 'Enter your full name'),
})

export type SignInInput = z.infer<typeof signInSchema>
export type SignUpInput = z.infer<typeof signUpSchema>
