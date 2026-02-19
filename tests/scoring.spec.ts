import { test, expect } from '@playwright/test'
import { clearFirestore, forceNewRound, getState, gotoReady, clickNext, SAME_DAY_A, SAME_DAY_B, EARLY, LATE } from './helpers'

test.beforeEach(async () => { await clearFirestore() })

test('correct answer increases ELO and HUD updates', async ({ page }) => {
  await gotoReady(page)

  await forceNewRound(page, EARLY.id, LATE.id)

  await expect(page.locator('.hud')).toContainText('ELO: 1200')

  await page.locator('[data-testid="content-card"]').first().click()

  await expect(page.getByText('Correct!')).toBeVisible()
  await expect(page.locator('text=/\\+\\d+ ELO/')).toBeVisible()

  const state = await getState(page)
  expect(state.elo).toBeGreaterThan(1200)
  await expect(page.locator('.hud')).toContainText(`ELO: ${state.elo}`)
})

test('incorrect answer decreases ELO and HUD updates', async ({ page }) => {
  await gotoReady(page)

  // Get one right first so ELO is above 1200
  await forceNewRound(page, EARLY.id, LATE.id)
  await page.locator('[data-testid="content-card"]').first().click()
  const afterCorrect = await getState(page)
  expect(afterCorrect.elo).toBeGreaterThan(1200)

  await clickNext(page)

  // Now get one wrong
  await forceNewRound(page, EARLY.id, LATE.id)
  await page.locator('[data-testid="content-card"]').nth(1).click()

  await expect(page.getByText('Wrong!')).toBeVisible()
  await expect(page.locator('text=/-\\d+ ELO/')).toBeVisible()

  const afterWrong = await getState(page)
  expect(afterWrong.elo).toBeLessThan(afterCorrect.elo)
  await expect(page.locator('.hud')).toContainText(`ELO: ${afterWrong.elo}`)
})

test('ELO accumulates correctly over 3 correct rounds', async ({ page }) => {
  await gotoReady(page)

  for (let i = 0; i < 3; i++) {
    await forceNewRound(page, EARLY.id, LATE.id)
    await page.locator('[data-testid="content-card"]').first().click()
    if (i < 2) await clickNext(page)
  }

  const finalState = await getState(page)
  expect(finalState.elo).toBeGreaterThan(1200)
  expect(finalState.gamesPlayed).toBe(3)
  expect(finalState.correctAnswers).toBe(3)
  expect(finalState.streak).toBe(3)
})

test('hard pair (same-day) gives more ELO than easy pair', async ({ page }) => {
  await gotoReady(page)

  // Easy pair first
  await forceNewRound(page, EARLY.id, LATE.id)
  await page.locator('[data-testid="content-card"]').first().click()
  const afterEasy = await getState(page)
  const easyGain = afterEasy.elo - 1200

  await clickNext(page)

  // Hard pair (same-day)
  await forceNewRound(page, SAME_DAY_A.id, SAME_DAY_B.id)
  const beforeHard = await getState(page)
  await page.locator('[data-testid="content-card"]').first().click()
  const afterHard = await getState(page)
  const hardGain = afterHard.elo - beforeHard.elo

  expect(hardGain).toBeGreaterThan(easyGain)
  expect(easyGain).toBeGreaterThanOrEqual(1)
  expect(hardGain).toBeGreaterThanOrEqual(1)
})

test('ELO changes are reflected in the HUD after correct and incorrect answers', async ({ page }) => {
  await gotoReady(page)

  await expect(page.locator('.hud')).toContainText('ELO: 1200')

  await forceNewRound(page, SAME_DAY_A.id, SAME_DAY_B.id)
  await page.locator('[data-testid="content-card"]').first().click()
  const afterWin = await getState(page)
  expect(afterWin.elo).toBeGreaterThan(1200)
  await expect(page.locator('.hud')).toContainText(`ELO: ${afterWin.elo}`)

  await clickNext(page)

  await forceNewRound(page, EARLY.id, LATE.id)
  await page.locator('[data-testid="content-card"]').nth(1).click()
  const afterLoss = await getState(page)
  expect(afterLoss.elo).toBeLessThan(afterWin.elo)
  await expect(page.locator('.hud')).toContainText(`ELO: ${afterLoss.elo}`)
})
