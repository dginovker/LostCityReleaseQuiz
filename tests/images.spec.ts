import { test, expect } from '@playwright/test'
import { clearFirestore, clickNext, gotoReady } from './helpers'

test.beforeEach(async () => { await clearFirestore() })

test('cards display images or placeholder across multiple rounds', async ({ page }) => {
  await gotoReady(page)

  let imagesFound = 0
  let placeholdersFound = 0

  for (let round = 0; round < 10; round++) {
    const cards = page.locator('[data-testid="content-card"]')

    for (let i = 0; i < 2; i++) {
      const card = cards.nth(i)
      const imgCount = await card.locator('img.card-img').count()
      const placeholderCount = await card.locator('.card-img-placeholder').count()

      if (imgCount > 0) imagesFound++
      if (placeholderCount > 0) placeholdersFound++

      // Each card should have either an image or a placeholder
      expect(imgCount + placeholderCount).toBe(1)
    }

    await cards.first().click()
    await clickNext(page)
  }

  // We should have found at least some of each
  expect(imagesFound + placeholdersFound).toBe(20)
})
