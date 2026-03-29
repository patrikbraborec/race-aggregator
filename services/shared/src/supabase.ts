import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { RaceInput } from './types.js';

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
  }

  client = createClient(url, key);
  return client;
}

const BATCH_SIZE = 50;

/**
 * Upload races to Supabase with upsert (deduplication on slug).
 * Batches in chunks of 50 to avoid payload limits.
 */
export async function uploadRaces(races: RaceInput[]): Promise<{ inserted: number; errors: number }> {
  const supabase = getSupabaseClient();
  let inserted = 0;
  let errors = 0;

  // Filter out past races — only upload races happening today or later
  const today = new Date().toISOString().slice(0, 10);
  const future = races.filter((r) => r.date_start >= today);
  const pastSkipped = races.length - future.length;
  if (pastSkipped > 0) {
    console.log(`Skipped ${pastSkipped} past races (before ${today}).`);
  }

  // Deduplicate within batch by slug (keep last occurrence)
  const bySlug = new Map<string, RaceInput>();
  for (const race of future) {
    bySlug.set(race.slug, race);
  }
  const deduplicated = Array.from(bySlug.values());

  console.log(`Uploading ${deduplicated.length} races (${future.length - deduplicated.length} intra-batch duplicates removed)...`);

  for (let i = 0; i < deduplicated.length; i += BATCH_SIZE) {
    const batch = deduplicated.slice(i, i + BATCH_SIZE);

    const { data, error } = await supabase
      .from('races')
      .upsert(batch, { onConflict: 'slug', ignoreDuplicates: true })
      .select('slug');

    if (error) {
      console.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, error.message);
      errors += batch.length;
    } else {
      inserted += data.length;
      console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${data.length} races upserted`);
    }
  }

  console.log(`Upload complete: ${inserted} inserted/updated, ${errors} errors`);
  return { inserted, errors };
}
