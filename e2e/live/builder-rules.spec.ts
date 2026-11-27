import { test } from '@playwright/test'

import {
  cheapestSkus,
  panelsOffTheRoof,
  singleItemHasNoService,
  sliderMatchesBreakdown,
  systemWithoutPanels,
} from '../helpers/builderRules'

/** Builder: installation and delivery rule, question order, deposit slider (live). */
test.describe('builder rules', () => {
  test.setTimeout(180_000)
  test('one inverter: no installation, delivery or pack; no questions', async ({ page }) => {
    await singleItemHasNoService(page, (await cheapestSkus()).inverter)
  })
  test('inverter + battery: asked first, no mounting questions, ticks follow', async ({ page }) => {
    await systemWithoutPanels(page, await cheapestSkus())
  })
  test('inverter + 2 panels: mounting first, roof type only for a roof', async ({ page }) => {
    await panelsOffTheRoof(page, await cheapestSkus())
  })
  test('slider and breakdown show the same deposit', async ({ page }) => {
    await sliderMatchesBreakdown(page, (await cheapestSkus()).inverter)
  })
})
