'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { setPasswordSchema, type SetPasswordInput } from '@/lib/auth/passwordSchema'

import { setPassword } from './actions'

export function SetPasswordForm() {
  const [serverError, setServerError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const form = useForm<SetPasswordInput>({
    resolver: zodResolver(setPasswordSchema),
    defaultValues: { password: '', confirm: '' },
  })
  const { errors } = form.formState

  function onSubmit(values: SetPasswordInput) {
    setServerError(null)
    start(async () => {
      // On success the action redirects (staff: authenticator set-up next).
      const result = await setPassword(values)
      if (result?.error) setServerError(result.error)
    })
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          {...form.register('password')}
        />
        {errors.password && <p className="text-destructive text-sm">{errors.password.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">Type it again</Label>
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          {...form.register('confirm')}
        />
        {errors.confirm && <p className="text-destructive text-sm">{errors.confirm.message}</p>}
      </div>
      {serverError && (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" className="h-11 w-full" disabled={pending}>
        {pending ? 'Saving…' : 'Save my password'}
      </Button>
    </form>
  )
}
