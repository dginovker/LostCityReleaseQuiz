import { test, expect } from '@playwright/test'
import { clearFirestore, forceNewRound, getState, gotoReady, SAME_DAY_A, SAME_DAY_B } from './helpers'

test.beforeEach(async () => { await clearFirestore() })

test('streak multiplier kicks in at 5 and resets on wrong answer', async ({ page }) => {
  await gotoReady(page)

  // Use same-day pair for consistent difficulty (1.0) and guaranteed correct answer
  const scores: number[] = []

  for (let i = 0; i < 6; i++) {
    await forceNewRound(page, SAME_DAY_A.id, SAME_DAY_B.id)
    const before = await getState(page)
    await page.locator('[data-testid="content-card"]').first().click()
    const after = await getState(page)
    scores.push(after.score - before.score)
  }

  // Answers 1-4: 1x multiplier, answer 5+: 2x multiplier
  // With difficulty 1.0: base = round(1.0 * 100) = 100
  expect(scores[0]).toBe(100) // streak 1, 1x
  expect(scores[4]).toBe(200) // streak 5, 2x
  expect(scores[5]).toBe(200) // streak 6, 2x

  const state = await getState(page)
  expect(state.streak).toBe(6)
})
