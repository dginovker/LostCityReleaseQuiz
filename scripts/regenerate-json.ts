import fs from 'node:fs';
import path from 'node:path';

const API_URL = 'https://runescape.wiki/api.php';
const USER_AGENT = 'LostCityQuiz/1.0 (RuneScape timeline quiz; re-generating metadata)';
const API_DELAY_MS = 500;
const FETCH_TIMEOUT_MS = 15000;

const ROOT = path.resolve(import.meta.dirname, '..');
const IMAGES_DIR = path.join(ROOT, 'public', 'images');
const DATA_DIR = path.join(ROOT, 'src', 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'content.json');

interface ContentEntry {
  id: string;
  name: string;
  category: string;
  releaseDate: string;
  image: string;
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

  const dateMatch = releaseLine.match(/\[\[(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\]\]\s*\[\[(\d{4})\]\]/);
  if (dateMatch) {
    const day = dateMatch[1].padStart(2, '0');
    const month = MONTHS[dateMatch[2]];
    const year = dateMatch[3];
    return `${year}-${month}-${day}`;
  }

  const templateMatch = releaseLine.match(/(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/);
  if (templateMatch) {
    const day = templateMatch[1].padStart(2, '0');
    const month = MONTHS[templateMatch[2]];
    const year = templateMatch[3];
    return `${year}-${month}-${day}`;
  }

  return null;
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

// Build a set of existing image filenames for quick lookup
function getExistingImages(): Set<string> {
  const images = new Set<string>();
  if (fs.existsSync(IMAGES_DIR)) {
    for (const file of fs.readdirSync(IMAGES_DIR)) {
      images.add(file);
    }
  }
  return images;
}

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const existingImages = getExistingImages();
  console.log(`Found ${existingImages.size} existing images in public/images/`);

  const allEntries: ContentEntry[] = [];

  for (const [categoryKey, categoryTitle] of Object.entries(CATEGORIES)) {
    console.log(`\n=== Fetching ${categoryKey} (${categoryTitle}) ===`);

    console.log('Getting category members...');
    const titles = await getCategoryMembers(categoryTitle);
    console.log(`Found ${titles.length} pages`);

    console.log('Fetching wikitext...');
    const wikitexts = await batchFetchWikitext(titles);

    let parsed = 0;
    let filtered = 0;

    for (const [title, wikitext] of wikitexts) {
      const releaseDate = parseReleaseDate(wikitext);
      if (!releaseDate) continue;
      parsed++;

      const year = parseInt(releaseDate.substring(0, 4), 10);
      if (year < 2001 || year > 2009) continue;
      filtered++;

      const id = makeId(categoryKey, title);
      const webpName = `${id}.webp`;
      const hasImage = existingImages.has(webpName);

      allEntries.push({
        id,
        name: title,
        category: categoryKey,
        releaseDate,
        image: hasImage ? webpName : '',
      });
    }

    console.log(`Parsed: ${parsed}, In range (2001-2009): ${filtered}`);
  }

  // Deduplicate IDs
  const idCounts = new Map<string, number>();
  for (const entry of allEntries) {
    const count = idCounts.get(entry.id) || 0;
    idCounts.set(entry.id, count + 1);
    if (count > 0) entry.id = `${entry.id}_${count + 1}`;
  }

  console.log(`\nTotal: ${allEntries.length} entries`);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allEntries, null, 2));
  console.log(`Wrote ${OUTPUT_FILE}`);
}

main().catch(err => {
  console.error('Regeneration failed:', err);
  process.exit(1);
});
