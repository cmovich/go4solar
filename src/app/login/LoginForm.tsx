'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { signIn, signUp } from './actions'
import { signInSchema } from './schema'

// One form serves both modes; the name is only required when creating an account.
const formSchema = signInSchema
  .extend({
    mode: z.enum(['signin', 'signup']),
    fullName: z.string().trim().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.mode === 'signup' && (v.fullName?.length ?? 0) < 2) {
      ctx.addIssue({ code: 'custom', path: ['fullName'], message: 'Enter your full name' })
    }
  })

type FormValues = z.infer<typeof formSchema>

export function LoginForm({ next }: { next?: string }) {
  const [serverError, setServerError] = useState<string | null>(null)
  const [serverMessage, setServerMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { mode: 'signin', email: '', password: '', fullName: '', next },
  })
  const { errors } = form.formState
  const mode = form.watch('mode')

  function onSubmit(values: FormValues) {
    setServerError(null)
    setServerMessage(null)
    startTransition(async () => {
      const result =
        values.mode === 'signin'
          ? await signIn(values)
          : await signUp({ ...values, fullName: values.fullName ?? '' })
      if (result?.error) setServerError(result.error)
      if (result?.message) setServerMessage(result.message)
    })
  }

  function switchMode(to: FormValues['mode']) {
    form.setValue('mode', to)
    form.clearErrors()
    setServerError(null)
    setServerMessage(null)
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {mode === 'signup' && (
        <div className="space-y-2">
          <Label htmlFor="fullName">Full name</Label>
          <Input id="fullName" autoComplete="name" {...form.register('fullName')} />
          {errors.fullName && <p className="text-destructive text-sm">{errors.fullName.message}</p>}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          {...form.register('email')}
        />
        {errors.email && <p className="text-destructive text-sm">{errors.email.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          {...form.register('password')}
        />
        {errors.password && <p className="text-destructive text-sm">{errors.password.message}</p>}
      </div>

      {serverError && (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}
      {serverMessage && (
        <Alert>
          <AlertDescription>{serverMessage}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
      </Button>

      <p className="text-muted-foreground text-center text-sm">
        {mode === 'signin' ? (
          <>
            New here?{' '}
            <button
              type="button"
              className="text-brand-blue underline"
              onClick={() => switchMode('signup')}
            >
              Create an account
            </button>
          </>
        ) : (
          <>
            Already have an account?{' '}
            <button
              type="button"
              className="text-brand-blue underline"
              onClick={() => switchMode('signin')}
            >
              Sign in
            </button>
          </>
        )}
      </p>
    </form>
  )
}
