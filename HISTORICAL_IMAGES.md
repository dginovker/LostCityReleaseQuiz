# Historical Images: RS Wiki Archive Approach

## Goal
Replace current images (latest RS3 graphics) with the closest-to-2009 archived version from `runescape.wiki`, so the quiz shows era-appropriate visuals for 2001-2009 content.

## How the API Works
- `action=query&titles=File:{name}&prop=imageinfo&iiprop=timestamp|url&iilimit=1&iistart=2010-01-01T00:00:00Z`
- Returns the single revision closest to but before the target date
- Archive URLs are directly downloadable: `runescape.wiki/images/archive/{timestamp}%21{filename}`
- If no revision exists before the target date, `imageinfo` is empty — fall back to the oldest available revision (see below)

## Implementation

### New script: `scripts/scrape-historical-images.ts`
1. Re-scrape image filenames from wikitext (the `_imageSource` field was stripped from content.json)
   - Read content.json to get the list of entries with images
   - Batch-fetch wikitext for those entries (reuse existing `batchFetchWikitext` + `parseImage`)
   - Build a map: `entryId → wikiFilename`

2. For each wiki filename, query the imageinfo API:
   - `iistart=2010-01-01T00:00:00Z`, `iilimit=1` → gets closest pre-2010 revision
   - If imageinfo is non-empty: use the archive URL
   - If empty: query again with `iisort=timestamp&iidir=ascending&iilimit=1` to get the oldest revision instead
   - This ensures we never use modern RS3 graphics — worst case is the oldest available image

3. Download each image (archive URL or current), convert to 300px webp via sharp
   - Skip if output file already exists AND a flag file marks it as "historical" (to avoid re-downloading on resume)
   - Use checkpoint/resume pattern like the existing scraper

4. Write a manifest file (`scripts/historical-manifest.json`) mapping entryId → { wikiFile, archiveUrl, timestamp, source }
   - `source`: `"pre2010"` (archive before 2010), `"oldest"` (oldest available fallback)
   - Enables inspection of which images got historical versions vs. fallbacks

### Rate limiting
- Same as existing scraper: 500ms between API calls, 200ms between image downloads
- Batch imageinfo queries: up to 50 titles per API call using `titles=File:A|File:B|...`
- Estimated: ~180 API batches for wikitext + ~180 for imageinfo + ~9,000 image downloads ≈ 45 min

### Changes to existing files
- None. The script overwrites files in `public/images/` in-place. content.json is unchanged.

## Testing
1. Run `npm run scrape:historical -- --dry-run` (new flag): prints how many images would get historical versions vs. fallbacks, without downloading. Assert counts are non-zero for both.
2. Run on a small subset: `npm run scrape:historical -- --limit 20`. Verify:
   - 20 images in `public/images/` were updated (file mtime changed)
   - `scripts/historical-manifest.json` has 20 entries
   - At least 1 entry has `isHistorical: true` with a pre-2010 timestamp
3. Full run: `npm run scrape:historical`. Verify `historical-manifest.json` exists with 9,000+ entries.
4. Visual spot-check: compare a known item (e.g., Abyssal whip) before/after — the historical version should look like a 2008-era sprite, not the HD 2025 model.
