import contentData from '../data/content.json'
import { ref } from 'vue'

export interface ContentEntry {
  id: string
  name: string
  category: string
  releaseDate: string
  image: string
  wikiLength?: number
}

const allContent: ContentEntry[] = contentData as ContentEntry[]

/** Difficulty: 0 (easy, far apart) to 1 (hard, same day) */
export function getDifficulty(a: ContentEntry, b: ContentEntry): number {
  const dA = new Date(a.releaseDate).getTime()
  const dB = new Date(b.releaseDate).getTime()
  const days = Math.abs(dA - dB) / (1000 * 60 * 60 * 24)
  const dateDifficulty = 1 / (1 + days / 30)

  if (a.wikiLength == null || b.wikiLength == null) return dateDifficulty

  const minLength = Math.min(a.wikiLength, b.wikiLength)
  const obscurity = 1 / (1 + minLength / 5000)
  return 0.7 * dateDifficulty + 0.3 * obscurity
}

/** Map ELO to a preferred difficulty tier index (0-4) */
function eloToTier(elo: number): number {
  if (elo < 1200) return 0
  if (elo < 1400) return 1
  if (elo < 1600) return 2
  if (elo < 1800) return 3
  return 4
}

const TIER_BOUNDS = [0, 0.2, 0.4, 0.6, 0.8, 1.01] as const

/** Test override — when set, selectPair returns this instead */
export const _testOverridePair = ref<[ContentEntry, ContentEntry] | null>(null)

function randomEntry(): ContentEntry {
  return allContent[Math.floor(Math.random() * allContent.length)]!
}

export function selectPair(elo: number, previousIds: Set<string>): [ContentEntry, ContentEntry] {
  if (_testOverridePair.value) {
    const pair = _testOverridePair.value
    _testOverridePair.value = null
    return pair
  }

  const preferred = eloToTier(elo)

  const tierOrder = [preferred]
  for (let d = 1; d <= 4; d++) {
    if (preferred + d <= 4) tierOrder.push(preferred + d)
    if (preferred - d >= 0) tierOrder.push(preferred - d)
  }

  for (const tier of tierOrder) {
    const lo = TIER_BOUNDS[tier]!
    const hi = TIER_BOUNDS[tier + 1]!

    for (let attempt = 0; attempt < 50; attempt++) {
      const a = randomEntry()
      const b = randomEntry()
      if (a.id === b.id) continue

      const diff = getDifficulty(a, b)
      if (diff < lo || diff >= hi) continue

      const pairKey = [a.id, b.id].sort().join('|')
      if (previousIds.has(pairKey)) continue

      return [a, b]
    }
  }

  let a: ContentEntry, b: ContentEntry
  do {
    a = randomEntry()
    b = randomEntry()
  } while (a.id === b.id)

  return [a, b]
}

export function getContentById(id: string): ContentEntry | undefined {
  return allContent.find(e => e.id === id)
}
