import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const API_URL = 'https://runescape.wiki/api.php';
const USER_AGENT = 'LostCityQuiz/1.0 (RuneScape timeline quiz; scraping release dates and thumbnails)';
const API_DELAY_MS = 500;
const IMAGE_DELAY_MS = 200;
const FETCH_TIMEOUT_MS = 15000;

const ROOT = path.resolve(import.meta.dirname, '..');
const IMAGES_DIR = path.join(ROOT, 'public', 'images');
const DATA_DIR = path.join(ROOT, 'src', 'data');
const PROGRESS_FILE = path.join(ROOT, 'scripts', 'scrape-progress.json');
const OUTPUT_FILE = path.join(DATA_DIR, 'content.json');

interface ContentEntry {
  id: string;
  name: string;
  category: string;
  releaseDate: string;
  image: string;
  _imageSource?: string; // temp field, stripped before final output
}

interface Progress {
  completedCategories: string[];
  entries: ContentEntry[];
  imagesDone?: boolean;
}

const CATEGORIES: Record<string, string> = {
  quest: 'Category:Quests',
  item: 'Category:Items',
  npc: 'Category:Non-player characters',
  location: 'Category:Locations',
  minigame: 'Category:Minigames',
  music: 'Category:Music tracks',
  skill: 'Category:Skills',
};

const MONTHS: Record<string, string> = {
  January: '01', February: '02', March: '03', April: '04',
  May: '05', June: '06', July: '07', August: '08',
  September: '09', October: '10', November: '11', December: '12',
};

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

async function getCategoryMembers(category: string): Promise<string[]> {
  const titles: string[] = [];
  let cmcontinue: string | undefined;

  do {
    const params: Record<string, string> = {
      action: 'query',
      list: 'categorymembers',
      cmtitle: category,
      cmlimit: '500',
      cmtype: 'page',
    };
    if (cmcontinue) params.cmcontinue = cmcontinue;

    await sleep(API_DELAY_MS);
    const data = await apiFetch(params) as {
      query: { categorymembers: { title: string }[] };
      continue?: { cmcontinue: string };
    };

    for (const m of data.query.categorymembers) {
      titles.push(m.title);
    }
    cmcontinue = data.continue?.cmcontinue;
  } while (cmcontinue);

  return titles;
}

function parseReleaseDate(wikitext: string): string | null {
  const releaseMatch = wikitext.match(/\|\s*release\s*=\s*([^\n|}]+)/i);
  if (!releaseMatch) return null;

  const releaseLine = releaseMatch[1].trim();

  // Pattern: [[DD Month]] [[YYYY]]
  const dateMatch = releaseLine.match(/\[\[(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\]\]\s*\[\[(\d{4})\]\]/);
  if (dateMatch) {
    const day = dateMatch[1].padStart(2, '0');
    const month = MONTHS[dateMatch[2]];
    const year = dateMatch[3];
    return `${year}-${month}-${day}`;
  }

  // Alternative: plain text date
  const templateMatch = releaseLine.match(/(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/);
  if (templateMatch) {
    const day = templateMatch[1].padStart(2, '0');
    const month = MONTHS[templateMatch[2]];
    const year = templateMatch[3];
    return `${year}-${month}-${day}`;
  }

  return null;
}

function parseImage(wikitext: string): string | null {
  const match = wikitext.match(/\|\s*image\s*=\s*\[\[File:([^\]|]+)\]\]/i)
    || wikitext.match(/\|\s*image\s*=\s*([^\n|{}[\]]+\.(png|gif|jpg|jpeg))/i);
  if (!match) return null;
  return match[1].trim();
}

function makeId(category: string, name: string): string {
  return `${category}_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;
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

async function downloadImage(filename: string, outputPath: string): Promise<boolean> {
  const encodedFilename = filename.replace(/ /g, '_');

  const urls = [
    `https://runescape.wiki/images/thumb/${encodeURIComponent(encodedFilename)}/300px-${encodeURIComponent(encodedFilename)}`,
    `https://runescape.wiki/images/${encodeURIComponent(encodedFilename)}`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (!res.ok) continue;

      const buf = Buffer.from(await res.arrayBuffer());
      await sharp(buf).resize(300).webp({ quality: 80 }).toFile(outputPath);
      return true;
    } catch {
      continue;
    }
  }

  return false;
}

