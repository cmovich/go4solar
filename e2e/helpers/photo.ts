import { expect, type Page } from '@playwright/test'

// A tiny valid PNG (the mock provider does not look at it).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

async function uploadPhoto(page: Page) {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Upload a photo' }).click(),
  ])
  await chooser.setFiles({ name: 'photo.png', mimeType: 'image/png', buffer: PNG })
}

async function blenderCard(page: Page) {
  await page.goto('/calculate')
  await page.getByRole('button', { name: 'Kitchen Appliances' }).click()
  await page.getByRole('button', { name: /^Blender/ }).click()
  const card = page.getByTestId('item-card').filter({ hasText: 'Blender' })
  // The button shows once /api/vision/status says the lookup is open.
  await card.getByRole('button', { name: /Find the watts/ }).click({ timeout: 15_000 })
  return card
}

/** Part C: a label photo gives exact watts; nothing changes until "Use this value". */
export async function labelPhoto(page: Page) {
  const card = await blenderCard(page)
  await page.getByRole('button', { name: /Photo of the label/ }).click()
  await uploadPhoto(page)
  await expect(page.getByText('150 W', { exact: true })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Read from the label · Refrigerator')).toBeVisible()
  await expect(card.getByLabel('Watts', { exact: true })).toHaveValue('400')
  await page.getByRole('button', { name: 'Use this value' }).click()
  await expect(card.getByLabel('Watts', { exact: true })).toHaveValue('150')
  await expect(card.getByTestId('watts-source')).toHaveText('From the label')
}

/** Part C: an appliance photo gives a range, sized at the 70th percentile, marked "Estimated". */
export async function appliancePhoto(page: Page) {
  const card = await blenderCard(page)
  await page.getByRole('button', { name: /Photo of the appliance/ }).click()
  await uploadPhoto(page)
  await expect(page.getByTestId('photo-estimate')).toContainText('170 W', { timeout: 15_000 })
  await expect(page.getByTestId('photo-estimate')).toContainText('Estimated')
  await expect(page.getByText(/usually 100–200 W/)).toBeVisible()
  await page.getByRole('button', { name: 'Use this value' }).click()
  await expect(card.getByLabel('Watts', { exact: true })).toHaveValue('170')
  await expect(card.getByTestId('watts-source')).toContainText('Estimated')
  await expect(card.getByTestId('watts-source')).toContainText('usually 100–200 W')
  // Typing the watts replaces the estimate.
  await card.getByLabel('Watts', { exact: true }).fill('180')
  await expect(card.getByTestId('watts-source')).toHaveCount(0)
  // Saved on this device with the estimate cleared.
  const saved = await page.evaluate(() => localStorage.getItem('g4s.calculator.v1'))
  expect(saved).toContain('"watts":180')
  expect(saved).not.toContain('wattsSource')
}

/** Cap reached or no key: the photo button is hidden and typing the watts works as before. */
export async function photoClosed(page: Page) {
  await page.route('**/api/vision/status', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"open":false}' }),
  )
  await page.goto('/calculate')
  await page.getByRole('button', { name: 'Kitchen Appliances' }).click()
  await page.getByRole('button', { name: /^Blender/ }).click()
  const card = page.getByTestId('item-card').filter({ hasText: 'Blender' })
  await expect(card.getByLabel('Watts', { exact: true })).toBeVisible()
  await page.waitForTimeout(1000)
  await expect(card.getByTestId('photo-watts')).toHaveCount(0)
  await card.getByLabel('Watts', { exact: true }).fill('350')
  await expect(card.getByLabel('Watts', { exact: true })).toHaveValue('350')
}
