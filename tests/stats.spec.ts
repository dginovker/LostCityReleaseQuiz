import { test, expect } from '@playwright/test'
import { clearFirestore, forceNewRound, clickNext, gotoReady, EARLY, LATE } from './helpers'

test.beforeEach(async () => { await clearFirestore() })

test('stats page shows accurate data after playing', async ({ page }) => {
  await gotoReady(page)

  // Round 1: correct
  await forceNewRound(page, EARLY.id, LATE.id)
  await page.locator('[data-testid="content-card"]').first().click()
  await clickNext(page)

  // Round 2: correct
  await forceNewRound(page, EARLY.id, LATE.id)
  await page.locator('[data-testid="content-card"]').first().click()
  await clickNext(page)

  // Round 3: incorrect
  await forceNewRound(page, EARLY.id, LATE.id)
  await page.locator('[data-testid="content-card"]').nth(1).click()

  // Navigate to stats via client-side routing (preserves composable state)
  await page.click('a:has-text("Stats")')

  await expect(page.locator('.stat-row:has-text("Games Played") .yellow')).toHaveText('3')
  await expect(page.locator('.stat-row:has-text("Accuracy") .yellow')).toHaveText('67%')
  await expect(page.locator('.stat-row:has-text("Best Streak") .yellow')).toHaveText('2')
})

test('back to quiz link works', async ({ page }) => {
  await page.goto('/#/stats')
  await page.click('a:has-text("Back to Quiz")')
  await expect(page.locator('[data-testid="content-card"]')).toHaveCount(2)
})
