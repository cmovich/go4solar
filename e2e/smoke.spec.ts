import { expect, test, type Page } from '@playwright/test'

const NAIRA_SIGN = 0x20a6 // ₦

/**
 * Collects every piece of CSS the page loads: inline <style> blocks plus the text of each
 * <link rel="stylesheet"> (fetched through the same browser context).
 */
async function collectPageCss(page: Page): Promise<string> {
  const inline = await page.locator('style').allTextContents()
  const hrefs = await page
    .locator('link[rel="stylesheet"]')
    .evaluateAll((links) => links.map((l) => (l as HTMLLinkElement).href))
  const linked = await Promise.all(
    hrefs.map(async (href) => {
      const res = await page.request.get(href)
      return res.ok() ? res.text() : ''
    }),
  )
  return [...inline, ...linked].join('\n')
}

/** True if any @font-face in the CSS has a unicode-range covering the given code point. */
function fontFaceCovers(css: string, codePoint: number): boolean {
  const blocks = css.match(/@font-face\s*\{[^}]*\}/gi) ?? []
  return blocks.some((block) => {
    const m = /unicode-range\s*:\s*([^;}]+)/i.exec(block)
    if (!m?.[1]) return false
    return m[1].split(',').some((part) => {
      const range = /U\+([0-9A-F?]+)(?:-([0-9A-F]+))?/i.exec(part.trim())
      if (!range?.[1]) return false
      const start = parseInt(range[1].replace(/\?/g, '0'), 16)
      const end = range[2] ? parseInt(range[2], 16) : parseInt(range[1].replace(/\?/g, 'F'), 16)
      return codePoint >= start && codePoint <= end
    })
  })
}

test('home page returns 200 and links to the load calculator', async ({ page }) => {
  const response = await page.goto('/')
  expect(response?.status()).toBe(200)

  const cta = page.getByRole('link', { name: /calculate my load/i }).first()
  await expect(cta).toBeVisible()
  await expect(cta).toHaveAttribute('href', '/calculate')
})

test('page CSS has a @font-face whose unicode-range includes ₦ (U+20A6, latin-ext)', async ({
  page,
}) => {
  await page.goto('/')
  const css = await collectPageCss(page)
  expect(css).toContain('@font-face')
  expect(fontFaceCovers(css, NAIRA_SIGN)).toBe(true)
})
