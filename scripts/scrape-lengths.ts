import fs from 'node:fs';
import path from 'node:path';

const API_URL = 'https://runescape.wiki/api.php';
const USER_AGENT = 'LostCityQuiz/1.0 (RuneScape timeline quiz; scraping release dates and thumbnails)';
const API_DELAY_MS = 500;
const FETCH_TIMEOUT_MS = 15000;

const ROOT = path.resolve(import.meta.dirname, '..');
const CONTENT_FILE = path.join(ROOT, 'src', 'data', 'content.json');

interface ContentEntry {
  id: string;
  name: string;
  category: string;
  releaseDate: string;
  image: string;
  wikiLength?: number;
}

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

async function main() {
  const entries: ContentEntry[] = JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf-8'));
  console.log(`Loaded ${entries.length} entries from content.json`);

  // Collect unique titles
  const uniqueTitles = [...new Set(entries.map(e => e.name))];
  console.log(`Unique wiki titles: ${uniqueTitles.length}`);

  console.log('Fetching wikitext...');
  const wikitexts = await batchFetchWikitext(uniqueTitles);
  console.log(`Got wikitext for ${wikitexts.size}/${uniqueTitles.length} pages`);

  // Assign wikiLength to each entry
  let assigned = 0;
  for (const entry of entries) {
    const wikitext = wikitexts.get(entry.name);
    entry.wikiLength = wikitext ? wikitext.length : 0;
    if (entry.wikiLength > 0) assigned++;
  }

  console.log(`Assigned wikiLength > 0 to ${assigned}/${entries.length} entries`);

  fs.writeFileSync(CONTENT_FILE, JSON.stringify(entries, null, 2));
  console.log(`Wrote ${CONTENT_FILE}`);
}

main().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