function loadProgress(): Progress {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
  }
  return { completedCategories: [], entries: [] };
}

function saveProgress(progress: Progress): void {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function main() {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const progress = loadProgress();
  console.log(`Loaded progress: ${progress.entries.length} entries, ${progress.completedCategories.length} categories done`);

  // Phase 1: Scrape wikitext for all categories
  for (const [categoryKey, categoryTitle] of Object.entries(CATEGORIES)) {
    if (progress.completedCategories.includes(categoryKey)) {
      console.log(`Skipping ${categoryKey} (already completed)`);
      continue;
    }

    console.log(`\n=== Scraping ${categoryKey} (${categoryTitle}) ===`);

    console.log('Getting category members...');
    const titles = await getCategoryMembers(categoryTitle);
    console.log(`Found ${titles.length} pages`);

    console.log('Fetching wikitext...');
    const wikitexts = await batchFetchWikitext(titles);

    let parsed = 0;
    let filtered = 0;
    const categoryEntries: ContentEntry[] = [];

    for (const [title, wikitext] of wikitexts) {
      const releaseDate = parseReleaseDate(wikitext);
      if (!releaseDate) continue;
      parsed++;

      const year = parseInt(releaseDate.substring(0, 4), 10);
      if (year < 2001 || year > 2009) continue;
      filtered++;

      const imageFile = parseImage(wikitext);
      const id = makeId(categoryKey, title);
      const webpName = `${id}.webp`;

      categoryEntries.push({
        id,
        name: title,
        category: categoryKey,
        releaseDate,
        image: imageFile ? webpName : '',
        _imageSource: imageFile || undefined,
      });
    }

    console.log(`Parsed: ${parsed}, In range (2001-2009): ${filtered}`);

    progress.entries.push(...categoryEntries);
    progress.completedCategories.push(categoryKey);
    saveProgress(progress);
    console.log(`Checkpoint saved (${progress.entries.length} total entries)`);
  }

  // Phase 2: Download images for all entries that have image sources
  if (!progress.imagesDone) {
    const needImages = progress.entries.filter(e => e._imageSource && e.image);
    console.log(`\n=== Downloading ${needImages.length} images ===`);

    let downloaded = 0;
    let failed = 0;

    for (let i = 0; i < needImages.length; i++) {
      const entry = needImages[i];
      const outputPath = path.join(IMAGES_DIR, entry.image);

      // Skip if already downloaded
      if (fs.existsSync(outputPath)) {
        downloaded++;
        continue;
      }

      await sleep(IMAGE_DELAY_MS);
      const ok = await downloadImage(entry._imageSource!, outputPath);
      if (ok) {
        downloaded++;
      } else {
        failed++;
        entry.image = '';
      }

      if ((i + 1) % 100 === 0) {
        console.log(`  Images: ${i + 1}/${needImages.length} (${downloaded} ok, ${failed} failed)`);
        saveProgress(progress);
      }
    }

    console.log(`  Images complete: ${downloaded} downloaded, ${failed} failed`);
    progress.imagesDone = true;
    saveProgress(progress);
  }

  // Phase 3: Write final output (strip internal fields, deduplicate IDs)
  const idCounts = new Map<string, number>();
  const finalEntries = progress.entries.map(({ _imageSource: _, ...rest }) => {
    const count = idCounts.get(rest.id) || 0;
    idCounts.set(rest.id, count + 1);
    if (count > 0) rest.id = `${rest.id}_${count + 1}`;
    return rest;
  });

  console.log(`\nFinal: ${finalEntries.length} entries`);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalEntries, null, 2));
  console.log(`Wrote ${OUTPUT_FILE}`);

  // Keep progress file for potential re-generation
  console.log('Done!');
}

main().catch(err => {
  console.error('Scraper failed:', err);
  process.exit(1);
});
