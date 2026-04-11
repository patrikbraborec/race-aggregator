import fs from 'node:fs';
import path from 'node:path';
import type { RawScrapedItem, SourceName } from './types.js';

const ACTOR_DIR_MAP: Record<string, SourceName> = {
  'extractor-behej-com': 'behej',
  'extractor-ceskybeh-cz': 'ceskybeh',
  'extractor-svetbehu-cz': 'svetbehu',
};

export interface SourceBatch {
  source: SourceName;
  items: RawScrapedItem[];
}

/**
 * Loads all scraped items from all 3 actor dataset directories.
 * Returns items grouped by source.
 */
export function loadAllSources(servicesDir: string): SourceBatch[] {
  const batches: SourceBatch[] = [];

  for (const [dirName, source] of Object.entries(ACTOR_DIR_MAP)) {
    const datasetDir = path.join(servicesDir, dirName, 'storage', 'datasets', 'default');

    if (!fs.existsSync(datasetDir)) {
      console.warn(`[load] Dataset dir not found, skipping: ${datasetDir}`);
      continue;
    }

    const files = fs.readdirSync(datasetDir)
      .filter(f => f.endsWith('.json'))
      .sort();

    const items: RawScrapedItem[] = [];

    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(datasetDir, file), 'utf-8');
        const item = JSON.parse(raw) as RawScrapedItem;

        if (!item.title?.trim() || !item.date?.trim()) {
          console.warn(`[load] Skipping item with missing title/date in ${source}/${file}`);
          continue;
        }

        items.push(item);
      } catch (e) {
        console.warn(`[load] Failed to parse ${source}/${file}: ${e}`);
      }
    }

    console.log(`[load] ${source}: loaded ${items.length} items from ${files.length} files`);
    batches.push({ source, items });
  }

  return batches;
}
