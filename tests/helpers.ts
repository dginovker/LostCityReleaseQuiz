import type { Page } from '@playwright/test'

const FIRESTORE_PORT = 8081
const PROJECT_ID = 'lostcity-quiz'

export async function clearFirestore() {
  await fetch(
    `http://127.0.0.1:${FIRESTORE_PORT}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  )
}

/** Wait for Firebase auth + Firestore initialization to complete */
export async function waitReady(page: Page) {
  await page.waitForFunction(() => (window as any).__testApi?.waitReady, null, { timeout: 10000 })
  await page.evaluate(() => (window as any).__testApi.waitReady())
}

/** Set a forced pair that will be used on the next selectPair call */
export async function forcePair(page: Page, idA: string, idB: string) {
  await page.evaluate(([a, b]) => {
    ;(window as any).__testApi.forcePair(a, b)
  }, [idA, idB])
}

/** Force a pair and trigger a new round immediately */
export async function forceNewRound(page: Page, idA: string, idB: string) {
  await page.evaluate(([a, b]) => {
    ;(window as any).__testApi.forcePair(a, b)
    ;(window as any).__testApi.nextRound()
  }, [idA, idB])
}

export async function getState(page: Page) {
  return page.evaluate(() => (window as any).__testApi.getState())
}

export async function clickNext(page: Page) {
  await page.getByRole('button', { name: /Next/ }).click()
}

/** Navigate to / and wait for app + auth to be ready */
export async function gotoReady(page: Page) {
  await page.goto('/')
  await waitReady(page)
}

// Known test entries — far apart in time (must have images)
export const EARLY = { id: 'quest_cook_s_assistant', date: '2001-01-04' }
export const LATE = { id: 'quest_troll_romance', date: '2005-01-05' }
// Same-day pair (must have images)
export const SAME_DAY_A = { id: 'quest_cook_s_assistant', date: '2001-01-04' }
export const SAME_DAY_B = { id: 'quest_the_restless_ghost', date: '2001-01-04' }
