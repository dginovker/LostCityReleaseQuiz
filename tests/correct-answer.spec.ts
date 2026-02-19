import { test, expect } from '@playwright/test'
import { clearFirestore, forceNewRound, getState, gotoReady, SAME_DAY_A, SAME_DAY_B, EARLY, LATE } from './helpers'

test.beforeEach(async () => { await clearFirestore() })

test('correct answer shows green highlight', async ({ page }) => {
  await gotoReady(page)

  await forceNewRound(page, EARLY.id, LATE.id)
  await expect(page.locator('.card-name').first()).toHaveText("Cook's Assistant")

  // Click the early one (correct answer)
  await page.locator('[data-testid="content-card"]').first().click()

  await expect(page.locator('.card-correct')).toHaveCount(1)
  await expect(page.getByText('Correct!')).toBeVisible()
})

test('correct answer updates streak', async ({ page }) => {
  await gotoReady(page)

  await forceNewRound(page, EARLY.id, LATE.id)
  await page.locator('[data-testid="content-card"]').first().click()

  const state = await getState(page)
  expect(state.streak).toBe(1)
  expect(state.elo).toBeGreaterThan(1200)
})

test('same-day correct answer increases ELO', async ({ page }) => {
  await gotoReady(page)

  // Same-day pairs have high difficulty (1.0), producing large ELO changes
  await forceNewRound(page, SAME_DAY_A.id, SAME_DAY_B.id)
  await page.locator('[data-testid="content-card"]').first().click()

  const state = await getState(page)
  expect(state.elo).toBeGreaterThan(1200)
})
