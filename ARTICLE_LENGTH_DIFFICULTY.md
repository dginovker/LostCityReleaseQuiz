# Article Length as Difficulty Factor

## Goal
Incorporate wiki article length as a proxy for content familiarity into the difficulty calculation. Long articles = well-known content = easier. Short articles = obscure = harder.

## Implementation

### 1. Add `wikiLength` field to content.json
- New script `scripts/scrape-lengths.ts`: reads content.json, batch-fetches wikitext for all entries (reusing the same batchFetchWikitext + apiFetch pattern), writes `wikitext.length` back into each entry as `wikiLength`
- Updates content.json in-place, adding the field to existing entries
- Add npm script `"scrape:lengths": "tsx scripts/scrape-lengths.ts"`

### 2. Update ContentEntry interface
- Add `wikiLength?: number` to the interface in `src/services/quiz.ts`

### 3. Update getDifficulty to blend date distance and obscurity
- Compute `dateDifficulty` as before: `1 / (1 + days / 30)`
- Compute `obscurity` from the *less* well-known entry in the pair: `1 / (1 + minLength / 5000)` — short articles → high obscurity (closer to 1), long articles → low obscurity (closer to 0)
- Blend: `0.7 * dateDifficulty + 0.3 * obscurity`
- If either entry lacks `wikiLength`, fall back to date-only difficulty

### 4. Run the scraper
- Run `npm run scrape:lengths` to populate wikiLength for all entries

## Testing
- After scraping, verify content.json entries have `wikiLength` fields (spot-check a few: Dragon Slayer should be large, an obscure music track should be small)
- In the quiz service, assert that two pairs with the same date gap but different article lengths produce different difficulty scores
- Play the game at low ELO and confirm pairs feel appropriately easy (well-known content, far-apart dates)
