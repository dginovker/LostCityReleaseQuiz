import { test, expect } from '@playwright/test'
import { clearFirestore, forceNewRound, getState, gotoReady, SAME_DAY_A, SAME_DAY_B } from './helpers'

test.beforeEach(async () => { await clearFirestore() })

test('same-day pair: either answer is correct', async ({ page }) => {
  await gotoReady(page)

  await forceNewRound(page, SAME_DAY_A.id, SAME_DAY_B.id)

  const stateBefore = await getState(page)
  await page.locator('[data-testid="content-card"]').first().click()

  await expect(page.getByText('Correct!')).toBeVisible()
  await expect(page.locator('.card-correct')).toHaveCount(1)

  const stateAfter = await getState(page)
  expect(stateAfter.elo).toBeGreaterThanOrEqual(stateBefore.elo)
})

test('same-day pair: second card also correct', async ({ page }) => {
  await gotoReady(page)

  await forceNewRound(page, SAME_DAY_A.id, SAME_DAY_B.id)
  await page.locator('[data-testid="content-card"]').nth(1).click()

  await expect(page.getByText('Correct!')).toBeVisible()
})
