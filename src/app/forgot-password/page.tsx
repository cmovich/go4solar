import type { Metadata } from 'next'
import Link from 'next/link'

import { AuthShell } from '@/components/auth/AuthShell'

import { ForgotPasswordForm } from './ForgotPasswordForm'

export const metadata: Metadata = { title: 'Forgot password', robots: { index: false } }

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Forgot your password?"
      description="Enter your email and we will send you a link to set a new password."
    >
      <ForgotPasswordForm />
      <p className="mt-4 text-center text-sm">
        <Link href="/login" className="text-brand-blue hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  )
}
