import type { Metadata } from 'next'

import { AuthCallback } from './AuthCallback'

export const metadata: Metadata = { title: 'Opening your link', robots: { index: false } }

/** Invite and password emails return here; the browser reads the link (see AuthCallback). */
export default function AuthCallbackPage() {
  return <AuthCallback />
}
