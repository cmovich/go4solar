import { expect, test, type Page } from '@playwright/test'

import { ownConnection } from './helpers/connection'

import { answerQuoteQuestions } from './helpers/questions'
import { testEmail, testPhone } from './helpers/test-identity'

/**
 * The waiting-list journey never asks for details again (PR #34 review): "Adjust this quote" and
 * the change links come straight back to the plans; Back keeps every answer.
 */
test.beforeEach(async ({ context }) => ownConnection(context))

test.describe('waiting-list journey: answers kept, nothing asked twice', () => {
  test.setTimeout(240_000)

  async function toPlans(page: Page) {
    const phone = testPhone()
    await page.goto('/waitlist')
    await page.getByRole('button', { name: 'Lighting' }).click()
    await page.getByRole('button', { name: /^LED bulb/ }).click()
    await page.getByRole('button', { name: 'Kitchen Appliances' }).click()
    await page.getByRole('button', { name: /^Fridge/ }).click()
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('button', { name: 'Get quotes' }).click()
    await page.getByLabel('Phone number').fill(phone)
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByLabel('Email address').fill(testEmail('journey', phone))
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByLabel('First name').fill('Amaka')
    await page.getByLabel('Surname').fill('Okoro')
    await page.getByLabel('State of installation').selectOption('Lagos')
    await page.getByLabel('Local government area').fill('Ikeja')
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByRole('heading', { name: 'Who is this solar for?' })).toBeVisible({
      timeout: 20000,
    })
    await page.getByRole('button', { name: /My home/ }).click()
    await answerQuoteQuestions(page)
    await expect(
      page.getByRole('heading', { name: 'What do you pay for power today?' }),
    ).toBeVisible({ timeout: 20000 })
    await page.getByRole('button', { name: 'Petrol generator' }).click()
    await page
      .getByLabel('How much do you spend on generator fuel in a typical week?')
      .fill('12000')
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByRole('heading', { name: 'Here are your plans, Amaka' })).toBeVisible({
      timeout: 30000,
    })
    return phone
  }

  const total = async (page: Page, plan: string) =>
    /total (₦[\d,]+)/.exec((await page.getByTestId(`plan-card-${plan}`).innerText()) ?? '')?.[1]

  test('plans → Adjust this quote → change an item → back on the plans, new price, no details asked', async ({
    page,
  }) => {
    await toPlans(page)
    const before = await total(page, 'comfort')
    await page.getByTestId('adjust-comfort').click()
    await expect(page).toHaveURL(/\/build\?lead=.*&plan=comfort/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Choose your items', {
      timeout: 30000,
    })
    // One more battery.
    const batteries = page.getByTestId('bar-battery')
    await batteries.getByRole('button').first().click()
    await batteries
      .getByRole('button', { name: /^More / })
      .first()
      .click()
    await expect(page.getByTestId('build-blocking')).toHaveCount(0)
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    // Straight to the summary: no roof/wire questions, no details form.
    await expect(page.getByTestId('adjust-note')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Your details' })).toHaveCount(0)
    await expect(page.getByLabel('Phone number')).toHaveCount(0)
    await page.getByTestId('update-plans').click()
    // Back on the plans of the same sign-up.
    await expect(page.getByRole('heading', { name: 'Here are your plans, Amaka' })).toBeVisible({
      timeout: 30000,
    })
    await expect(page.getByTestId('adjusted-comfort')).toHaveText('Adjusted by you')
    expect(await total(page, 'comfort')).not.toBe(before)
    await expect(page.getByLabel('Phone number')).toHaveCount(0)
    // And the journey goes on from here.
    await page.getByTestId('choose-comfort').click()
    await expect(page.getByRole('heading', { name: 'How much can you pay upfront?' })).toBeVisible()
  })

  test('Back moves one step at a time and every answer is still there', async ({ page }) => {
    const phone = await toPlans(page)
    // Let each screen finish sliding in before tapping Back again.
    const back = async () => {
      await page.waitForTimeout(600)
      await page.getByRole('button', { name: /Back/ }).first().click()
      await page.waitForTimeout(600)
    }
    await back()
    await expect(page.getByRole('button', { name: 'Petrol generator' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(
      page.getByLabel('How much do you spend on generator fuel in a typical week?'),
    ).toHaveValue('12,000')
    // Back into the quote questions: the LAST one first (wire), with its answer.
    await back()
    await expect(page.getByTestId('q-wire')).toBeVisible()
    await expect(page.getByRole('button', { name: /^No, estimate it for me/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    // Then back through the rest to "Who is this solar for?".
    for (let i = 0; i < 12; i++) {
      if (await page.getByRole('heading', { name: 'Who is this solar for?' }).isVisible()) break
      await back()
    }
    await expect(page.getByRole('button', { name: /My home/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await back()
    await expect(page.getByLabel('First name')).toHaveValue('Amaka')
    await expect(page.getByLabel('Surname')).toHaveValue('Okoro')
    await expect(page.getByLabel('Local government area')).toHaveValue('Ikeja')
    await back()
    await expect(page.getByLabel('Email address')).toHaveValue(/@go4solar\.test$/)
    await back()
    await expect(page.getByLabel('Phone number')).toHaveValue(phone)
    await page.waitForTimeout(600)
    // Forward again keeps going with the same answers.
    await page.getByRole('button', { name: 'Next' }).click({ timeout: 15000 })
    await expect(page.getByLabel('Email address')).toHaveValue(/@go4solar\.test$/)
  })

  test('Change my appliances → back on the plans with new prices, no details asked', async ({
    page,
  }) => {
    await toPlans(page)
    const before = await total(page, 'comfort')
    await page.getByTestId('change-appliances').click()
    await page.getByRole('button', { name: 'Kitchen Appliances' }).click()
    await page.getByRole('button', { name: /^Blender/ }).click()
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('button', { name: 'Get quotes' }).click()
    await expect(page.getByRole('heading', { name: 'Here are your plans, Amaka' })).toBeVisible({
      timeout: 30000,
    })
    expect(await total(page, 'comfort')).not.toBe(before)
  })

  test('Edit my details: filled in, then straight back to the plans', async ({ page }) => {
    await toPlans(page)
    await page.getByTestId('edit-details').click()
    await expect(page.getByLabel('Phone number')).not.toHaveValue('')
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByLabel('Email address')).not.toHaveValue('')
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByLabel('First name')).toHaveValue('Amaka')
    await page.getByLabel('Surname').fill('Okoro-Bello')
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByRole('heading', { name: 'Here are your plans, Amaka' })).toBeVisible({
      timeout: 30000,
    })
  })
})
