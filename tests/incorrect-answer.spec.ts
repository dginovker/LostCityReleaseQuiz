import { test, expect } from '@playwright/test'
import { clearFirestore, forceNewRound, getState, gotoReady, EARLY, LATE } from './helpers'

test.beforeEach(async () => { await clearFirestore() })

test('incorrect answer shows red highlight and decreases ELO', async ({ page }) => {
  await gotoReady(page)

  await forceNewRound(page, EARLY.id, LATE.id)
  await expect(page.locator('.card-name').first()).toHaveText("Cook's Assistant")

  // Click the LATE one (incorrect — it was released second)
  await page.locator('[data-testid="content-card"]').nth(1).click()

  await expect(page.locator('.card-incorrect')).toHaveCount(1)
  await expect(page.locator('.card-correct')).toHaveCount(1)
  await expect(page.getByText('Wrong!')).toBeVisible()

  const state = await getState(page)
  expect(state.streak).toBe(0)
})
