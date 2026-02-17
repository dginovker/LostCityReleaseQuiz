import { test, expect } from '@playwright/test'
import { clearFirestore, forceNewRound, getState, gotoReady, SAME_DAY_A, SAME_DAY_B } from './helpers'

test.beforeEach(async () => { await clearFirestore() })

test('state persists across route changes', async ({ page }) => {
  await gotoReady(page)

  // Play 2 rounds
  await forceNewRound(page, SAME_DAY_A.id, SAME_DAY_B.id)
  await page.locator('[data-testid="content-card"]').first().click()

  await forceNewRound(page, SAME_DAY_A.id, SAME_DAY_B.id)
  await page.locator('[data-testid="content-card"]').first().click()

  const stateBefore = await getState(page)
  expect(stateBefore.elo).toBeGreaterThan(1200)
  expect(stateBefore.gamesPlayed).toBe(2)

  // Navigate to stats and back — state should persist
  await page.click('a:has-text("Stats")')
  await expect(page.locator('.stat-row:has-text("Games Played") .yellow')).toHaveText('2')

  await page.click('a:has-text("Back to Quiz")')
  const stateAfter = await getState(page)
  expect(stateAfter.elo).toBe(stateBefore.elo)
  expect(stateAfter.gamesPlayed).toBe(2)
})
