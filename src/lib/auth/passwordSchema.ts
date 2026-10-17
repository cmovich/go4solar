import { z } from 'zod'

// One schema per form, shared by the client form and the server action.
export const setPasswordSchema = z
  .object({
    password: z.string().min(12, 'Use at least 12 characters').max(72, 'Use at most 72 characters'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'The two passwords are not the same',
  })

export const forgotPasswordSchema = z.object({
  email: z.string().trim().pipe(z.email('Enter a valid email address')),
})

export type SetPasswordInput = z.infer<typeof setPasswordSchema>
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
