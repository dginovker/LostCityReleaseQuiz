import { test, expect } from '@playwright/test'
import { clearFirestore, gotoReady } from './helpers'

test.beforeEach(async () => { await clearFirestore() })

test('cards stack vertically on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await gotoReady(page)

  const cards = page.locator('[data-testid="content-card"]')
  const box1 = await cards.nth(0).boundingBox()
  const box2 = await cards.nth(1).boundingBox()

  expect(box1).not.toBeNull()
  expect(box2).not.toBeNull()
  expect(box2!.y).toBeGreaterThan(box1!.y + box1!.height - 1)
})

test('no horizontal scrollbar on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await gotoReady(page)
  const hasScroll = await page.evaluate(() => document.body.scrollWidth > window.innerWidth)
  expect(hasScroll).toBe(false)
})

test('full quiz flow works at mobile size', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await gotoReady(page)
  await page.locator('[data-testid="content-card"]').first().click()
  await expect(page.locator('.card-date')).toHaveCount(2)
  await page.getByRole('button', { name: /Next/ }).click()
  await expect(page.locator('[data-testid="content-card"]')).toHaveCount(2)
})
