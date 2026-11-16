import { expect, test } from '@playwright/test'

import {
  auditRows,
  freeTestFiles,
  loanOf,
  profileIdByEmail,
  queueRow,
  routeToSpewa,
  spewaMigrated,
} from './helpers/spewa'
import { loginAsStaff } from './helpers/staff'

/**
 * SPEWA routing (back office only). Test applications are put in the SPEWA queue (as routing does
 * after the deposit; the routing rule itself is unit-tested), then: the Applications filter, the
 * cheques note by our staff, the funder approver's view (nothing else in admin), bulk decline
 * (back to the general queue, audited) and approve (final approval, test funder).
 */
test.describe.serial('SPEWA approvals', () => {
  let ready = ''
  let others: string[] = []

  test.beforeAll(async () => {
    test.skip(!(await spewaMigrated()), 'migration 0038 not applied yet')
    ready = (await freeTestFiles(1, true))[0]!
    others = (await freeTestFiles(3)).filter((id) => id !== ready).slice(0, 2)
    await routeToSpewa([ready!, ...others])
  })

  test.beforeEach(() => {
    test.skip(test.info().project.name === 'mobile', 'one browser is enough (two-factor codes)')
  })

  test('our staff: Routed to SPEWA filter, no decision on the general page, cheques note', async ({
    page,
  }) => {
    await loginAsStaff(page)
    await page.goto('/admin/applications?routed=spewa&test=1')
    const queue = page.getByTestId('applications-queue')
    for (const id of [ready, ...others])
      await expect(queue.locator(`a[href="/admin/applications/${id}"]`)).toBeVisible()
    // Every row in the filtered list carries the SPEWA badge.
    const rows = await queue.locator('tbody tr').count()
    await expect(queue.getByTestId('routed-spewa')).toHaveCount(rows)
    await expect(queue.getByTestId('routed-spewa').first()).toContainText('SPEWA')

    // The general page: a note, and no approve or decline there.
    await page.goto(`/admin/applications/${others[0]}`)
    await expect(page.getByTestId('spewa-routing-note')).toContainText(
      "waiting for SPEWA's decision",
    )
    await expect(page.getByRole('button', { name: /^Approve/ })).toHaveCount(0)

    // Cheques note (by hand): yes, 3, today.
    await page.goto(`/admin/spewa/${others[0]}`)
    const form = page.getByTestId('cheques-form')
    await form.getByLabel('Yes').check()
    await form.getByLabel('Number of cheques').fill('3')
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' })
    await form.getByLabel('Date received').fill(today)
    await form.getByTestId('cheques-save').click()
    await expect(form.getByTestId('cheques-message')).toHaveText('Saved.')
    await expect.poll(async () => (await queueRow(others[0]!))?.cheques_count).toBe(3)
  })

  test('funder approver: SPEWA queue only; bulk decline and approve, audited', async ({ page }) => {
    test.skip(!process.env.E2E_SPEWA_EMAIL, 'no funder approver test account')
    await loginAsStaff(page, 'spewa')
    // Menu: SPEWA approvals and nothing else.
    const nav = page.getByRole('navigation').filter({ hasText: 'SPEWA approvals' }).first()
    await expect(nav.getByRole('link')).toHaveText(['SPEWA approvals'])
    // Every other admin page sends it back to the queue; exports are refused.
    for (const path of ['/admin', '/admin/applications', '/admin/waitlist', '/admin/staff']) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/admin\/spewa$/)
    }
    await page.goto(`/admin/applications/${ready}`)
    await expect(page).not.toHaveURL(new RegExp(`/admin/applications/${ready}`))
    const csv = await page.request.get('/api/admin/waitlist/export.csv', { maxRedirects: 0 })
    expect(csv.status()).not.toBe(200)

    // Bulk decline: the two other files, with a reason.
    await page.goto('/admin/spewa?test=1')
    for (const id of others) await page.getByTestId(`spewa-row-${id}`).getByRole('checkbox').check()
    await page.getByTestId('spewa-decline-open').click()
    await page.getByLabel(/Reason/).fill('Outside the programme (e2e)')
    await page.getByTestId('spewa-decline').click()
    await expect(page.getByTestId('spewa-result')).toContainText('2 declined.')
    const approver = await profileIdByEmail(process.env.E2E_SPEWA_EMAIL!)
    for (const id of others) {
      await expect.poll(async () => (await queueRow(id))?.decision).toBe('declined')
      expect((await queueRow(id))?.decided_by).toBe(approver)
      expect((await auditRows('funder_queue.decline', id)).map((a) => a.actor_id)).toEqual([
        approver,
      ])
    }

    // A declined file: decision, KYC, documents and the cheques note (read only for SPEWA).
    await page.goto(`/admin/spewa/${others[0]}`)
    await expect(page.getByTestId('spewa-file-decision')).toHaveText('Declined')
    await expect(page.getByTestId('spewa-kyc')).toContainText('NIN')
    await expect(page.getByTestId('cheques-view')).toContainText('Received: yes · 3 cheques')
    await expect(page.getByTestId('cheques-form')).toHaveCount(0)

    // Approve the ready file: final approval (test customers draw on the test funder).
    await page.goto(`/admin/spewa/${ready}`)
    await page.getByTestId('spewa-approve').click()
    await expect(page.getByTestId('spewa-result')).toContainText('1 approved.')
    await expect(page.getByTestId('spewa-file-decision')).toHaveText('Approved')
    const loan = await loanOf(ready)
    expect(loan?.status).toBe('approved')
    expect((await auditRows('funder_queue.approve', ready)).map((a) => a.actor_id)).toEqual([
      approver,
    ])
  })

  test('back in the general queue after SPEWA declines', async ({ page }) => {
    await loginAsStaff(page)
    await page.goto(`/admin/applications/${others[1]}`)
    await expect(page.getByTestId('spewa-routing-note')).toContainText('declined')
    await expect(page.getByTestId('spewa-routing-note')).toContainText('general queue')
  })
})
