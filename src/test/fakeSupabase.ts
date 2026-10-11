import { randomUUID } from 'node:crypto'

type Row = Record<string, unknown>
type Filter = (r: Row) => boolean
type Result = {
  data: unknown
  error: { code: string; message: string } | null
  count?: number | null
}

/**
 * Test helper: an in-memory stand-in for the Supabase query builder, enough for the server code
 * under test (select/insert/update/upsert with eq/neq/in/is filters, order, limit, single). Unique
 * keys are enforced like Postgres (error code 23505).
 */
export function fakeSupabase(unique: Record<string, string[][]> = {}) {
  const tables = new Map<string, Row[]>()
  const rows = (t: string) => {
    if (!tables.has(t)) tables.set(t, [])
    return tables.get(t)!
  }

  function violates(t: string, candidate: Row, except?: Row): boolean {
    return (unique[t] ?? []).some((cols) =>
      rows(t).some(
        (r) =>
          r !== except &&
          cols.every(
            (c) => candidate[c] !== null && candidate[c] !== undefined && r[c] === candidate[c],
          ),
      ),
    )
  }
  const dup = { code: '23505', message: 'duplicate key value violates unique constraint' }

  function from(t: string) {
    const filters: Filter[] = []
    let op: 'select' | 'insert' | 'update' | 'upsert' = 'select'
    let payload: Row[] = []
    let patch: Row = {}
    let returning = false
    let head = false
    let wantCount = false
    let orderBy: { col: string; asc: boolean } | null = null
    let max: number | null = null
    let upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } = {}

    const matched = () => rows(t).filter((r) => filters.every((f) => f(r)))

    function run(): Result {
      if (op === 'insert' || op === 'upsert') {
        const out: Row[] = []
        for (const p of payload) {
          const row: Row = { id: randomUUID(), created_at: new Date().toISOString(), ...p }
          if (violates(t, row)) {
            if (op === 'upsert' && upsertOpts.ignoreDuplicates) continue
            return { data: null, error: dup }
          }
          rows(t).push(row)
          out.push(row)
        }
        return { data: returning ? out : null, error: null }
      }
      if (op === 'update') {
        const hit = matched()
        for (const r of hit)
          if (violates(t, { ...r, ...patch }, r)) return { data: null, error: dup }
        for (const r of hit) Object.assign(r, patch)
        return { data: returning ? hit : null, error: null }
      }
      let list = matched()
      if (orderBy) {
        const { col, asc } = orderBy
        list = [...list].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1))
      }
      if (max !== null) list = list.slice(0, max)
      return { data: head ? null : list, error: null, count: wantCount ? list.length : null }
    }

    const q = {
      select(_cols?: string, opts?: { count?: string; head?: boolean }) {
        if (op !== 'select') returning = true
        if (opts?.count) wantCount = true
        if (opts?.head) head = true
        return q
      },
      insert(p: Row | Row[]) {
        op = 'insert'
        payload = Array.isArray(p) ? p : [p]
        return q
      },
      upsert(p: Row | Row[], opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
        op = 'upsert'
        payload = Array.isArray(p) ? p : [p]
        upsertOpts = opts
        return q
      },
      update(p: Row) {
        op = 'update'
        patch = p
        return q
      },
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
      neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), q),
      in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), q),
      is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), q),
      order: (col: string, o?: { ascending?: boolean }) => (
        (orderBy = { col, asc: o?.ascending !== false }),
        q
      ),
      limit: (n: number) => ((max = n), q),
      async maybeSingle() {
        const r = run()
        const list = (r.data as Row[] | null) ?? []
        return { data: list[0] ?? null, error: r.error }
      },
      async single() {
        const r = run()
        const list = (r.data as Row[] | null) ?? []
        return list.length === 1
          ? { data: list[0], error: null }
          : { data: null, error: r.error ?? { code: 'PGRST116', message: 'not exactly one row' } }
      },
      then(resolve: (r: Result) => unknown, reject?: (e: unknown) => unknown) {
        try {
          return Promise.resolve(resolve(run()))
        } catch (e) {
          return reject ? Promise.resolve(reject(e)) : Promise.reject(e)
        }
      },
    }
    return q
  }

  return {
    client: { from },
    rows,
    seed(t: string, ...list: Row[]) {
      for (const r of list)
        rows(t).push({ id: randomUUID(), created_at: new Date().toISOString(), ...r })
    },
  }
}
