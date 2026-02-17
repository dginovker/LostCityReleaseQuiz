import { test, expect } from '@playwright/test'
import { clearFirestore, clickNext, gotoReady } from './helpers'

test.beforeEach(async () => { await clearFirestore() })

test('shows two content cards with prompt', async ({ page }) => {
  await gotoReady(page)
  await expect(page.locator('[data-testid="content-card"]')).toHaveCount(2)
  await expect(page.getByText('Which was released first?')).toBeVisible()
})

test('cards show name and category badge', async ({ page }) => {
  await gotoReady(page)
  const cards = page.locator('[data-testid="content-card"]')
  for (let i = 0; i < 2; i++) {
    await expect(cards.nth(i).locator('.card-name')).not.toBeEmpty()
    await expect(cards.nth(i).locator('.card-badge')).not.toBeEmpty()
  }
})

test('clicking a card reveals dates and shows feedback', async ({ page }) => {
  await gotoReady(page)
  await page.locator('[data-testid="content-card"]').first().click()
  await expect(page.locator('.card-date')).toHaveCount(2)
  await expect(page.locator('text=/Correct!|Wrong!/')).toBeVisible()
  await expect(page.getByRole('button', { name: /Next/ })).toBeVisible()
})

test('clicking Next resets for a new round', async ({ page }) => {
  await gotoReady(page)
  await page.locator('[data-testid="content-card"]').first().click()
  await clickNext(page)
  await expect(page.locator('.card-date')).toHaveCount(0)
  await expect(page.locator('[data-testid="content-card"]')).toHaveCount(2)
})
