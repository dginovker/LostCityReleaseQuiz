import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const OSRS_API_URL = 'https://oldschool.runescape.wiki/api.php';
const USER_AGENT = 'LostCityQuiz/1.0 (RuneScape timeline quiz; scraping release dates and thumbnails)';
const API_DELAY_MS = 500;
const FETCH_TIMEOUT_MS = 15000;
const DOWNLOAD_DELAY_MS = 200;

const ROOT = path.resolve(import.meta.dirname, '..');
const CONTENT_FILE = path.join(ROOT, 'src', 'data', 'content.json');
const MANIFEST_FILE = path.join(ROOT, 'scripts', 'historical-manifest.json');
const PROGRESS_FILE = path.join(ROOT, 'scripts', 'osrs-fallback-progress.json');
const IMAGES_DIR = path.join(ROOT, 'public', 'images');

interface ContentEntry {
  id: string;
  name: string;
  category: string;
  releaseDate: string;
  image: string;
}

interface ManifestEntry {
  wikiFile: string;
  archiveUrl: string;
  timestamp: string;
  source: 'pre2010' | 'oldest' | 'osrs';
}

interface OsrsProgress {
  resolvedImages: Record<string, { wikiFile: string; imageUrl: string }>;
  downloadedIds: string[];
}

const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT = (() => {
  const idx = process.argv.indexOf('--limit');
  return idx !== -1 ? parseInt(process.argv[idx + 1], 10) : Infinity;
})();

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function apiFetch(params: Record<string, string>): Promise<unknown> {
  const url = new URL(OSRS_API_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('format', 'json');

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('Retry-After') || '5', 10);
    console.log(`Rate limited, waiting ${retryAfter}s...`);
    await sleep(retryAfter * 1000);
    return apiFetch(params);
  }

  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function batchFetchWikitext(titles: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const totalBatches = Math.ceil(titles.length / 50);

  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    await sleep(API_DELAY_MS);

    try {
      const data = await apiFetch({
        action: 'query',
        titles: batch.join('|'),
        prop: 'revisions',
        rvprop: 'content',
        rvslots: 'main',
      }) as {
        query: {
          pages: Record<string, {
            title: string;
            revisions?: [{ slots: { main: { '*': string } } }];
          }>;
        };
      };

      for (const page of Object.values(data.query.pages)) {
        const content = page.revisions?.[0]?.slots?.main?.['*'];
        if (content) result.set(page.title, content);
      }
    } catch (err) {
      console.warn(`  Batch ${Math.floor(i / 50) + 1} failed:`, (err as Error).message);
    }

    const batchNum = Math.floor(i / 50) + 1;
    if (batchNum % 50 === 0 || batchNum === totalBatches) {
      console.log(`  Fetched wikitext batch ${batchNum}/${totalBatches}`);
    }
  }

  return result;
}

function parseImage(wikitext: string): string | null {
  const match = wikitext.match(/\|\s*image\d?\s*=\s*\[\[File:([^\]|]+)[^\]]*\]\]/i)
    || wikitext.match(/\|\s*image\d?\s*=\s*([^\n|{}[\]]+\.(png|gif|jpg|jpeg))/i);
  if (!match) return null;
  return match[1].trim().replace(/^File:/i, '');
}

