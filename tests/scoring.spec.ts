import { test, expect } from '@playwright/test'
import { clearFirestore, forceNewRound, getState, gotoReady, clickNext, SAME_DAY_A, SAME_DAY_B, EARLY, LATE } from './helpers'

test.beforeEach(async () => { await clearFirestore() })

test('correct answer gives at least 10 points, increases ELO, and HUD updates', async ({ page }) => {
  await gotoReady(page)

  // Force an easy pair (far apart dates)
  await forceNewRound(page, EARLY.id, LATE.id)

  // HUD should show Score: 0 initially
  await expect(page.locator('.hud')).toContainText('Score: 0')

  // Click the correct answer (EARLY = first card)
  await page.locator('[data-testid="content-card"]').first().click()

  // Feedback should show positive points
  await expect(page.getByText('Correct!')).toBeVisible()
  const feedbackText = await page.locator('text=/\\+\\d+ pts/').textContent()
  const pointsFromFeedback = parseInt(feedbackText!.match(/\+(\d+)/)?.[1] ?? '0', 10)
  expect(pointsFromFeedback).toBeGreaterThanOrEqual(50)

  // Internal state should match
  const state = await getState(page)
  expect(state.score).toBe(pointsFromFeedback)
  expect(state.score).toBeGreaterThanOrEqual(50)

  // ELO must increase even on easy pairs
  expect(state.elo).toBeGreaterThan(1200)

  // HUD should show the updated score and ELO
  await expect(page.locator('.hud')).toContainText(`Score: ${state.score}`)
  await expect(page.locator('.hud')).toContainText(`ELO: ${state.elo}`)
})

test('incorrect answer loses bounded points, decreases ELO, and HUD updates', async ({ page }) => {
  await gotoReady(page)

  // Give some initial score first by getting one right
  await forceNewRound(page, EARLY.id, LATE.id)
  await page.locator('[data-testid="content-card"]').first().click()
  const afterCorrect = await getState(page)
  expect(afterCorrect.score).toBeGreaterThanOrEqual(50)
  expect(afterCorrect.elo).toBeGreaterThan(1200)

  await clickNext(page)

  // Now get one wrong — click the LATE entry (second card = incorrect)
  await forceNewRound(page, EARLY.id, LATE.id)
  await page.locator('[data-testid="content-card"]').nth(1).click()

  // Feedback should show negative points
  await expect(page.getByText('Wrong!')).toBeVisible()
  const feedbackText = await page.locator('text=/-\\d+ pts/').textContent()
  const lossFromFeedback = parseInt(feedbackText!.match(/-(\d+)/)?.[1] ?? '0', 10)

  // Loss should be bounded: between 10 and 75
  expect(lossFromFeedback).toBeGreaterThanOrEqual(10)
  expect(lossFromFeedback).toBeLessThanOrEqual(75)

  // Score should have decreased
  const afterWrong = await getState(page)
  expect(afterWrong.score).toBe(afterCorrect.score - lossFromFeedback)

  // ELO must decrease even on easy pairs
  expect(afterWrong.elo).toBeLessThan(afterCorrect.elo)

  // HUD should show updated score
  await expect(page.locator('.hud')).toContainText(`Score: ${afterWrong.score}`)
})

test('score accumulates correctly over 3 correct rounds', async ({ page }) => {
  await gotoReady(page)

  let totalScore = 0

  for (let i = 0; i < 3; i++) {
    await forceNewRound(page, EARLY.id, LATE.id)
    const before = await getState(page)
    await page.locator('[data-testid="content-card"]').first().click()
    const after = await getState(page)

    const gained = after.score - before.score
    expect(gained).toBeGreaterThanOrEqual(50)
    totalScore += gained

    if (i < 2) await clickNext(page)
  }

  const finalState = await getState(page)
  expect(finalState.score).toBe(totalScore)
  expect(finalState.gamesPlayed).toBe(3)
  expect(finalState.correctAnswers).toBe(3)
  expect(finalState.streak).toBe(3)

  // HUD must reflect the total
  await expect(page.locator('.hud')).toContainText(`Score: ${totalScore}`)
})

test('hard pair (same-day) gives more points than easy pair', async ({ page }) => {
  await gotoReady(page)

  // Easy pair first
  await forceNewRound(page, EARLY.id, LATE.id)
  await page.locator('[data-testid="content-card"]').first().click()
  const afterEasy = await getState(page)
  const easyPoints = afterEasy.score

  await clickNext(page)

  // Hard pair (same-day)
  await forceNewRound(page, SAME_DAY_A.id, SAME_DAY_B.id)
  const beforeHard = await getState(page)
  await page.locator('[data-testid="content-card"]').first().click()
  const afterHard = await getState(page)
  const hardPoints = afterHard.score - beforeHard.score

  // Hard pair should give more points (higher difficulty = more reward)
  expect(hardPoints).toBeGreaterThan(easyPoints)
  // Both should be at least the minimum
  expect(easyPoints).toBeGreaterThanOrEqual(50)
  expect(hardPoints).toBeGreaterThanOrEqual(50)
})

test('ELO changes are reflected in the HUD after correct and incorrect answers', async ({ page }) => {
  await gotoReady(page)

  // Start at 1200
  await expect(page.locator('.hud')).toContainText('ELO: 1200')

  // Get a same-day pair correct (high difficulty = large ELO change)
  await forceNewRound(page, SAME_DAY_A.id, SAME_DAY_B.id)
  await page.locator('[data-testid="content-card"]').first().click()
  const afterWin = await getState(page)
  expect(afterWin.elo).toBeGreaterThan(1200)
  await expect(page.locator('.hud')).toContainText(`ELO: ${afterWin.elo}`)

  await clickNext(page)

  // Now get one wrong with an easy pair
  await forceNewRound(page, EARLY.id, LATE.id)
  await page.locator('[data-testid="content-card"]').nth(1).click()
  const afterLoss = await getState(page)
  expect(afterLoss.elo).toBeLessThan(afterWin.elo)
  await expect(page.locator('.hud')).toContainText(`ELO: ${afterLoss.elo}`)
})
