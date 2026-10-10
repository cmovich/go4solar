import { expect, test } from '@playwright/test'

test.describe('load calculator', () => {
  test('add LED bulb ×10 and a fridge, totals update', async ({ page }) => {
    await page.goto('/calculate')
    await expect(page.getByRole('heading', { level: 1, name: 'Calculate your load' })).toBeVisible()

    // Totals start at zero.
    await expect(page.getByTestId('total-running')).toHaveText('0 W')

    // Lighting → LED bulb
    await page.getByRole('button', { name: 'Lighting' }).click()
    await page.getByRole('button', { name: /^LED bulb/ }).click()
    const led = page.getByTestId('item-card').filter({ hasText: 'LED bulb' })
    await expect(led).toBeVisible()
    await expect(page.getByTestId('total-running')).toHaveText('10 W')

    await led.getByLabel('Quantity').fill('10')
    await expect(page.getByTestId('total-running')).toHaveText('100 W')

    // Kitchen → Fridge (150 W, surge ×3, duty 0.4, 24 h)
    await page.getByRole('button', { name: 'Kitchen Appliances' }).click()
    await page.getByRole('button', { name: /^Fridge/ }).click()
    await expect(page.getByTestId('item-card')).toHaveCount(2)

    await expect(page.getByTestId('total-running')).toHaveText('250 W')
    await expect(page.getByTestId('total-surge')).toHaveText('550 W')
    // 100 W × 6 h + 150 W × 24 h × 0.4 = 0.6 + 1.44 kWh
    await expect(page.getByTestId('total-kwh')).toHaveText('2.04 kWh')

    // The next step is available once there are items.
    await expect(page.getByRole('link', { name: 'See my solar plans' })).toBeVisible()
  })

  test('the list survives a reload (localStorage)', async ({ page }) => {
    await page.goto('/calculate')
    await page.getByRole('button', { name: 'Lighting' }).click()
    await page.getByRole('button', { name: /^LED bulb/ }).click()
    await expect(page.getByTestId('total-running')).toHaveText('10 W')

    await page.reload()
    await expect(page.getByTestId('item-card')).toHaveCount(1)
    await expect(page.getByTestId('total-running')).toHaveText('10 W')

    await page.getByRole('button', { name: 'Remove LED bulb' }).click()
    await expect(page.getByTestId('item-card')).toHaveCount(0)
  })

  test('heavy items show the warning and "Add your own" works', async ({ page }) => {
    await page.goto('/calculate')
    await page.getByRole('button', { name: 'Laundry and Home Care' }).click()
    await page.getByRole('button', { name: /^Pressing iron/ }).click()
    await expect(page.getByTestId('heavy-warning')).toContainText('Pressing iron')

    await page.getByRole('button', { name: 'Lighting' }).click()
    await page.getByRole('button', { name: 'Add your own' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Name', { exact: true }).fill('Chandelier')
    await dialog.getByLabel('Watts', { exact: true }).fill('120')
    await page.getByRole('button', { name: 'Add appliance' }).click()
    await expect(page.getByTestId('item-card').filter({ hasText: 'Chandelier' })).toBeVisible()
    await expect(page.getByTestId('total-running')).toHaveText('1,320 W')
  })

  test('photo lookup (mock) offers a value and never fills it in by itself', async ({ page }) => {
    await page.goto('/calculate')
    await page.getByRole('button', { name: 'Kitchen Appliances' }).click()
    await page.getByRole('button', { name: /^Blender/ }).click()
    const card = page.getByTestId('item-card').filter({ hasText: 'Blender' })
    await card.getByRole('button', { name: /Find the watts/ }).click()

    // A tiny valid PNG.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64',
    )
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Upload a photo' }).click(),
    ])
    await chooser.setFiles({ name: 'label.png', mimeType: 'image/png', buffer: png })

    await expect(page.getByText('150 W', { exact: true })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Read from the label · Refrigerator')).toBeVisible()
    // Still the default until the user taps "Use this value".
    await expect(card.getByLabel('Watts', { exact: true })).toHaveValue('400')
    await page.getByRole('button', { name: 'Use this value' }).click()
    await expect(card.getByLabel('Watts', { exact: true })).toHaveValue('150')
  })
})