async function downloadAndConvert(url: string): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('Retry-After') || '5', 10);
      console.log(`  Rate limited, waiting ${retryAfter}s...`);
      await sleep(retryAfter * 1000);
      return downloadAndConvert(url);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    return await sharp(buf).resize(300).webp({ quality: 80 }).toBuffer();
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  // Load content and manifest
  const entries: ContentEntry[] = JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf-8'));
  const manifest: Record<string, ManifestEntry> = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf-8'));

  // Find entries that need OSRS images:
  // 1. "oldest" source entries in manifest (RS3 fallback images)
  // 2. Entries with no image at all
  const targetIds = new Set<string>();

  for (const [id, v] of Object.entries(manifest)) {
    if (v.source !== 'osrs') targetIds.add(id);
  }
  for (const entry of entries) {
    if (!entry.image) targetIds.add(entry.id);
  }
  console.log(`Found ${targetIds.size} entries needing OSRS images (oldest fallback + missing)`);

  // Build id -> name lookup from content.json
  const idToName = new Map<string, string>();
  for (const entry of entries) {
    idToName.set(entry.id, entry.name);
  }

  // Build title -> ids lookup for target entries
  const titleToIds = new Map<string, string[]>();
  for (const id of targetIds) {
    const name = idToName.get(id);
    if (!name) continue;
    const existing = titleToIds.get(name);
    if (existing) {
      existing.push(id);
    } else {
      titleToIds.set(name, [id]);
    }
  }

  const uniqueTitles = [...titleToIds.keys()];
  console.log(`Unique wiki titles to fetch from OSRS wiki: ${uniqueTitles.length}`);

  // Load checkpoint if exists
  let progress: OsrsProgress = { resolvedImages: {}, downloadedIds: [] };
  if (fs.existsSync(PROGRESS_FILE)) {
    progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
  }

  // --- Phase 1: Fetch wikitext from OSRS wiki and parse image filenames ---
  if (Object.keys(progress.resolvedImages).length === 0) {
    console.log('Fetching wikitext from OSRS wiki...');
    const wikitexts = await batchFetchWikitext(uniqueTitles);
    console.log(`Got wikitext for ${wikitexts.size} pages`);

    // Parse image filenames
    const filenameMap: Record<string, string> = {};
    for (const [title, wikitext] of wikitexts) {
      const imageFile = parseImage(wikitext);
      if (!imageFile) continue;
      const entryIds = titleToIds.get(title);
      if (!entryIds) continue;
      for (const id of entryIds) {
        filenameMap[id] = imageFile;
      }
    }

    console.log(`Resolved ${Object.keys(filenameMap).length} image filenames from OSRS wiki`);
    console.log(`Found ${Object.keys(filenameMap).length} OSRS images`);

    // --- Phase 2: Query imageinfo to get direct image URLs ---
    const uniqueFiles = [...new Set(Object.values(filenameMap))];
    console.log(`Querying imageinfo for ${uniqueFiles.length} unique files...`);

    const fileToUrl = new Map<string, string>();

    for (let i = 0; i < uniqueFiles.length; i += 50) {
      const batch = uniqueFiles.slice(i, i + 50);
      const titles = batch.map(f => `File:${f}`).join('|');
      await sleep(API_DELAY_MS);

      try {
        const data = await apiFetch({
          action: 'query',
          titles,
          prop: 'imageinfo',
          iiprop: 'url',
          iilimit: '1',
        }) as { query: { pages: Record<string, { title: string; imageinfo?: { url: string }[] }> } };

        for (const page of Object.values(data.query.pages)) {
          const fname = page.title.replace(/^File:/, '');
          if (page.imageinfo?.length) {
            fileToUrl.set(fname, page.imageinfo[0].url);
          }
        }
      } catch (err) {
        console.warn(`  imageinfo batch failed:`, (err as Error).message);
      }

      const batchNum = Math.floor(i / 50) + 1;
      const totalBatches = Math.ceil(uniqueFiles.length / 50);
      if (batchNum % 10 === 0 || batchNum === totalBatches) {
        console.log(`  Imageinfo batch ${batchNum}/${totalBatches}`);
      }
    }

    // Build resolved images map
    for (const [id, wikiFile] of Object.entries(filenameMap)) {
      const imageUrl = fileToUrl.get(wikiFile);
      if (imageUrl) {
        progress.resolvedImages[id] = { wikiFile, imageUrl };
      }
    }

    // Save checkpoint
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
    console.log(`Resolved ${Object.keys(progress.resolvedImages).length} downloadable OSRS images`);
  } else {
    console.log(`Resuming from checkpoint: ${Object.keys(progress.resolvedImages).length} resolved images`);
  }

  const resolvedCount = Object.keys(progress.resolvedImages).length;
  const notFoundCount = targetIds.size - resolvedCount;
  console.log(`Found ${resolvedCount} OSRS images`);
  console.log(`Not found on OSRS wiki: ${notFoundCount}`);

  if (DRY_RUN) {
    console.log('Dry run complete, exiting before image download.');
    return;
  }

  // --- Phase 3: Download images and update manifest ---
  const downloadedIds = new Set<string>(progress.downloadedIds);
  const toDownload = Object.entries(progress.resolvedImages).filter(([id]) => !downloadedIds.has(id));
  const limited = toDownload.slice(0, LIMIT);

  console.log(`\nPhase 3: ${limited.length} images to download (${downloadedIds.size} already done, limit=${LIMIT === Infinity ? 'none' : LIMIT})`);

  let downloaded = 0;
  let errors = 0;

  for (const [id, { wikiFile, imageUrl }] of limited) {
    try {
      await sleep(DOWNLOAD_DELAY_MS);
      const webp = await downloadAndConvert(imageUrl);
      fs.writeFileSync(path.join(IMAGES_DIR, `${id}.webp`), webp);

      // Update manifest entry
      manifest[id] = {
        wikiFile,
        archiveUrl: imageUrl,
        timestamp: new Date().toISOString(),
        source: 'osrs',
      };

      downloadedIds.add(id);
      downloaded++;

      if (downloaded % 100 === 0) {
        progress.downloadedIds = [...downloadedIds];
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
        fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
        console.log(`  Downloaded ${downloaded}/${limited.length}`);
      }
    } catch (err) {
      console.warn(`  ${id}: ${(err as Error).message}`);
      errors++;
    }
  }

  // Final save
  progress.downloadedIds = [...downloadedIds];
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));

  // Update content.json for entries that now have images
  let contentUpdated = 0;
  for (const entry of entries) {
    if (!entry.image && downloadedIds.has(entry.id)) {
      entry.image = `${entry.id}.webp`;
      contentUpdated++;
    }
  }
  if (contentUpdated > 0) {
    fs.writeFileSync(CONTENT_FILE, JSON.stringify(entries, null, 2));
    console.log(`Updated ${contentUpdated} entries in content.json with new images`);
  }

  console.log(`\nComplete -- replaced: ${downloaded}, not found on OSRS: ${notFoundCount}, errors: ${errors}`);
  console.log(`Manifest updated at ${MANIFEST_FILE}`);
}

main().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
