import { closeSync, existsSync, openSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

/**
 * There is ONE open test export queue, shared by every test that exports: only one test may use
 * it at a time (tests run in parallel). Hold the lock for the whole queue → export section; a lock
 * older than 15 minutes (a crashed run) is stale.
 */
const LOCK = path.join(tmpdir(), 'g4s-e2e-export-queue.lock')

export async function withTestExportQueue<T>(fn: () => Promise<T>): Promise<T> {
  for (;;) {
    try {
      closeSync(openSync(LOCK, 'wx'))
      break
    } catch {
      if (existsSync(LOCK) && Date.now() - statSync(LOCK).mtimeMs > 15 * 60_000) {
        rmSync(LOCK, { force: true })
        continue
      }
      await new Promise((r) => setTimeout(r, 2_000))
    }
  }
  try {
    return await fn()
  } finally {
    rmSync(LOCK, { force: true })
  }
}
