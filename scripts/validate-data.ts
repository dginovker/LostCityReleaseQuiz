import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA_FILE = path.join(ROOT, 'src', 'data', 'content.json');
const IMAGES_DIR = path.join(ROOT, 'public', 'images');

interface ContentEntry {
  id: string;
  name: string;
  category: string;
  releaseDate: string;
  image: string;
}

const EXPECTED_CATEGORIES = ['quest', 'item', 'npc', 'location', 'minigame', 'music', 'skill'];
const MIN_ENTRIES_PER_CATEGORY: Record<string, number> = {
  quest: 10,
  item: 50,
  npc: 20,
  location: 10,
  minigame: 5,
  music: 10,
  skill: 5,
};

let errors = 0;

function fail(msg: string) {
  console.error(`FAIL: ${msg}`);
  errors++;
}

function main() {
  // Check file exists
  if (!fs.existsSync(DATA_FILE)) {
    fail(`${DATA_FILE} does not exist`);
    process.exit(1);
  }

  const entries: ContentEntry[] = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  console.log(`Loaded ${entries.length} entries`);

  // Check required fields
  for (const entry of entries) {
    if (!entry.id) fail(`Entry missing id: ${JSON.stringify(entry)}`);
    if (!entry.name) fail(`Entry missing name: ${JSON.stringify(entry)}`);
    if (!entry.category) fail(`Entry missing category: ${JSON.stringify(entry)}`);
    if (!entry.releaseDate) fail(`Entry missing releaseDate: ${JSON.stringify(entry)}`);
  }

  // Check dates in range
  for (const entry of entries) {
    const date = new Date(entry.releaseDate);
    if (isNaN(date.getTime())) {
      fail(`Invalid date "${entry.releaseDate}" for ${entry.name}`);
      continue;
    }
    const year = date.getFullYear();
    if (year < 2001 || year > 2009) {
      fail(`Date out of range ${entry.releaseDate} for ${entry.name}`);
    }
  }

  // Check no duplicate IDs
  const ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.id)) {
      fail(`Duplicate ID: ${entry.id}`);
    }
    ids.add(entry.id);
  }

  // Check image files exist
  let missingImages = 0;
  for (const entry of entries) {
    if (entry.image) {
      const imgPath = path.join(IMAGES_DIR, entry.image);
      if (!fs.existsSync(imgPath)) {
        missingImages++;
        if (missingImages <= 5) fail(`Missing image file: ${imgPath}`);
      }
    }
  }
  if (missingImages > 5) {
    fail(`... and ${missingImages - 5} more missing images`);
  }

  // Check minimum entries per category
  const categoryCounts: Record<string, number> = {};
  for (const entry of entries) {
    categoryCounts[entry.category] = (categoryCounts[entry.category] || 0) + 1;
  }

  console.log('\nCategory counts:');
  for (const cat of EXPECTED_CATEGORIES) {
    const count = categoryCounts[cat] || 0;
    const min = MIN_ENTRIES_PER_CATEGORY[cat] || 1;
    const status = count >= min ? 'OK' : 'LOW';
    console.log(`  ${cat}: ${count} (min: ${min}) [${status}]`);
    if (count < min) {
      fail(`Category ${cat} has ${count} entries, expected at least ${min}`);
    }
  }

  // Check all categories present
  for (const cat of EXPECTED_CATEGORIES) {
    if (!categoryCounts[cat]) {
      fail(`Missing category: ${cat}`);
    }
  }

  if (errors > 0) {
    console.error(`\n${errors} validation error(s) found`);
    process.exit(1);
  }

  console.log('\nAll validation checks passed!');
}

main();
