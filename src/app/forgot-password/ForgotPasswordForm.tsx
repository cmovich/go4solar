'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { forgotPasswordSchema, type ForgotPasswordInput } from '@/lib/auth/passwordSchema'

import { requestPasswordLink } from './actions'

export function ForgotPasswordForm() {
  const [result, setResult] = useState<{ message?: string; error?: string } | null>(null)
  const [pending, start] = useTransition()
  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  })
  const { errors } = form.formState

  function onSubmit(values: ForgotPasswordInput) {
    setResult(null)
    start(async () => setResult(await requestPasswordLink(values)))
  }

  if (result?.message) {
    return (
      <p
        className="text-brand-dark rounded-md bg-white text-sm"
        role="status"
        data-testid="link-sent"
      >
        {result.message}
      </p>
    )
  }
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" {...form.register('email')} />
        {errors.email && <p className="text-destructive text-sm">{errors.email.message}</p>}
      </div>
      {result?.error && (
        <Alert variant="destructive">
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" className="h-11 w-full" disabled={pending}>
        {pending ? 'Sending…' : 'Send me a link'}
      </Button>
    </form>
  )
}
