# Replace RS3 Fallback Images with OSRS Wiki Images

## Problem

3,660 images currently use "oldest available" RS3 wiki images as a fallback (entries where no pre-2010 archive revision existed). These often show RS3-era graphics instead of old-school visuals.

## Solution

Create a new script `scripts/scrape-osrs-fallback.ts` that re-downloads only the `source: "oldest"` entries from the OSRS wiki (`oldschool.runescape.wiki`) instead.

### Script behavior

1. Read `scripts/historical-manifest.json` and filter entries where `source === "oldest"` (3,660 entries)
2. Read `src/data/content.json` to get `entry.name` (wiki page title) for each entry ID
3. Batch-fetch wikitext from `oldschool.runescape.wiki/api.php` for those page titles to extract the OSRS image filename (using existing `parseImage` regex)
4. For entries with a resolved OSRS image filename, query `oldschool.runescape.wiki` imageinfo API to get the direct image URL
5. Download each image, convert to 300px WebP via sharp, overwrite `public/images/{id}.webp`
6. Update `scripts/historical-manifest.json`: change matched entries' `source` to `"osrs"` and update `archiveUrl` to the OSRS URL
7. Log summary: how many replaced, how many not found on OSRS wiki (those keep existing RS3 image)

### Checkpoint/resume

- Maintain a progress file `scripts/osrs-fallback-progress.json` tracking which entry IDs have been processed
- Skip already-processed entries on re-run

### CLI flags

- `--dry-run`: Query OSRS wiki and report counts without downloading
- `--limit N`: Only process first N entries (for testing)

### Rate limiting

- Same as existing scrapers: 500ms API delay, 200ms image download delay
- Batch API queries at 50 titles per request

### npm script

Add to `package.json`: `"scrape:osrs-fallback": "tsx scripts/scrape-osrs-fallback.ts"`

## Testing

1. `npm run scrape:osrs-fallback -- --dry-run` — verify it reports non-zero matches found on OSRS wiki
2. `npm run scrape:osrs-fallback -- --limit 10` — verify 10 images updated in `public/images/`, manifest updated with `source: "osrs"`
3. `npm run validate-data` — verify data integrity after image replacement
