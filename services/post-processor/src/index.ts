import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load local service .env first, then repo root .env as fallback.
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

import { loadAllSources } from './load.js';
import { normalizeItem, badDateCount } from './normalize.js';
import { deduplicateItems } from './dedup.js';
import { mergeGroup } from './merge.js';
import { assignSlugs } from './transform.js';
import { pushToSupabase } from './push.js';
import type { NormalizedItem } from './types.js';

async function main() {
  const servicesDir = path.resolve(__dirname, '../..');
  const shouldPush = process.argv.includes('--push');

  console.log('=== Race Post-Processor ===\n');

  // 1. Load raw data from all 3 actor datasets
  console.log('[1/6] Loading raw data...');
  const sources = loadAllSources(servicesDir);
  const totalRaw = sources.reduce((sum, s) => sum + s.items.length, 0);
  console.log(`  Total raw items: ${totalRaw}\n`);

  // 2. Normalize each item
  console.log('[2/6] Normalizing...');
  const normalized: NormalizedItem[] = [];
  let skipped = 0;

  for (const { source, items } of sources) {
    for (const item of items) {
      const n = normalizeItem(item, source);
      if (n) {
        normalized.push(n);
      } else {
        skipped++;
      }
    }
  }
  console.log(`  Normalized: ${normalized.length}, Skipped: ${skipped} (${badDateCount} bad dates, ${skipped - badDateCount} foreign/invalid)\n`);

  // 3. Deduplicate
  console.log('[3/6] Deduplicating...');
  const groups = deduplicateItems(normalized);
  const dupeCount = normalized.length - groups.length;
  console.log(`  Unique races: ${groups.length} (merged ${dupeCount} duplicates)\n`);

  // 4. Merge each group
  console.log('[4/6] Merging...');
  const merged = groups.map(g => mergeGroup(g));
  console.log(`  Merged: ${merged.length} races\n`);

  // 5. Deduplicate official_url — series websites shared by multiple races
  //    can't be unique per race, so nullify them
  const urlCounts = new Map<string, number>();
  for (const r of merged) {
    if (r.official_url) {
      urlCounts.set(r.official_url, (urlCounts.get(r.official_url) ?? 0) + 1);
    }
  }
  let nullifiedUrls = 0;
  for (const r of merged) {
    if (r.official_url && (urlCounts.get(r.official_url) ?? 0) > 1) {
      r.official_url = null;
      nullifiedUrls++;
    }
  }
  if (nullifiedUrls > 0) {
    console.log(`  Nullified ${nullifiedUrls} shared series URLs\n`);
  }

  // 6. Assign slugs
  console.log('[5/6] Generating slugs...');
  const races = assignSlugs(merged);
  console.log(`  Slugs assigned: ${races.length}\n`);

  // 6. Write output
  const outputDir = path.resolve(__dirname, '..', 'output');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, 'races.json');
  fs.writeFileSync(outputPath, JSON.stringify(races, null, 2));
  console.log(`[6/6] Wrote ${races.length} races to ${outputPath}\n`);

  // Stats summary
  printStats(races);

  // Optional: push to Supabase
  if (shouldPush) {
    console.log('\n[push] Pushing to Supabase...');
    await pushToSupabase(races);
  } else {
    console.log('\nTip: Run with --push to upsert to Supabase');
  }
}

function printStats(races: ReturnType<typeof assignSlugs>) {
  console.log('--- Stats ---');
  console.log(`Total races: ${races.length}`);

  // Terrain distribution
  const terrainCounts: Record<string, number> = {};
  for (const r of races) {
    terrainCounts[r.terrain] = (terrainCounts[r.terrain] ?? 0) + 1;
  }
  console.log('Terrain:', Object.entries(terrainCounts).sort((a, b) => b[1] - a[1]).map(([t, c]) => `${t}=${c}`).join(', '));

  // Source distribution
  const sourceCounts: Record<string, number> = {};
  for (const r of races) {
    for (const s of r.source.split(',')) {
      sourceCounts[s] = (sourceCounts[s] ?? 0) + 1;
    }
  }
  console.log('Sources:', Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]).map(([s, c]) => `${s}=${c}`).join(', '));

  // Multi-source races
  const multiSource = races.filter(r => r.source.includes(','));
  console.log(`Multi-source races (deduped across sites): ${multiSource.length}`);

  // With/without official_url
  const withUrl = races.filter(r => r.official_url);
  console.log(`With official URL: ${withUrl.length}, Without: ${races.length - withUrl.length}`);

  // With prices
  const withPrice = races.filter(r => r.price_from !== null);
  console.log(`With pricing info: ${withPrice.length}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
