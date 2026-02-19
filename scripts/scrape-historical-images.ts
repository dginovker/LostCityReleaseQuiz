import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const API_URL = 'https://runescape.wiki/api.php';
const USER_AGENT = 'LostCityQuiz/1.0 (RuneScape timeline quiz; scraping release dates and thumbnails)';
const API_DELAY_MS = 500;
const FETCH_TIMEOUT_MS = 15000;

const DOWNLOAD_DELAY_MS = 200;

const ROOT = path.resolve(import.meta.dirname, '..');
const CONTENT_FILE = path.join(ROOT, 'src', 'data', 'content.json');
const PROGRESS_FILE = path.join(ROOT, 'scripts', 'historical-progress.json');
const MANIFEST_FILE = path.join(ROOT, 'scripts', 'historical-manifest.json');
const IMAGES_DIR = path.join(ROOT, 'public', 'images');

interface ContentEntry {
  id: string;
  name: string;
  category: string;
  releaseDate: string;
  image: string;
}

interface ImageInfoEntry {
  wikiFile: string;
  archiveUrl: string;
  timestamp: string;
  source: 'pre2010' | 'oldest';
}

interface HistoricalProgress {
  filenameMap: Record<string, string>;
  imageInfo?: Record<string, ImageInfoEntry>;
  downloadedIds?: string[];
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
  const url = new URL(API_URL);
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

async function main() {
  const entries: ContentEntry[] = JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf-8'));
  console.log(`Loaded ${entries.length} entries from content.json`);

  // Build title -> entryId lookup (title is the name field)
  const titleToIds = new Map<string, string[]>();
  for (const entry of entries) {
    const title = entry.name;
    const existing = titleToIds.get(title);
    if (existing) {
      existing.push(entry.id);
    } else {
      titleToIds.set(title, [entry.id]);
    }
  }

  const uniqueTitles = [...titleToIds.keys()];
  console.log(`Unique wiki titles to fetch: ${uniqueTitles.length}`);

  console.log('Fetching wikitext...');
  const wikitexts = await batchFetchWikitext(uniqueTitles);
  console.log(`Got wikitext for ${wikitexts.size} pages`);

  // Build filenameMap: entryId -> wikiFilename
  const filenameMap: Record<string, string> = {};
  let resolved = 0;

  for (const [title, wikitext] of wikitexts) {
    const imageFile = parseImage(wikitext);
    if (!imageFile) continue;

    const entryIds = titleToIds.get(title);
    if (!entryIds) continue;

    for (const id of entryIds) {
      filenameMap[id] = imageFile;
      resolved++;
    }
  }

  // Load existing checkpoint or start fresh
  let progress: HistoricalProgress = { filenameMap };
  if (fs.existsSync(PROGRESS_FILE)) {
    const existing = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8')) as HistoricalProgress;
    progress = { ...existing, filenameMap };
  }
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));

  console.log(`Resolved ${resolved} wiki filenames for ${entries.length} entries`);
  console.log(`Checkpoint saved to ${PROGRESS_FILE}`);

  // --- Phase 2: Query imageinfo for archive URLs ---
  const imageInfo: Record<string, ImageInfoEntry> = progress.imageInfo ?? {};

  // Build list of entryIds that still need imageinfo
  const pendingEntries: { id: string; wikiFile: string }[] = [];
  for (const [id, wikiFile] of Object.entries(filenameMap)) {
    if (!imageInfo[id]) pendingEntries.push({ id, wikiFile });
  }

  // Deduplicate by wikiFile so we only query each filename once
  const uniqueFiles = [...new Set(pendingEntries.map(e => e.wikiFile))];
  console.log(`\nPhase 2: ${uniqueFiles.length} unique filenames to query (${pendingEntries.length} entries pending)`);

  // Query pre-2010 imageinfo in batches
  const pre2010Results = new Map<string, { url: string; timestamp: string }>();
  const missingPre2010: string[] = [];

  for (let i = 0; i < uniqueFiles.length; i += 50) {
    const batch = uniqueFiles.slice(i, i + 50);
    const titles = batch.map(f => `File:${f}`).join('|');
    await sleep(API_DELAY_MS);

    try {
      const data = await apiFetch({
        action: 'query',
        titles,
        prop: 'imageinfo',
        iiprop: 'timestamp|url',
        iilimit: '1',
        iistart: '2010-01-01T00:00:00Z',
      }) as { query: { pages: Record<string, { title: string; imageinfo?: { url: string; timestamp: string }[] }> } };

      for (const page of Object.values(data.query.pages)) {
        const fname = page.title.replace(/^File:/, '');
        if (page.imageinfo?.length) {
          pre2010Results.set(fname, { url: page.imageinfo[0].url, timestamp: page.imageinfo[0].timestamp });
        } else {
          missingPre2010.push(fname);
        }
      }
    } catch (err) {
      console.warn(`  imageinfo batch failed:`, (err as Error).message);
      // Put entire batch into missing so fallback picks them up
      missingPre2010.push(...batch);
    }

    const batchNum = Math.floor(i / 50) + 1;
    const totalBatches = Math.ceil(uniqueFiles.length / 50);
    if (batchNum % 10 === 0 || batchNum === totalBatches) {
      console.log(`  Pre-2010 batch ${batchNum}/${totalBatches}`);
    }
  }

  // Store pre2010 results into imageInfo
  for (const entry of pendingEntries) {
    const result = pre2010Results.get(entry.wikiFile);
    if (result) {
      imageInfo[entry.id] = { wikiFile: entry.wikiFile, archiveUrl: result.url, timestamp: result.timestamp, source: 'pre2010' };
    }
  }
  progress.imageInfo = imageInfo;
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));

  // Fallback: query oldest revision for files missing pre-2010
  const uniqueMissing = [...new Set(missingPre2010)];
  console.log(`  ${pre2010Results.size} files have pre-2010 revisions, ${uniqueMissing.length} need oldest-fallback`);

  const oldestResults = new Map<string, { url: string; timestamp: string }>();

  for (let i = 0; i < uniqueMissing.length; i += 50) {
    const batch = uniqueMissing.slice(i, i + 50);
    const titles = batch.map(f => `File:${f}`).join('|');
    await sleep(API_DELAY_MS);

    try {
      const data = await apiFetch({
        action: 'query',
        titles,
        prop: 'imageinfo',
        iiprop: 'timestamp|url',
        iilimit: '1',
        iisort: 'timestamp',
        iidir: 'ascending',
      }) as { query: { pages: Record<string, { title: string; imageinfo?: { url: string; timestamp: string }[] }> } };

      for (const page of Object.values(data.query.pages)) {
        const fname = page.title.replace(/^File:/, '');
        if (page.imageinfo?.length) {
          oldestResults.set(fname, { url: page.imageinfo[0].url, timestamp: page.imageinfo[0].timestamp });
        }
      }
    } catch (err) {
      console.warn(`  oldest-fallback batch failed:`, (err as Error).message);
    }

    const batchNum = Math.floor(i / 50) + 1;
    const totalBatches = Math.ceil(uniqueMissing.length / 50);
    if (batchNum % 10 === 0 || batchNum === totalBatches) {
      console.log(`  Oldest-fallback batch ${batchNum}/${totalBatches}`);
    }
  }

  // Store oldest results into imageInfo
  for (const entry of pendingEntries) {
    if (imageInfo[entry.id]) continue; // already got pre2010
    const result = oldestResults.get(entry.wikiFile);
    if (result) {
      imageInfo[entry.id] = { wikiFile: entry.wikiFile, archiveUrl: result.url, timestamp: result.timestamp, source: 'oldest' };
    }
  }
  progress.imageInfo = imageInfo;
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));

  // Summary
  const pre2010Count = Object.values(imageInfo).filter(e => e.source === 'pre2010').length;
  const oldestCount = Object.values(imageInfo).filter(e => e.source === 'oldest').length;
  console.log(`\nImageinfo complete — pre2010: ${pre2010Count}, oldest: ${oldestCount}`);

  if (DRY_RUN) {
    console.log('Dry run complete, exiting before image download.');
    return;
  }

  // --- Phase 3: Download images and convert to webp ---
  const downloadedIds = new Set<string>(progress.downloadedIds ?? []);
  const toDownload = Object.entries(imageInfo).filter(([id]) => !downloadedIds.has(id));
  const limited = toDownload.slice(0, LIMIT);

  console.log(`\nPhase 3: ${limited.length} images to download (${downloadedIds.size} already done, limit=${LIMIT === Infinity ? 'none' : LIMIT})`);

  const manifest: Record<string, ImageInfoEntry> = {};
  let downloaded = 0;
  let errors = 0;

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

  for (const [id, info] of limited) {
    try {
      await sleep(DOWNLOAD_DELAY_MS);
      const webp = await downloadAndConvert(info.archiveUrl);
      fs.writeFileSync(path.join(IMAGES_DIR, `${id}.webp`), webp);

      downloadedIds.add(id);
      manifest[id] = info;
      downloaded++;

      if (downloaded % 100 === 0) {
        progress.downloadedIds = [...downloadedIds];
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
        console.log(`  Downloaded ${downloaded}/${limited.length}`);
      }
    } catch (err) {
      console.warn(`  ${id}: ${(err as Error).message}`);
      errors++;
    }
  }

  // Final checkpoint save
  progress.downloadedIds = [...downloadedIds];
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));

  // Include previously downloaded entries in manifest too
  for (const id of downloadedIds) {
    if (!manifest[id] && imageInfo[id]) manifest[id] = imageInfo[id];
  }
  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));

  console.log(`\nPhase 3 complete — downloaded: ${downloaded}, errors: ${errors}`);
  console.log(`Manifest written to ${MANIFEST_FILE} (${Object.keys(manifest).length} entries)`);
}

main().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
