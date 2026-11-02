'use client'

import { useEffect } from 'react'

import { reportClientError } from './report'

/** Root layout: crashes outside any error screen (and failed promises) reach the server log. */
export function ClientErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => reportClientError('error', e.error ?? e.message)
    const onRejection = (e: PromiseRejectionEvent) => reportClientError('rejection', e.reason)
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])
  return null
}
