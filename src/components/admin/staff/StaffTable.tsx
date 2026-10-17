'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { STAFF_ROLES, type StaffRole } from '@/lib/auth/staffRoles'

import {
  inviteStaff,
  resendStaffInvite,
  setStaffDisabled,
  updateStaff,
} from '@/app/admin/(shell)/staff/actions'

export type StaffRowView = {
  id: string
  email: string | null
  fullName: string | null
  role: StaffRole
  assistedEntry: boolean
  disabled: boolean
  isMe: boolean
}

const ROLE_LABELS: Record<StaffRole, string> = {
  super_admin: 'Super admin',
  credit_officer: 'Credit officer',
  operations: 'Operations',
  collections: 'Collections',
  finance: 'Finance',
  content: 'Content',
}

function StaffRow({ initial }: { initial: StaffRowView }) {
  const router = useRouter()
  const [role, setRole] = useState<StaffRole>(initial.role)
  const [assisted, setAssisted] = useState(initial.assistedEntry)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [pending, start] = useTransition()
  const dirty = role !== initial.role || assisted !== initial.assistedEntry

  function save() {
    setError(null)
    start(async () => {
      const r = await updateStaff({ profileId: initial.id, role, assistedEntry: assisted })
      if (r.ok) router.refresh()
      else setError(r.error)
    })
  }
  function toggleDisabled() {
    setError(null)
    start(async () => {
      const r = await setStaffDisabled({ profileId: initial.id, disabled: !initial.disabled })
      if (r.ok) router.refresh()
      else setError(r.error)
    })
  }

  function resend() {
    setError(null)
    setSent(false)
    start(async () => {
      const r = await resendStaffInvite({ profileId: initial.id })
      if (r.ok) setSent(true)
      else setError(r.error)
    })
  }

  return (
    <>
      <tr className={`border-t ${initial.disabled ? 'opacity-60' : ''}`} data-testid="staff-row">
        <td className="px-3 py-2">
          <span className="text-brand-dark font-semibold">{initial.fullName ?? '—'}</span>
          <span className="text-muted-foreground block text-xs">{initial.email}</span>
          {initial.isMe && <span className="text-brand-green text-xs">you</span>}
        </td>
        <td className="px-3 py-2">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as StaffRole)}
            className="border-input h-9 rounded-md border bg-white px-2 text-sm"
            aria-label={`Role for ${initial.email}`}
            disabled={initial.isMe}
          >
            {STAFF_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </td>
        <td className="px-3 py-2 text-center">
          <Checkbox
            checked={assisted}
            onCheckedChange={(v) => setAssisted(v === true)}
            aria-label={`Assisted entry for ${initial.email}`}
          />
        </td>
        <td className="px-3 py-2">{initial.disabled ? 'Disabled' : 'Active'}</td>
        <td className="px-3 py-2 whitespace-nowrap">
          <Button type="button" size="sm" onClick={save} disabled={!dirty || pending}>
            Save
          </Button>{' '}
          {!initial.isMe && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={toggleDisabled}
              disabled={pending}
            >
              {initial.disabled ? 'Enable' : 'Disable'}
            </Button>
          )}{' '}
          {!initial.isMe && !initial.disabled && (
            <Button type="button" size="sm" variant="outline" onClick={resend} disabled={pending}>
              Resend invite
            </Button>
          )}
        </td>
      </tr>
      {sent && (
        <tr>
          <td colSpan={5} className="text-brand-green px-3 pb-2 text-sm" role="status">
            New link sent to {initial.email}. It works once and expires after 1 hour.
          </td>
        </tr>
      )}
      {error && (
        <tr>
          <td colSpan={5} className="px-3 pb-2">
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </td>
        </tr>
      )}
    </>
  )
}

export function StaffTable({ rows }: { rows: StaffRowView[] }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<StaffRole>('operations')
  const [assisted, setAssisted] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()

  function invite(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    start(async () => {
      const r = await inviteStaff({ email, fullName, role, assistedEntry: assisted })
      if (r.ok) {
        setMessage({ ok: true, text: `Invitation sent to ${email}.` })
        setEmail('')
        setFullName('')
        router.refresh()
      } else setMessage({ ok: false, text: r.error })
    })
  }

  return (
    <div className="space-y-8">
      <form onSubmit={invite} className="bg-brand-mist rounded-xl p-4" noValidate>
        <h2 className="text-brand-dark text-lg font-semibold">Invite staff</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <div>
            <Label htmlFor="inv-name">Full name</Label>
            <Input
              id="inv-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1 h-10"
            />
          </div>
          <div>
            <Label htmlFor="inv-email">Email</Label>
            <Input
              id="inv-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 h-10"
            />
          </div>
          <div>
            <Label htmlFor="inv-role">Role</Label>
            <select
              id="inv-role"
              value={role}
              onChange={(e) => setRole(e.target.value as StaffRole)}
              className="border-input mt-1 h-10 w-full rounded-md border bg-white px-2 text-sm"
            >
              {STAFF_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-3">
            <label className="flex h-10 items-center gap-2 text-sm">
              <Checkbox checked={assisted} onCheckedChange={(v) => setAssisted(v === true)} />{' '}
              Assisted entry
            </label>
            <Button type="submit" disabled={pending}>
              {pending ? 'Sending…' : 'Invite'}
            </Button>
          </div>
        </div>
        {message && (
          <p
            className={`mt-3 text-sm ${message.ok ? 'text-brand-green' : 'text-destructive'}`}
            role="status"
          >
            {message.text}
          </p>
        )}
      </form>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm" data-testid="staff-table">
          <thead className="bg-brand-green text-left text-white">
            <tr>
              {['Person', 'Role', 'Assisted entry', 'Status', ''].map((h) => (
                <th key={h} className="px-3 py-2 font-semibold whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <StaffRow key={r.id} initial={r} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
