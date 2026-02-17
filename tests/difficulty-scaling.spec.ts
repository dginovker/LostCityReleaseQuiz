import { test, expect } from '@playwright/test'
import { clearFirestore, clickNext, gotoReady } from './helpers'

test.beforeEach(async () => { await clearFirestore() })

test('quiz runs 10 rounds without error', async ({ page }) => {
  await gotoReady(page)

  for (let i = 0; i < 10; i++) {
    await page.locator('[data-testid="content-card"]').first().click()
    await expect(page.locator('.card-date')).toHaveCount(2)
    await clickNext(page)
  }

  // Completed 10 rounds successfully
  await expect(page.locator('[data-testid="content-card"]')).toHaveCount(2)
})
