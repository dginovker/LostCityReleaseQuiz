import { test, expect } from '@playwright/test'
import { clearFirestore, forceNewRound, getState, gotoReady, clickNext, SAME_DAY_A, SAME_DAY_B, EARLY, LATE } from './helpers'

test.beforeEach(async () => { await clearFirestore() })

test('streak increments on correct answers and resets on wrong answer', async ({ page }) => {
  await gotoReady(page)

  // Get 3 correct in a row
  for (let i = 0; i < 3; i++) {
    await forceNewRound(page, EARLY.id, LATE.id)
    await page.locator('[data-testid="content-card"]').first().click()
    if (i < 2) await clickNext(page)
  }

  const afterCorrect = await getState(page)
  expect(afterCorrect.streak).toBe(3)

  await clickNext(page)

  // Get one wrong
  await forceNewRound(page, EARLY.id, LATE.id)
  await page.locator('[data-testid="content-card"]').nth(1).click()

  const afterWrong = await getState(page)
  expect(afterWrong.streak).toBe(0)
})
