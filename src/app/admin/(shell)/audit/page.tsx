import type { Metadata } from 'next'

import { requireRole } from '@/lib/auth/roles'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Audit log' }

const date = (iso: string) =>
  new Date(iso).toLocaleString('en-NG', {
    timeZone: 'Africa/Lagos',
    dateStyle: 'medium',
    timeStyle: 'short',
  })

/** Every staff action that changed money, approvals, prices or users (super_admin only). */
export default async function AuditLogPage() {
  await requireRole('super_admin')
  const supabase = await createClient()
  const { data: rows, error } = await supabase
    .from('audit_log')
    .select('id, actor_id, action, entity, entity_id, before, after, created_at')
    .order('created_at', { ascending: false })
    .limit(300)
  if (error) throw new Error(error.message)

  const actorIds = [...new Set(rows.map((r) => r.actor_id).filter((v): v is string => Boolean(v)))]
  const { data: actors } = actorIds.length
    ? await supabase.from('profiles').select('id, full_name, email').in('id', actorIds)
    : { data: [] }
  const names = new Map((actors ?? []).map((a) => [a.id, a.full_name ?? a.email ?? a.id]))

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-brand-dark text-3xl font-bold">Audit log</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Latest {rows.length} entries, newest first.
      </p>
      <div className="mt-6 overflow-x-auto rounded-xl border">
        <table className="w-full text-sm" data-testid="audit-table">
          <thead className="bg-brand-green text-left text-white">
            <tr>
              {['When', 'Who', 'Action', 'Entity', 'Before → after'].map((h) => (
                <th key={h} className="px-3 py-2 font-semibold whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className={i % 2 ? 'bg-brand-mist/60' : 'bg-white'}>
                <td className="px-3 py-2 whitespace-nowrap">{date(r.created_at)}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.actor_id ? (names.get(r.actor_id) ?? r.actor_id) : 'system'}
                </td>
                <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{r.action}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.entity}
                  {r.entity_id && (
                    <span className="text-muted-foreground block text-xs">{r.entity_id}</span>
                  )}
                </td>
                <td className="max-w-xl px-3 py-2">
                  <pre className="text-muted-foreground max-h-24 overflow-auto text-xs whitespace-pre-wrap">
                    {JSON.stringify(r.before ?? null)} → {JSON.stringify(r.after ?? null)}
                  </pre>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="text-muted-foreground px-3 py-6 text-center">
                  No entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  )
}
