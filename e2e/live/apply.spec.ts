import { expect, test, type Page } from '@playwright/test'

import {
  PDF,
  PNG,
  hasDb,
  latestOutboxText,
  newPerson,
  throughAccount,
  throughDetails,
} from './helpers'

async function upload(page: Page, label: string, file: typeof PNG, kind: string) {
  await page.getByLabel(label).setInputFiles(file)
  await expect(page.getByTestId(`uploaded-${kind}`)).toBeVisible({ timeout: 20000 })
}

async function step(page: Page, id: string) {
  await expect(page.getByTestId(`step-${id}`)).toBeVisible({ timeout: 20000 })
}

/** NIN → BVN → consent → face → address (shared by both pathways). */
async function identityAndAddress(page: Page) {
  await step(page, 'nin')
  await upload(page, 'Front of your NIN slip or card', PNG, 'nin_front')
  // A failing NIN first: the attempt is counted and the applicant can try again.
  await page.getByLabel('NIN (11 digits)').fill('00000000000')
  await page.getByRole('button', { name: 'Verify my NIN' }).click()
  await expect(page.getByText(/2 attempts left/)).toBeVisible({ timeout: 20000 })
  await page.getByLabel('NIN (11 digits)').fill('11111111111')
  await page.getByRole('button', { name: 'Verify my NIN' }).click()

  await step(page, 'bvn')
  await page.getByLabel('BVN (11 digits)').fill('22222222222')
  await page.getByRole('button', { name: 'Verify my BVN' }).click()

  await step(page, 'consent')
  await page.getByRole('checkbox', { name: 'Biometric consent' }).check()
  await page.getByRole('button', { name: 'I agree' }).click()

  await step(page, 'face')
  await page.getByRole('button', { name: 'Start the face check' }).click()
  await expect(page.getByTestId('face-prompt')).toBeVisible()

  await step(page, 'address')
  await upload(page, 'Proof of', PDF, 'address_proof')
  await page.getByLabel('Street address').fill('12 Allen Avenue')
  await page.getByLabel('Town or city').fill('Ikeja')
  await page.getByLabel('LGA').fill('Ikeja')
  await page.getByLabel('Latitude').fill('6.6018')
  await page.getByLabel('Longitude').fill('3.3515')
  await page.getByRole('button', { name: 'Save address' }).click()
}

async function guarantorAndReview(page: Page) {
  await step(page, 'guarantor')
  await page.getByLabel('Full name').fill('Ngozi Eze')
  await page.getByLabel('Phone').fill('08099990000')
  await page.getByLabel('Email').fill('ngozi@go4solar.test')
  await page.getByLabel('Relationship to you').fill('Sister')
  await page.getByRole('button', { name: 'Save' }).click()

  await step(page, 'review')
  await expect(page.getByText('•••••••1111')).toBeVisible()
  await expect(page.getByText('•••••••2222')).toBeVisible()
  // The raw numbers are never shown.
  await expect(page.getByText('11111111111')).toHaveCount(0)
  await page.getByRole('button', { name: 'Confirm my application' }).click()
  await expect(page.getByTestId('next-sign')).toContainText('Next: sign your agreement', {
    timeout: 20000,
  })
}

test.describe('live mode: application wizard with mock KYC', () => {
  test.skip(!hasDb, 'needs Supabase env')

  test('individual: details → NIN → BVN → consent → face → address → income → next of kin → guarantor → review', async ({
    page,
  }) => {
    const p = newPerson('individual')
    await throughDetails(page, p)
    await throughAccount(page, p)

    // Email: banner until the link is used.
    await expect(page.getByTestId('email-banner')).toBeVisible()
    const link = /(https?:\/\/\S+\/verify-email\?token=\S+)/.exec(
      await latestOutboxText('verify_email', p.email),
    )?.[1]
    expect(link).toBeTruthy()
    await page.goto(link!.replace(/^https?:\/\/[^/]+/, ''))
    await expect(page.getByText('Thank you — your email is confirmed.')).toBeVisible()
    await expect(page.getByTestId('email-banner')).toHaveCount(0)

    // Prefilled: name, phone and email are already there.
    await step(page, 'details')
    await expect(page.getByLabel('First name')).toHaveValue('Chidi')
    await expect(page.getByText(`+234${p.phone.slice(1)}`)).toBeVisible()
    await page.getByLabel('Date of birth').fill('1990-05-14')
    await page.getByRole('button', { name: 'These are correct' }).click()

    await identityAndAddress(page)

    await step(page, 'income')
    await page.getByLabel('How do you earn your income?').selectOption('employed')
    await page.getByLabel('Your monthly income').selectOption('250k_500k')
    await page.getByRole('button', { name: 'Save' }).click()

    await step(page, 'nextOfKin')
    await page.getByLabel('Full name').fill('Emeka Eze')
    await page.getByLabel('Phone').fill('08088880000')
    await page.getByLabel('Relationship to you').fill('Brother')
    await page.getByRole('button', { name: 'Save' }).click()

    await guarantorAndReview(page)
  })

  test('business: CAC (needs certificate + director tick) → owner KYC → business statements → guarantor → review', async ({
    page,
  }) => {
    const p = newPerson('business')
    await throughDetails(page, p)
    await throughAccount(page, p)

    await step(page, 'details')
    await expect(page.getByLabel('Business name')).toHaveValue('Eze Stores')
    await page.getByLabel('Date of birth').fill('1985-01-20')
    await page.getByRole('button', { name: 'These are correct' }).click()

    await step(page, 'business')
    // Requirements are enforced: certificate first, then the director tick.
    await page.getByLabel('CAC number').fill('RC123456')
    await page.getByRole('button', { name: 'Verify my business' }).click()
    await expect(page.getByText(/Tick to confirm you are a director/)).toBeVisible()
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Verify my business' }).click()
    await expect(page.getByText('Upload your CAC certificate first.')).toBeVisible()
    await upload(page, 'CAC certificate', PDF, 'cac_certificate')
    await page.getByRole('button', { name: 'Verify my business' }).click()

    await identityAndAddress(page)

    await step(page, 'income')
    await page.getByLabel('Typical monthly income of the business').selectOption('1m_3m')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(
      page.getByText('Upload 6 months of business bank statements (PDF) first.'),
    ).toBeVisible()
    await upload(page, 'Business bank statements (last 6 months, PDF)', PDF, 'business_statement')
    await page.getByRole('button', { name: 'Save' }).click()

    await guarantorAndReview(page)
    await expect(page.getByText(/CAC RC123456/)).toBeVisible()
  })
})
